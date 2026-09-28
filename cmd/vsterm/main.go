package main

import (
	"fmt"
	"os"

	"github.com/fallmo/vsterm/internal/cli"
)

func main() {
	if err := cli.NewRootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "vsterm:", err)
		os.Exit(1)
	}
}
