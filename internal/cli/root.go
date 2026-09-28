// Package cli defines the vsterm cobra commands.
package cli

import "github.com/spf13/cobra"

// Version is set at build time with -ldflags "-X github.com/fallmo/vsterm/internal/cli.Version=...".
var Version = "dev"

func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:           "vsterm",
		Short:         "Open named VS Code integrated terminals from the shell",
		Version:       Version,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(newOpenCmd())
	return root
}
