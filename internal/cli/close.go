package cli

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/fallmo/vsterm/internal/client"
	"github.com/fallmo/vsterm/internal/protocol"
	"github.com/spf13/cobra"
)

// maxCloseTimeout matches the limit enforced by the extension.
const maxCloseTimeout = time.Minute

func newCloseCmd() *cobra.Command {
	var (
		req     protocol.CloseRequest
		timeout time.Duration
	)

	cmd := &cobra.Command{
		Use:   "close [NAME...] | --group GROUP | --all",
		Short: "Close terminals opened by vsterm in the current VS Code window",
		Long: `Close terminals opened by vsterm in the current VS Code window.

Select terminals by name, by --group, or with --all. Terminals not opened by
vsterm are never closed.

Each running command is sent Ctrl+C and given --timeout to exit before its
terminal is closed. --force closes terminals immediately.`,
		Example: `  vsterm close api worker
  vsterm close --group backend
  vsterm close --all --force`,
		RunE: func(cmd *cobra.Command, args []string) error {
			req.Names = args
			selectors := 0
			for _, set := range []bool{len(req.Names) > 0, req.Group != "", req.All} {
				if set {
					selectors++
				}
			}
			if selectors != 1 {
				return errors.New("specify exactly one of: terminal names, --group, or --all")
			}
			if timeout <= 0 || timeout > maxCloseTimeout {
				return fmt.Errorf("--timeout must be between 1ms and %s", maxCloseTimeout)
			}
			req.TimeoutMs = int(timeout.Milliseconds())

			c, err := client.FromEnv()
			if err != nil {
				return err
			}
			// Allow for the extension waiting up to the timeout.
			ctx, cancel := context.WithTimeout(cmd.Context(), timeout+10*time.Second)
			defer cancel()
			resp, err := c.Close(ctx, req)
			if err != nil {
				return err
			}
			if len(resp.Closed) == 0 {
				fmt.Fprintln(cmd.ErrOrStderr(), "vsterm: no terminals matched")
			}
			return nil
		},
	}

	cmd.Flags().StringVarP(&req.Group, "group", "g", "", "close every terminal in this group")
	cmd.Flags().BoolVar(&req.All, "all", false, "close every terminal opened by vsterm")
	cmd.Flags().BoolVarP(&req.Force, "force", "f", false, "close immediately without sending Ctrl+C")
	cmd.Flags().DurationVar(&timeout, "timeout", 5*time.Second, "how long to wait for commands to exit after Ctrl+C")

	return cmd
}
