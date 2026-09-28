import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SOCKET_ENV, CloseRequest, CloseResponse, OpenRequest } from './protocol';
import { createServer, HttpError } from './server';

let log: vscode.LogOutputChannel;

/** Terminals currently running a command, as reported by shell integration. */
const running = new Set<vscode.Terminal>();

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel('vsterm', { log: true });
  context.subscriptions.push(
    log,
    vscode.window.onDidStartTerminalShellExecution((e) => running.add(e.terminal)),
    vscode.window.onDidEndTerminalShellExecution((e) => running.delete(e.terminal)),
    vscode.window.onDidCloseTerminal((t) => running.delete(t)),
  );

  // One socket per window. Each window's terminals get their own window's
  // socket path, so `vsterm` always targets the window it runs in.
  const sock = path.join(os.tmpdir(), `vsterm-${crypto.randomBytes(6).toString('hex')}.sock`);

  const server = createServer({ open: openTerminal, close: closeTerminals });
  server.on('error', (err) => {
    vscode.window.showErrorMessage(`vsterm: could not listen on ${sock}: ${err.message}`);
  });
  server.listen(sock, () => {
    // The socket runs commands, so only this user may connect.
    fs.chmodSync(sock, 0o600);
    log.info(`listening on ${sock}`);
  });

  const env = context.environmentVariableCollection;
  // The socket path changes on every activation, so don't restore a stale one.
  env.persistent = false;
  env.description = 'Enables the `vsterm` command in this window';
  env.replace(SOCKET_ENV, sock);

  // Release builds bundle the CLI in bin/; put it on the terminals' PATH.
  const binDir = context.asAbsolutePath('bin');
  const binPath = path.join(binDir, process.platform === 'win32' ? 'vsterm.exe' : 'vsterm');
  if (fs.existsSync(binPath)) {
    // Packaging can drop the executable bit.
    if (process.platform !== 'win32') {
      fs.chmodSync(binPath, 0o755);
    }
    env.prepend('PATH', binDir + path.delimiter);
  }

  context.subscriptions.push({
    dispose: () => {
      server.close();
      fs.rmSync(sock, { force: true });
    },
  });
}

export function deactivate(): void {}

function openTerminal(req: OpenRequest): void {
  if (req.cwd !== undefined && !fs.existsSync(req.cwd)) {
    throw new HttpError(400, `cwd does not exist: ${req.cwd}`);
  }

  log.info(`open ${JSON.stringify(req)}`);
  log.info(`terminals: ${vscode.window.terminals.map((t) => `${t.name} (group ${groupOf(t) ?? 'none'})`).join(', ')}`);

  // Existing terminals of the same name are replaced, so re-running restarts them.
  const replaced = vscode.window.terminals.filter((t) => t.name === req.name);

  // Pick the split parent before disposing: a disposed terminal lingers in
  // `window.terminals` until it has actually closed.
  const parentTerminal = req.group
    ? vscode.window.terminals.find((t) => !replaced.includes(t) && groupOf(t) === req.group)
    : undefined;

  if (req.group) {
    log.info(`group ${req.group}: ${parentTerminal ? `splitting from ${parentTerminal.name}` : 'no other member, opening new tab'}`);
  }

  for (const t of replaced) {
    t.dispose();
  }

  // MANAGED_ENV marks the terminal as vsterm's, so `close` never touches others.
  const env: Record<string, string> = { ...req.env, [MANAGED_ENV]: '1' };
  if (req.group) {
    // Stored on the terminal itself so group membership needs no extension state.
    env[GROUP_ENV] = req.group;
  }

  const terminal = vscode.window.createTerminal({
    name: req.name,
    cwd: req.cwd,
    env,
    color: req.color && new vscode.ThemeColor(`terminal.ansi${capitalize(req.color)}`),
    location: parentTerminal && { parentTerminal },
  });
  if (req.command) {
    terminal.sendText(req.command);
  }
  if (req.focus) {
    terminal.show(false);
  }
}

async function closeTerminals(req: CloseRequest): Promise<CloseResponse> {
  log.info(`close ${JSON.stringify(req)}`);

  // Terminals that have already exited may linger in `window.terminals`.
  const managed = vscode.window.terminals.filter((t) => envOf(t)[MANAGED_ENV] === '1' && t.exitStatus === undefined);
  let targets: vscode.Terminal[];
  if (req.names) {
    const missing = req.names.filter((n) => !managed.some((t) => t.name === n));
    if (missing.length > 0) {
      throw new HttpError(404, `no vsterm terminal named ${missing.join(', ')}`);
    }
    targets = managed.filter((t) => req.names!.includes(t.name));
  } else if (req.group) {
    targets = managed.filter((t) => groupOf(t) === req.group);
  } else {
    targets = managed;
  }

  await Promise.all(targets.map((t) => closeTerminal(t, req.force ?? false, req.timeoutMs!)));
  return { closed: targets.map((t) => t.name) };
}

/** Sends Ctrl+C and waits for the command to stop (unless forced), then closes the terminal. */
async function closeTerminal(terminal: vscode.Terminal, force: boolean, timeoutMs: number): Promise<void> {
  // With shell integration we know whether a command is running; without it
  // we can't tell, so interrupt and wait anyway.
  const idle = terminal.shellIntegration !== undefined && !running.has(terminal);
  if (!force && !idle) {
    const stopped = waitForStop(terminal, timeoutMs);
    terminal.sendText('\x03', false);
    if (!(await stopped)) {
      log.info(`${terminal.name}: still running after ${timeoutMs}ms, closing anyway`);
    }
  }
  terminal.dispose();
}

/** Resolves true when the terminal's command ends or it closes, false on timeout. */
function waitForStop(terminal: vscode.Terminal, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (stopped: boolean) => {
      clearTimeout(timer);
      subscriptions.forEach((d) => d.dispose());
      resolve(stopped);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    const subscriptions = [
      vscode.window.onDidEndTerminalShellExecution((e) => e.terminal === terminal && done(true)),
      vscode.window.onDidCloseTerminal((t) => t === terminal && done(true)),
    ];
  });
}

/** Environment variable marking terminals opened by vsterm. */
const MANAGED_ENV = 'VSTERM';

/** Environment variable recording a terminal's group. */
const GROUP_ENV = 'VSTERM_GROUP';

function envOf(terminal: vscode.Terminal): Record<string, string | null | undefined> {
  const options = terminal.creationOptions;
  return ('env' in options && options.env) || {};
}

function groupOf(terminal: vscode.Terminal): string | undefined {
  return envOf(terminal)[GROUP_ENV] ?? undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
