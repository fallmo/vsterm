package cli

import (
	"maps"
	"os"
	"path/filepath"
	"testing"
)

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

func TestParseEnv(t *testing.T) {
	got, err := parseEnv([]string{"PORT=3001", "URL=http://x?a=b,c", "EMPTY=", "PORT=4000"})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"PORT": "4000", "URL": "http://x?a=b,c", "EMPTY": ""}
	if !maps.Equal(got, want) {
		t.Errorf("parseEnv = %v, want %v", got, want)
	}

	if got, err := parseEnv(nil); got != nil || err != nil {
		t.Errorf("parseEnv(nil) = %v, %v, want nil, nil", got, err)
	}
	for _, bad := range []string{"NOEQUALS", "=value"} {
		if _, err := parseEnv([]string{bad}); err == nil {
			t.Errorf("parseEnv(%q): want error", bad)
		}
	}
}

func TestResolveCwd(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	// Compare against Getwd, not dir: on macOS the temp dir may be reached via a symlink.
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		cwd  string
		want string
	}{
		{"", wd},
		{".", wd},
		{"web", filepath.Join(wd, "web")},
		{"./services/api", filepath.Join(wd, "services", "api")},
		{"../other", filepath.Join(filepath.Dir(wd), "other")},
		{"/abs/path", "/abs/path"},
	}
	for _, tt := range tests {
		t.Run(tt.cwd, func(t *testing.T) {
			got, err := resolveCwd(tt.cwd)
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Errorf("resolveCwd(%q) = %q, want %q", tt.cwd, got, tt.want)
			}
		})
	}
}
