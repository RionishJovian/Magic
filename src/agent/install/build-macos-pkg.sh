#!/bin/bash
# Build a signed-ready macOS installer package (.pkg) and a .dmg wrapper for
# the MikroMagic Connector. Run this on a Mac with Xcode command line tools.
#
#   ./build-macos-pkg.sh 1.0.0
#
# The resulting MikroMagicConnector-<version>.pkg installs the agent, asks for
# the pairing code on first run (or reads /etc/mikromagic-pairing-code) and
# loads the launchd daemon. Pass a Developer ID to productsign/codesign for
# notarised distribution.

set -euo pipefail
VERSION="${1:-1.0.0}"
BASE_URL="${MIKROMAGIC_BASE_URL:-https://mikromagic.app}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(mktemp -d)"
ROOT="$BUILD/root"
SCRIPTS="$BUILD/scripts"

mkdir -p "$ROOT/Library/Application Support/MikroMagicConnector" "$SCRIPTS"
cp "$HERE/../connector-agent.mjs" "$ROOT/Library/Application Support/MikroMagicConnector/connector-agent.mjs"
cp "$HERE/macos-install.sh" "$ROOT/Library/Application Support/MikroMagicConnector/macos-install.sh"
chmod 755 "$ROOT/Library/Application Support/MikroMagicConnector/"*

cat > "$SCRIPTS/postinstall" <<POST
#!/bin/bash
set -e
CODE=""
[ -f /etc/mikromagic-pairing-code ] && CODE="\$(cat /etc/mikromagic-pairing-code)"
MIKROMAGIC_BASE_URL="$BASE_URL" bash "/Library/Application Support/MikroMagicConnector/macos-install.sh" "\$CODE"
exit 0
POST
chmod 755 "$SCRIPTS/postinstall"

pkgbuild \
  --root "$ROOT" \
  --scripts "$SCRIPTS" \
  --identifier app.mikromagic.connector \
  --version "$VERSION" \
  --install-location / \
  "$HERE/MikroMagicConnector-$VERSION.pkg"

# Optional DMG wrapper for drag-and-drop distribution.
DMG_DIR="$BUILD/dmg"
mkdir -p "$DMG_DIR"
cp "$HERE/MikroMagicConnector-$VERSION.pkg" "$DMG_DIR/"
hdiutil create -volname "MikroMagic Connector" -srcfolder "$DMG_DIR" -ov -format UDZO \
  "$HERE/MikroMagicConnector-$VERSION.dmg" || echo "hdiutil unavailable — .pkg only"

echo "Built: $HERE/MikroMagicConnector-$VERSION.pkg"
