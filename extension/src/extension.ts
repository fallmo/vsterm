import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SOCKET_ENV, OpenRequest } from './protocol';
import { createServer, HttpError } from './server';

export function activate(context: vscode.ExtensionContext): void {
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

  // Replace an existing terminal of the same name, so re-running restarts it.
  for (const t of vscode.window.terminals) {
    if (t.name === req.name) {
      t.dispose();
    }
  }

  const terminal = vscode.window.createTerminal({ name: req.name, cwd: req.cwd });
  if (req.command) {
    terminal.sendText(req.command);
  }
  if (req.focus) {
    terminal.show(false);
  }
}
