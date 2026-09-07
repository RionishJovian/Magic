#!/bin/bash
# MikroMagic Connector — Linux installer
# ------------------------------------------------------------------
# Usage:
#   sudo ./linux-install.sh ABCD-EFGH-JKLM
#   curl -fsSL https://mikromagic.app/api/public/connector/install/linux | sudo bash -s ABCD-EFGH-JKLM
#
# Installs a systemd service that starts at boot, keeps the agent alive and
# therefore also applies signed self-updates (the agent exits after updating).

set -euo pipefail

PAIRING_CODE="${1:-${MIKROMAGIC_PAIRING_CODE:-}}"
BASE_URL="${MIKROMAGIC_BASE_URL:-https://mikromagic.app}"
NODE_VERSION="${MIKROMAGIC_NODE_VERSION:-20.18.1}"

INSTALL_DIR="/opt/mikromagic-connector"
RUNTIME_DIR="$INSTALL_DIR/runtime"
AGENT_PATH="$INSTALL_DIR/connector-agent.mjs"
SETUP_PATH="$INSTALL_DIR/connector-setup.mjs"
UNIT="/etc/systemd/system/mikromagic-connector.service"

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

# --- 1. Node.js runtime (private copy when the system has none) ---------------
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ ! -x "$RUNTIME_DIR/bin/node" ]; then
  echo "Downloading the Node.js runtime..."
  case "$(uname -m)" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz" -o "$TMP/node.tar.xz"
  tar -xJf "$TMP/node.tar.xz" -C "$TMP"
  mkdir -p "$RUNTIME_DIR"
  cp -R "$TMP/node-v${NODE_VERSION}-linux-${ARCH}/." "$RUNTIME_DIR/"
  rm -rf "$TMP"
fi
[ -z "$NODE_BIN" ] && NODE_BIN="$RUNTIME_DIR/bin/node"

# --- 2. Agent + local setup tool ---------------------------------------------
echo "Downloading the connector agent..."
curl -fsSL "$BASE_URL/api/public/connector/download" -o "$AGENT_PATH"
chmod 755 "$AGENT_PATH"

echo "Downloading the local router setup tool..."
curl -fsSL "$BASE_URL/api/public/connector/setup-tool" -o "$SETUP_PATH"
chmod 755 "$SETUP_PATH"

cat > "$INSTALL_DIR/config.json" <<JSON
{ "baseUrl": "$BASE_URL", "pairingCode": "$PAIRING_CODE" }
JSON
chmod 600 "$INSTALL_DIR/config.json"

# --- 3. systemd service -------------------------------------------------------
cat > "$UNIT" <<UNITFILE
[Unit]
Description=MikroMagic Connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$NODE_BIN $AGENT_PATH
WorkingDirectory=$INSTALL_DIR
Environment=MIKROMAGIC_BASE_URL=$BASE_URL
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNITFILE

systemctl daemon-reload
systemctl enable --now mikromagic-connector.service

echo ""
echo "MikroMagic Connector installed and running."
echo "Logs:   journalctl -u mikromagic-connector -f"
echo ""
echo "To set up a router, connect this computer to one of the RB4011 LAN ports"
echo "(ether2 ... ether10) and then run:"
echo "  sudo $NODE_BIN $SETUP_PATH"
