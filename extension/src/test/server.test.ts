import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { OPEN_PATH, OpenRequest } from '../protocol';
import { createServer, HttpError } from '../server';

const sock = path.join(os.tmpdir(), `vsterm-test-${process.pid}.sock`);
const opened: OpenRequest[] = [];

const server = createServer({
  open(req) {
    if (req.name === 'fail') {
      throw new HttpError(400, 'cwd does not exist: /nope');
    }
    if (req.name === 'crash') {
      throw new Error('boom');
    }
    opened.push(req);
  },
});

before(() => new Promise<void>((resolve) => server.listen(sock, resolve)));
after(() => {
  server.close();
  fs.rmSync(sock, { force: true });
});

function request(method: string, urlPath: string, body?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: sock, method, path: urlPath }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('opens a terminal', async () => {
  const req: OpenRequest = {
    name: 'api',
    command: 'make run',
    cwd: '/src',
    focus: true,
    group: 'backend',
    color: 'green',
    env: { PORT: '3001', URL: 'http://x?a=b,c' },
  };
  const res = await request('POST', OPEN_PATH, JSON.stringify(req));
  assert.equal(res.status, 200);
  assert.deepEqual(opened.at(-1), req);
});

test('rejects invalid requests', async () => {
  const cases: [string, number, string][] = [
    ['not json', 400, 'invalid JSON body'],
    ['[]', 400, 'body must be a JSON object'],
    ['{}', 400, 'name is required'],
    ['{"name":"a","command":1}', 400, 'command must be a string'],
    ['{"name":"a","focus":"yes"}', 400, 'focus must be a boolean'],
    ['{"name":"a","group":1}', 400, 'group must be a string'],
    ['{"name":"a","color":"pink"}', 400, 'color must be one of: black, red, green, yellow, blue, magenta, cyan, white'],
    ['{"name":"a","env":{"PORT":3001}}', 400, 'env must be an object of string values'],
    ['{"name":"a","env":{"A=B":"c"}}', 400, 'env must be an object of string values'],
    ['{"name":"a","env":["PORT=1"]}', 400, 'env must be an object of string values'],
  ];
  for (const [body, status, error] of cases) {
    const res = await request('POST', OPEN_PATH, body);
    assert.equal(res.status, status, body);
    assert.equal(res.body.error, error, body);
  }
});

test('rejects unknown endpoints and methods', async () => {
  assert.equal((await request('POST', '/v1/nope', '{}')).status, 404);
  assert.equal((await request('GET', OPEN_PATH)).status, 405);
});

test('returns handler errors', async () => {
  const bad = await request('POST', OPEN_PATH, '{"name":"fail"}');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'cwd does not exist: /nope');

  const crash = await request('POST', OPEN_PATH, '{"name":"crash"}');
  assert.equal(crash.status, 500);
  assert.equal(crash.body.error, 'boom');
});
