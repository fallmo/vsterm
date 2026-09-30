import { execFile } from 'node:child_process';

/**
 * Reports whether the process has any child processes. A shell with no
 * children isn't running a command. Returns undefined when it can't tell.
 */
export function hasChildProcesses(pid: number): Promise<boolean | undefined> {
  if (process.platform === 'win32') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    execFile('pgrep', ['-P', String(pid)], (err) => {
      if (!err) {
        resolve(true);
      } else {
        // pgrep exits 1 when nothing matched; anything else is a failure.
        resolve(err.code === 1 ? false : undefined);
      }
    });
  });
}
