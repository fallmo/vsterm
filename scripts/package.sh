#!/usr/bin/env bash
# Builds the vsterm CLI for each platform and packages one VS Code extension
# per platform with its binary bundled.
#
# Usage: scripts/package.sh VERSION   (e.g. 0.1.0)
#
# Output in dist/:
#   vsterm-<target>-<VERSION>.vsix   one extension package per VS Code target
#   vsterm-<goos>-<goarch>           the standalone CLI binaries
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 VERSION (X.Y.Z)" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
ext="$root/extension"
dist="$root/dist"

# "goos/goarch vsce-target..." — Alpine reuses the static Linux binaries.
targets=(
  "darwin/arm64 darwin-arm64"
  "darwin/amd64 darwin-x64"
  "linux/amd64 linux-x64 alpine-x64"
  "linux/arm64 linux-arm64 alpine-arm64"
)

# Files modified or created in extension/ only for packaging; restored on exit.
# The backup lives outside extension/ so vsce doesn't package it.
backup="$(mktemp)"
cp "$ext/package.json" "$backup"
cleanup() {
  mv "$backup" "$ext/package.json"
  rm -rf "$ext/bin" "$ext/README.md" "$ext/LICENSE"
}
trap cleanup EXIT

rm -rf "$dist"
mkdir -p "$dist"

cp "$root/README.md" "$ext/README.md"
license_flag=--skip-license
if [[ -f "$root/LICENSE" ]]; then
  cp "$root/LICENSE" "$ext/LICENSE"
  license_flag=
fi

(
  cd "$ext"
  npm ci --silent
  npm pkg set version="$version"
  npm run compile --silent
)

for entry in "${targets[@]}"; do
  read -r platform vsce_targets <<<"$entry"
  goos="${platform%/*}"
  goarch="${platform#*/}"
  binary="$dist/vsterm-$goos-$goarch"

  echo "==> building $goos/$goarch"
  (
    cd "$root"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" go build -trimpath \
      -ldflags "-s -w -X github.com/fallmo/vsterm/internal/cli.Version=$version" \
      -o "$binary" ./cmd/vsterm
  )

  rm -rf "$ext/bin"
  mkdir -p "$ext/bin"
  cp "$binary" "$ext/bin/vsterm"
  chmod 755 "$ext/bin/vsterm"

  for target in $vsce_targets; do
    echo "==> packaging $target"
    (
      cd "$ext"
      # Already compiled above; no runtime dependencies to bundle.
      npx vsce package --target "$target" --no-dependencies $license_flag \
        -o "$dist/vsterm-$target-$version.vsix"
    )
  done
done

echo "==> done"
ls -1 "$dist"
