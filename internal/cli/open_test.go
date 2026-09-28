package cli

import "testing"

func TestJoinCommand(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{"none", nil, ""},
		{"single arg passed as-is", []string{"npm run dev | tee log"}, "npm run dev | tee log"},
		{"safe args", []string{"make", "run-service-a"}, "make run-service-a"},
		{"spaces", []string{"echo", "hello world"}, "echo 'hello world'"},
		{"single quote", []string{"echo", "it's"}, `echo 'it'\''s'`},
		{"empty arg", []string{"printf", ""}, "printf ''"},
		{"shell metachars", []string{"echo", "$HOME", "a;b"}, "echo '$HOME' 'a;b'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := joinCommand(tt.args); got != tt.want {
				t.Errorf("joinCommand(%q) = %q, want %q", tt.args, got, tt.want)
			}
		})
	}
}
