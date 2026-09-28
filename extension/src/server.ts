import * as http from 'node:http';
import {
  CLOSE_PATH,
  COLORS,
  CloseRequest,
  CloseResponse,
  Color,
  DEFAULT_CLOSE_TIMEOUT_MS,
  ErrorResponse,
  MAX_CLOSE_TIMEOUT_MS,
  OPEN_PATH,
  OpenRequest,
} from './protocol';

const MAX_BODY_BYTES = 1 << 20;

/** Actions the server performs; implemented with the VS Code API in extension.ts. */
export interface Handlers {
  open(req: OpenRequest): void | Promise<void>;
  close(req: CloseRequest): CloseResponse | Promise<CloseResponse>;
}

/** An error whose message is safe to return to the client with the given status. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createServer(handlers: Handlers): http.Server {
  const routes: Record<string, (body: unknown) => Promise<unknown>> = {
    [OPEN_PATH]: async (body) => {
      await handlers.open(parseOpenRequest(body));
      return {};
    },
    [CLOSE_PATH]: async (body) => handlers.close(parseCloseRequest(body)),
  };

  return http.createServer(async (req, res) => {
    try {
      const route = Object.hasOwn(routes, req.url ?? '') ? routes[req.url!] : undefined;
      if (!route) {
        throw new HttpError(404, `unknown endpoint ${req.url}`);
      }
      if (req.method !== 'POST') {
        throw new HttpError(405, `method ${req.method} not allowed`);
      }
      send(res, 200, await route(await readJson(req)));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const body: ErrorResponse = { error: err instanceof Error ? err.message : String(err) };
      send(res, status, body);
    }
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'request body too large');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}

export function parseOpenRequest(body: unknown): OpenRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'body must be a JSON object');
  }
  const { name, command, cwd, focus, group, color, env } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name === '') {
    throw new HttpError(400, 'name is required');
  }
  if (command !== undefined && typeof command !== 'string') {
    throw new HttpError(400, 'command must be a string');
  }
  if (cwd !== undefined && typeof cwd !== 'string') {
    throw new HttpError(400, 'cwd must be a string');
  }
  if (focus !== undefined && typeof focus !== 'boolean') {
    throw new HttpError(400, 'focus must be a boolean');
  }
  if (group !== undefined && typeof group !== 'string') {
    throw new HttpError(400, 'group must be a string');
  }
  if (color !== undefined && !COLORS.includes(color as Color)) {
    throw new HttpError(400, `color must be one of: ${COLORS.join(', ')}`);
  }
  if (env !== undefined && !isStringRecord(env)) {
    throw new HttpError(400, 'env must be an object of string values');
  }
  return { name, command, cwd, focus, group: group || undefined, color: color as Color | undefined, env };
}

export function parseCloseRequest(body: unknown): CloseRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'body must be a JSON object');
  }
  const { names, group, all, force, timeoutMs } = body as Record<string, unknown>;
  if (names !== undefined && !(Array.isArray(names) && names.every((n) => typeof n === 'string' && n !== ''))) {
    throw new HttpError(400, 'names must be an array of non-empty strings');
  }
  if (group !== undefined && typeof group !== 'string') {
    throw new HttpError(400, 'group must be a string');
  }
  if (all !== undefined && typeof all !== 'boolean') {
    throw new HttpError(400, 'all must be a boolean');
  }
  if (force !== undefined && typeof force !== 'boolean') {
    throw new HttpError(400, 'force must be a boolean');
  }
  if (
    timeoutMs !== undefined &&
    !(Number.isInteger(timeoutMs) && (timeoutMs as number) > 0 && (timeoutMs as number) <= MAX_CLOSE_TIMEOUT_MS)
  ) {
    throw new HttpError(400, `timeoutMs must be an integer between 1 and ${MAX_CLOSE_TIMEOUT_MS}`);
  }
  const selectors = [(names as string[] | undefined)?.length, group, all].filter(Boolean).length;
  if (selectors !== 1) {
    throw new HttpError(400, 'specify exactly one of names, group or all');
  }
  return {
    names: names as string[] | undefined,
    group: group || undefined,
    all: all || undefined,
    force: force ?? false,
    timeoutMs: (timeoutMs as number | undefined) ?? DEFAULT_CLOSE_TIMEOUT_MS,
  };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.entries(v).every(([k, val]) => k !== '' && !k.includes('=') && typeof val === 'string')
  );
}
