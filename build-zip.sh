#!/usr/bin/env sh
# Packages the site into dist/trending-arrivals.zip (one top-level "trending-arrivals/" folder).
# Usage: ./build-zip.sh
set -eu
cd "$(dirname "$0")"
NAME=trending-arrivals
OUT="$(pwd)/dist/$NAME.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME" dist
cp index.html styles.css script.js README.md "$STAGE/$NAME/"
cp -R assets "$STAGE/$NAME/"
rm -f "$OUT"
(cd "$STAGE" && zip -rqX "$OUT" "$NAME" -x '*.DS_Store')
echo "Created dist/$NAME.zip"
unzip -l "$OUT"
