#!/bin/bash
# MikroMagic Connector — macOS installer
# ------------------------------------------------------------------
# Usage:
#   sudo ./macos-install.sh ABCD-EFGH-JKLM
#   curl -fsSL https://mikromagic.app/api/public/connector/install/macos | sudo bash -s ABCD-EFGH-JKLM
#
# Installs a launchd daemon that starts at boot, keeps the agent alive and
# therefore also applies signed self-updates (the agent exits after updating).

set -euo pipefail

PAIRING_CODE="${1:-${MIKROMAGIC_PAIRING_CODE:-}}"
BASE_URL="${MIKROMAGIC_BASE_URL:-https://mikromagic.app}"
NODE_VERSION="${MIKROMAGIC_NODE_VERSION:-20.18.1}"

INSTALL_DIR="/Library/Application Support/MikroMagicConnector"
RUNTIME_DIR="$INSTALL_DIR/runtime"
AGENT_PATH="$INSTALL_DIR/connector-agent.mjs"
SETUP_PATH="$INSTALL_DIR/connector-setup.mjs"
PLIST="/Library/LaunchDaemons/app.mikromagic.connector.plist"

if [ "$(id -u)" != "0" ]; then
  echo "Please run with sudo." >&2
  exit 1
fi

if [ -z "$PAIRING_CODE" ]; then
  read -r -p "Enter the pairing code from MikroMagic -> Connectors: " PAIRING_CODE
fi
PAIRING_CODE="$(echo "$PAIRING_CODE" | tr '[:lower:]' '[:upper:]' | tr -d '[:space:]')"
BASE_URL="${BASE_URL%/}"

mkdir -p "$INSTALL_DIR"

# Published SHA-256 checksums for the pinned Node.js release.
NODE_SHA_ARM64="9e92ce1032455a9cc419fe71e908b27ae477799371b45a0844eedb02279922a4"
NODE_SHA_X64="c5497dd17c8875b53712edaf99052f961013cedc203964583fc0cfc0aaf93581"

# Ed25519 public key that matches the server-side update signing key.
UPDATE_PUBLIC_KEY_B64="MCowBQYDK2VwAyEACqzWWPJXbYAuE2WfbOb8USjBKEdYZ4W8ROiXB0yb3wE="

version_ge() {
  # returns 0 when $1 >= $2 (dotted numeric versions)
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

node_ok() {
  [ -x "$1" ] || command -v "$1" >/dev/null 2>&1 || return 1
  v="$("$1" -v 2>/dev/null | tr -d 'v')" || return 1
  [ -n "$v" ] || return 1
  version_ge "$v" "$NODE_VERSION"
}

# --- 1. Node.js runtime (private copy) ---------------------------------------
NODE_BIN=""
SYS_NODE="$(command -v node || true)"
if [ -n "$SYS_NODE" ] && node_ok "$SYS_NODE"; then
  NODE_BIN="$SYS_NODE"
elif node_ok "$RUNTIME_DIR/bin/node"; then
  NODE_BIN="$RUNTIME_DIR/bin/node"
fi

if [ -z "$NODE_BIN" ]; then
  echo "Downloading the Node.js ${NODE_VERSION} runtime..."
  ARCH="x64"
  EXPECTED_SHA="$NODE_SHA_X64"
  if [ "$(uname -m)" = "arm64" ]; then
    ARCH="arm64"
    EXPECTED_SHA="$NODE_SHA_ARM64"
  fi
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz" -o "$TMP/node.tgz"
  ACTUAL_SHA="$(shasum -a 256 "$TMP/node.tgz" | awk '{print $1}')"
  if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    rm -rf "$TMP"
    echo "Node.js download failed checksum verification. Aborting." >&2
    exit 1
  fi
  tar -xzf "$TMP/node.tgz" -C "$TMP"
  rm -rf "$RUNTIME_DIR"
  mkdir -p "$RUNTIME_DIR"
  cp -R "$TMP/node-v${NODE_VERSION}-darwin-${ARCH}/." "$RUNTIME_DIR/"
  rm -rf "$TMP"
  NODE_BIN="$RUNTIME_DIR/bin/node"
fi

# --- 2. Agent + local setup tool ----------------------------------------------
echo "Downloading the connector agent..."
curl -fsSL "$BASE_URL/api/public/connector/download" -o "$AGENT_PATH"

echo "Downloading the local router setup tool..."
curl -fsSL "$BASE_URL/api/public/connector/setup-tool" -o "$SETUP_PATH"

echo "Verifying the signed release manifest..."
curl -fsSL "$BASE_URL/api/public/connector/version" -o "$INSTALL_DIR/version.json"

VERIFY_JS="$(mktemp)"
cat > "$VERIFY_JS" <<'VERIFYEOF'
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

const [, , manifestPath, baseUrl, agentPath, setupPath, publicKeyB64] = process.argv;
const body = JSON.parse(readFileSync(manifestPath, "utf8"));
const { manifest, signature } = body ?? {};
if (!manifest || !signature) {
  console.error("release manifest is missing or unsigned");
  process.exit(1);
}
const key = createPublicKey({
  key: Buffer.from(publicKeyB64, "base64"),
  format: "der",
  type: "spki",
});
if (!cryptoVerify(null, Buffer.from(JSON.stringify(manifest)), key, Buffer.from(signature, "base64"))) {
  console.error("release manifest signature is invalid");
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, "");
if (
  manifest.url !== `${base}/api/public/connector/download` ||
  manifest.setupUrl !== `${base}/api/public/connector/setup-tool`
) {
  console.error("release manifest points at an unexpected origin");
  process.exit(1);
}
const sha = (p) => createHash("sha256").update(readFileSync(p, "utf8"), "utf8").digest("hex");
if (sha(agentPath) !== manifest.sha256) {
  console.error("connector agent failed checksum verification");
  process.exit(1);
}
if (sha(setupPath) !== manifest.setupSha256) {
  console.error("setup tool failed checksum verification");
  process.exit(1);
}
console.log(`verified connector release ${manifest.version}`);
VERIFYEOF

if ! "$NODE_BIN" "$VERIFY_JS" "$INSTALL_DIR/version.json" "$BASE_URL" "$AGENT_PATH" "$SETUP_PATH" "$UPDATE_PUBLIC_KEY_B64"; then
  rm -f "$VERIFY_JS" "$AGENT_PATH" "$SETUP_PATH" "$INSTALL_DIR/version.json"
  echo "Aborting install: downloaded files could not be verified." >&2
  exit 1
fi
rm -f "$VERIFY_JS"

chmod 755 "$AGENT_PATH"
chmod 755 "$SETUP_PATH"

cat > "$INSTALL_DIR/config.json" <<JSON
{ "baseUrl": "$BASE_URL", "pairingCode": "$PAIRING_CODE" }
JSON
chmod 600 "$INSTALL_DIR/config.json"
chown -R root:wheel "$INSTALL_DIR"

# --- 3. launchd daemon (KeepAlive restarts after crash or self-update) --------
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.mikromagic.connector</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$AGENT_PATH</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>/var/log/mikromagic-connector.log</string>
  <key>StandardErrorPath</key><string>/var/log/mikromagic-connector.log</string>
</dict>
</plist>
PLISTEOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"

echo ""
echo "MikroMagic Connector installed."
echo "  Location : $INSTALL_DIR"
echo "  Daemon   : app.mikromagic.connector (launchd, auto-restart)"
echo "  Logs     : /var/log/mikromagic-connector.log"
echo "  Updates  : signed automatic updates, checked every 6 hours"
echo ""
echo "To set up a router, connect this computer to one of the RB4011 LAN ports"
echo "(ether2 ... ether10) and then run:"
echo "  sudo \"$NODE_BIN\" \"$SETUP_PATH\""
echo "Router credentials are typed into that tool locally and never leave this Mac."
