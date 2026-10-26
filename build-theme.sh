#!/usr/bin/env sh
# Builds the Shopify theme ZIP: compiles Tailwind, then zips shopify-theme/ with the theme
# folders (layout/, templates/, sections/...) at the root of the archive, as Shopify requires.
# Usage: ./build-theme.sh   ->  dist/trending-arrivals-shopify-theme.zip
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-fund --no-audit
npx @tailwindcss/cli -i tailwind/theme.input.css -o shopify-theme/assets/tailwind.css --minify
OUT="$(pwd)/dist/trending-arrivals-shopify-theme.zip"
mkdir -p dist
rm -f "$OUT"
(cd shopify-theme && zip -rqX "$OUT" assets config layout locales sections snippets templates -x '*.DS_Store')
echo "Created dist/trending-arrivals-shopify-theme.zip"
unzip -l "$OUT" | tail -1
