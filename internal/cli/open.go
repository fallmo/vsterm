package cli

import (
	"os"
	"regexp"
	"strings"

	"github.com/fallmo/vsterm/internal/client"
	"github.com/fallmo/vsterm/internal/protocol"
	"github.com/spf13/cobra"
)

func newOpenCmd() *cobra.Command {
	var req protocol.OpenRequest

	cmd := &cobra.Command{
		Use:   "open --name NAME [flags] [-- COMMAND [ARGS...]]",
		Short: "Open a named terminal in the current VS Code window, optionally running a command",
		Long: `Open a named terminal in the current VS Code window, optionally running a command.

An existing terminal with the same name is replaced, so re-running acts as a restart.

A single argument is sent as-is, so it may contain shell syntax:
  vsterm open --name api -- 'npm run dev | tee api.log'
Multiple arguments are shell-quoted individually:
  vsterm open --name api -- make run-service-a`,
		Example: `  vsterm open --name service-a -- make run-service-a
  vsterm open --name web --cwd ./web --focus -- npm run dev`,
		RunE: func(cmd *cobra.Command, args []string) error {
			req.Command = joinCommand(args)
			if req.Cwd == "" {
				wd, err := os.Getwd()
				if err != nil {
					return err
				}
				req.Cwd = wd
			}
			c, err := client.FromEnv()
			if err != nil {
				return err
			}
			return c.Open(cmd.Context(), req)
		},
	}

	cmd.Flags().StringVarP(&req.Name, "name", "n", "", "terminal name (required)")
	cmd.Flags().StringVar(&req.Cwd, "cwd", "", "working directory (default: current directory)")
	cmd.Flags().BoolVar(&req.Focus, "focus", false, "switch to the new terminal")
	_ = cmd.MarkFlagRequired("name")

	return cmd
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
