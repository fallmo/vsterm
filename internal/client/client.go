// Package client talks to the vsterm VS Code extension over its Unix socket.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/fallmo/vsterm/internal/protocol"
)

// ErrNoSocket is returned when the CLI is not running inside a VS Code
// terminal that has the extension's socket in its environment.
var ErrNoSocket = errors.New("not inside a VS Code terminal with the vsterm extension (" + protocol.SocketEnv + " is not set)")

type Client struct {
	http *http.Client
}

// FromEnv returns a client for the socket named by protocol.SocketEnv.
func FromEnv() (*Client, error) {
	sock := os.Getenv(protocol.SocketEnv)
	if sock == "" {
		return nil, ErrNoSocket
	}
	if _, err := os.Stat(sock); err != nil {
		return nil, fmt.Errorf("socket %s is unavailable (was the VS Code window closed or reloaded? open a new terminal): %w", sock, err)
	}
	return New(sock), nil
}

// New returns a client for the given socket path.
func New(sock string) *Client {
	return &Client{
		http: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					var d net.Dialer
					return d.DialContext(ctx, "unix", sock)
				},
			},
		},
	}
}

// Open asks the extension to open a named terminal.
func (c *Client) Open(ctx context.Context, req protocol.OpenRequest) error {
	return c.post(ctx, protocol.OpenPath, req)
}

func (c *Client) post(ctx context.Context, path string, body any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	// The host is ignored; the transport always dials the socket.
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://vsterm"+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return fmt.Errorf("contacting VS Code extension: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	raw, _ := io.ReadAll(resp.Body)
	var errResp protocol.ErrorResponse
	if json.Unmarshal(raw, &errResp) == nil && errResp.Error != "" {
		return fmt.Errorf("extension: %s", errResp.Error)
	}
	return fmt.Errorf("extension: %s: %s", resp.Status, bytes.TrimSpace(raw))
}
