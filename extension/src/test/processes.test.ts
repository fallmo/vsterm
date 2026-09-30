import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { hasChildProcesses } from '../processes';

test('hasChildProcesses', { skip: process.platform === 'win32' }, async () => {
  const shell = spawn('/bin/sh', ['-c', 'sleep 30 & wait'], { stdio: 'ignore' });
  try {
    // Give the shell a moment to start sleep.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await hasChildProcesses(shell.pid!), true);

    const idle = spawn('/bin/sh', ['-c', 'exec sleep 30'], { stdio: 'ignore' });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await hasChildProcesses(idle.pid!), false);
    } finally {
      idle.kill();
    }
  } finally {
    // Killing the shell would orphan its sleep, so kill that first.
    spawn('pkill', ['-P', String(shell.pid)]);
    shell.kill();
  }
});
