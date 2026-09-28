// Mirrors internal/protocol/protocol.go. Keep the two in sync.

/** Environment variable pointing each window's terminals at its socket. */
export const SOCKET_ENV = 'VSTERM_SOCK';

/** HTTP endpoint that opens a named terminal. */
export const OPEN_PATH = '/v1/open';

/** Asks the extension to open a terminal, replacing any with the same name. */
export interface OpenRequest {
  name: string;
  command?: string;
  cwd?: string;
  focus?: boolean;
}

/** Body returned with a non-2xx status. */
export interface ErrorResponse {
  error: string;
}
