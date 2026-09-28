package client

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/fallmo/vsterm/internal/protocol"
)

// serve starts an HTTP server on a Unix socket and returns its path.
func serve(t *testing.T, h http.HandlerFunc) string {
	t.Helper()
	// t.TempDir() paths can exceed the macOS socket path limit (104 bytes).
	dir, err := os.MkdirTemp("", "vst")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	sock := filepath.Join(dir, "s.sock")

	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: h}
	go srv.Serve(ln)
	t.Cleanup(func() { srv.Close() })
	return sock
}

func TestOpen(t *testing.T) {
	var got protocol.OpenRequest
	sock := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != protocol.OpenPath {
			t.Errorf("got %s %s, want POST %s", r.Method, r.URL.Path, protocol.OpenPath)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Error(err)
		}
	})

	want := protocol.OpenRequest{
		Name: "api", Command: `echo "hi"`, Cwd: "/src", Focus: true,
		Group: "backend", Color: "green", Env: map[string]string{"PORT": "3001"},
	}
	if err := New(sock).Open(context.Background(), want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("server got %+v, want %+v", got, want)
	}
}

func TestOpenError(t *testing.T) {
	sock := serve(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorResponse{Error: "name is required"})
	})

	err := New(sock).Open(context.Background(), protocol.OpenRequest{})
	if err == nil || !strings.Contains(err.Error(), "name is required") {
		t.Fatalf("got %v, want error containing %q", err, "name is required")
	}
}

func TestFromEnv(t *testing.T) {
	t.Setenv(protocol.SocketEnv, "")
	if _, err := FromEnv(); !errors.Is(err, ErrNoSocket) {
		t.Errorf("unset: got %v, want ErrNoSocket", err)
	}

	t.Setenv(protocol.SocketEnv, "/nonexistent/vsterm.sock")
	if _, err := FromEnv(); err == nil || !strings.Contains(err.Error(), "unavailable") {
		t.Errorf("missing socket: got %v, want unavailable error", err)
	}
}
