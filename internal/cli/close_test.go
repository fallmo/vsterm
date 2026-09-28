package cli

import (
	"strings"
	"testing"

	"github.com/fallmo/vsterm/internal/protocol"
)

func TestCloseValidation(t *testing.T) {
	// Validation runs before the socket is contacted, so no extension is needed.
	t.Setenv(protocol.SocketEnv, "")
	tests := []struct {
		args []string
		want string
	}{
		{[]string{"close"}, "exactly one of"},
		{[]string{"close", "api", "--group", "backend"}, "exactly one of"},
		{[]string{"close", "--group", "backend", "--all"}, "exactly one of"},
		{[]string{"close", "--all", "--timeout", "0s"}, "--timeout must be"},
		{[]string{"close", "--all", "--timeout", "2m"}, "--timeout must be"},
		// Valid selectors get as far as looking for the socket.
		{[]string{"close", "api", "worker"}, protocol.SocketEnv},
		{[]string{"close", "--group", "backend"}, protocol.SocketEnv},
		{[]string{"close", "--all", "--force"}, protocol.SocketEnv},
	}
	for _, tt := range tests {
		t.Run(strings.Join(tt.args, " "), func(t *testing.T) {
			root := NewRootCmd()
			root.SetArgs(tt.args)
			err := root.Execute()
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("got %v, want error containing %q", err, tt.want)
			}
		})
	}
}
