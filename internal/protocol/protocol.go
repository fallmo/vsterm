// Package protocol defines the requests exchanged between the vsterm CLI and
// the VS Code extension. The extension mirrors these types in TypeScript, so
// any change here must be made there too.
package protocol

// SocketEnv is the environment variable the extension sets in each window's
// integrated terminals, pointing at that window's socket.
const SocketEnv = "VSTERM_SOCK"

// OpenPath is the HTTP endpoint that opens a named terminal.
const OpenPath = "/v1/open"

// OpenRequest asks the extension to open a terminal. An existing terminal with
// the same name is replaced.
type OpenRequest struct {
	Name    string `json:"name"`
	Command string `json:"command,omitempty"`
	Cwd     string `json:"cwd,omitempty"`
	Focus   bool   `json:"focus,omitempty"`
	// Group splits the terminal next to another terminal of the same group,
	// or opens a new tab if the group has none.
	Group string `json:"group,omitempty"`
	// Color is one of Colors.
	Color string `json:"color,omitempty"`
	// Env is added to the terminal's inherited environment.
	Env map[string]string `json:"env,omitempty"`
}

// Colors are the accepted OpenRequest.Color values. The extension maps each to
// the theme color terminal.ansi<Color>.
var Colors = []string{"black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"}

// ErrorResponse is the body returned with a non-2xx status.
type ErrorResponse struct {
	Error string `json:"error"`
}

// ClosePath is the HTTP endpoint that closes terminals opened by vsterm.
const ClosePath = "/v1/close"

// CloseRequest selects vsterm terminals to close with exactly one of Names,
// Group or All. Unless Force is set, each running command is sent Ctrl+C and
// given up to TimeoutMs to exit before its terminal is closed.
type CloseRequest struct {
	Names     []string `json:"names,omitempty"`
	Group     string   `json:"group,omitempty"`
	All       bool     `json:"all,omitempty"`
	Force     bool     `json:"force,omitempty"`
	TimeoutMs int      `json:"timeoutMs,omitempty"`
}

// CloseResponse lists the names of the terminals that were closed.
type CloseResponse struct {
	Closed []string `json:"closed"`
}
