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
  /** Split next to another terminal of this group, or open a new tab if it has none. */
  group?: string;
  color?: Color;
  /** Added to the terminal's inherited environment. */
  env?: Record<string, string>;
}

/** Accepted colors; each maps to the theme color `terminal.ansi<Color>`. */
export const COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
export type Color = (typeof COLORS)[number];

/** Body returned with a non-2xx status. */
export interface ErrorResponse {
  error: string;
}
