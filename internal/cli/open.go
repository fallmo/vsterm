package cli

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/fallmo/vsterm/internal/client"
	"github.com/fallmo/vsterm/internal/protocol"
	"github.com/spf13/cobra"
)

func newOpenCmd() *cobra.Command {
	var (
		req protocol.OpenRequest
		env []string
	)

	cmd := &cobra.Command{
		Use:   "open --name NAME [flags] [-- COMMAND [ARGS...]]",
		Short: "Open a named terminal in the current VS Code window, optionally running a command",
		Long: `Open a named terminal in the current VS Code window, optionally running a command.

An existing terminal with the same name is replaced, so re-running acts as a restart.

A single argument is sent as-is, so it may contain shell syntax:
  vsterm open --name api -- 'npm run dev | tee api.log'
Multiple arguments are shell-quoted individually:
  vsterm open --name api -- make run-service-a

Terminals with the same --group are shown side by side as split panes.`,
		Example: `  vsterm open --name service-a -- make run-service-a
  vsterm open --name web --cwd ./web --focus -- npm run dev
  vsterm open -n api --group backend --color green --env PORT=3001 -- make run-api`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if req.Color != "" && !slices.Contains(protocol.Colors, req.Color) {
				return fmt.Errorf("invalid --color %q (valid: %s)", req.Color, strings.Join(protocol.Colors, ", "))
			}
			var err error
			if req.Env, err = parseEnv(env); err != nil {
				return err
			}
			req.Command = joinCommand(args)
			if req.Cwd, err = resolveCwd(req.Cwd); err != nil {
				return err
			}
			c, err := client.FromEnv()
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(cmd.Context(), 10*time.Second)
			defer cancel()
			return c.Open(ctx, req)
		},
	}

	cmd.Flags().StringVarP(&req.Name, "name", "n", "", "terminal name (required)")
	cmd.Flags().StringVar(&req.Cwd, "cwd", "", "working directory (default: current directory)")
	cmd.Flags().BoolVar(&req.Focus, "focus", false, "switch to the new terminal")
	cmd.Flags().StringVarP(&req.Group, "group", "g", "", "split next to other terminals in this group")
	cmd.Flags().StringVar(&req.Color, "color", "", "tab color: "+strings.Join(protocol.Colors, ", ")+" (default: blue)")
	// StringArray, not StringSlice: values may contain commas.
	cmd.Flags().StringArrayVarP(&env, "env", "e", nil, "environment variable KEY=VALUE (repeatable)")
	_ = cmd.MarkFlagRequired("name")
	_ = cmd.RegisterFlagCompletionFunc("color", cobra.FixedCompletions(protocol.Colors, cobra.ShellCompDirectiveNoFileComp))

	return cmd
}

// resolveCwd makes cwd absolute relative to the current directory, defaulting to
// the current directory itself. The extension host runs elsewhere, so it can't
// resolve relative paths.
func resolveCwd(cwd string) (string, error) {
	if cwd == "" {
		return os.Getwd()
	}
	return filepath.Abs(cwd)
}

// parseEnv turns KEY=VALUE pairs into a map. Later pairs override earlier ones.
func parseEnv(pairs []string) (map[string]string, error) {
	if len(pairs) == 0 {
		return nil, nil
	}
	env := make(map[string]string, len(pairs))
	for _, p := range pairs {
		k, v, ok := strings.Cut(p, "=")
		if !ok || k == "" {
			return nil, fmt.Errorf("invalid --env %q (want KEY=VALUE)", p)
		}
		env[k] = v
	}
	return env, nil
}

// joinCommand turns args into a single command line for the terminal's shell.
func joinCommand(args []string) string {
	if len(args) == 1 {
		return args[0]
	}
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = shellQuote(a)
	}
	return strings.Join(quoted, " ")
}

var safeArg = regexp.MustCompile(`^[A-Za-z0-9_@%+=:,./-]+$`)

// shellQuote quotes s for POSIX shells.
func shellQuote(s string) string {
	if safeArg.MatchString(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
