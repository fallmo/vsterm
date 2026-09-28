import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SOCKET_ENV, OpenRequest } from './protocol';
import { createServer, HttpError } from './server';

let log: vscode.LogOutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel('vsterm', { log: true });
  context.subscriptions.push(log);

  // One socket per window. Each window's terminals get their own window's
  // socket path, so `vsterm` always targets the window it runs in.
  const sock = path.join(os.tmpdir(), `vsterm-${crypto.randomBytes(6).toString('hex')}.sock`);

  const server = createServer({ open: openTerminal });
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

  const env: Record<string, string> = { ...req.env };
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

/** Environment variable recording a terminal's group. */
const GROUP_ENV = 'VSTERM_GROUP';

function groupOf(terminal: vscode.Terminal): string | undefined {
  const options = terminal.creationOptions;
  return 'env' in options ? options.env?.[GROUP_ENV] ?? undefined : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
