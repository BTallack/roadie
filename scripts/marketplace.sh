#!/bin/sh
# Rebuilds the Elgato Marketplace assets in docs/marketplace/ from the plugin's own renderer:
# a 288 px app icon, a 1920x960 thumbnail and four 1920x960 gallery images. Needs Google Chrome.
set -e
cd "$(dirname "$0")/.."
npx tsx scripts/marketplace-keys.ts
node scripts/marketplace-scenes.mjs
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size="$2" --screenshot="$PWD/docs/marketplace/$1.png" "file://$PWD/docs/marketplace/src/$1.html" >/dev/null 2>&1; }
for page in thumbnail gallery-1 gallery-2 gallery-3 gallery-4; do shot "$page" 1920,960; done
shot app-icon 288,288
ls -l docs/marketplace/*.png
