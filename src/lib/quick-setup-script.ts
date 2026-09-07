import { routerosClockPrepSnippet } from "./router-clock";

/** Tagged firewall rule + cert name used by the Quick Setup wizard. */
export const MAGIC_SETUP_CERT = "mikrotik-magic";
export const MAGIC_SETUP_FW_COMMENT = "mikrotik-magic-rest";

export function buildQuickSetupScript(o: {
  apiUser: string;
  apiPassword: string;
  identity: string;
  backupTag: string;
}) {
  const user = o.apiUser;
  const pass = o.apiPassword;
  const cert = MAGIC_SETUP_CERT;
  const fw = MAGIC_SETUP_FW_COMMENT;
  const clockPrep = routerosClockPrepSnippet({ waitSeconds: 4 });

  return `# =========================================================
# MikroTik Magic — Secure Setup script
# Generated: ${new Date().toISOString()}
# Backup tag: ${o.backupTag}
# What this does:
#  0. Saves a full binary backup + text export BEFORE any change
#  1. Sets router identity + resolver DNS
#  2. Enables NTP + Asia/Yangon timezone (needed before TLS cert signing)
#  3. Enables IP Cloud DDNS and waits for dns-name
#  4. Generates a self-signed TLS cert (CN = DDNS hostname) for www-ssl
#  5. Enables REST API over HTTPS on port 443 (www-ssl only)
#  6. Opens firewall input for TCP 443 (comment=${fw})
#  7. Creates a dedicated API user for MikroTik Magic
#
# ROLLBACK: if anything goes wrong you have two options:
#   Soft rollback (no reboot) — run the companion rollback .rsc from the app.
#   Hard rollback (full restore, will reboot):
#     /system backup load name=${o.backupTag}
# =========================================================

# --- Safety backup (runs first) ----------------------------
/system backup save name=${o.backupTag} dont-encrypt=yes
/export file=${o.backupTag}
:put "Backup saved: ${o.backupTag}.backup + ${o.backupTag}.rsc in Files"

/system identity set name="${o.identity}"

/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes cache-size=4096KiB

# --- Clock (NTP before TLS — factory boards often sit at 1970) ---
${clockPrep}
# --- DDNS (wait until dns-name is populated) ---------------
/ip cloud set ddns-enabled=yes update-time=yes
:local i 0
:while ($i < 30) do={
  :if ([:len [/ip cloud get dns-name]] > 0) do={ :set i 30 } else={ :delay 2s; :set i ($i + 1) }
}
:local dnsName [/ip cloud get dns-name]
:if ([:len $dnsName] = 0) do={
  :error "Cloud DDNS has no dns-name yet (status may still be updating). Re-run this script in a minute, or check /ip cloud print."
}
:put ("Cloud DDNS: " . $dnsName)

# --- TLS certificate (CN = DDNS hostname) ------------------
:if ([:len [/certificate find name="${cert}" and private-key=yes]] = 0) do={
  :if ([:len [/certificate find name="${cert}"]] > 0) do={
    /certificate remove [find name="${cert}"]
  }
  /certificate add name=${cert} common-name=$dnsName key-size=2048 days-valid=3650 key-usage=tls-server
  /certificate sign ${cert}
  :set i 0
  :while ($i < 60) do={
    :if ([:len [/certificate find name="${cert}" and private-key=yes]] > 0) do={ :set i 60 } else={ :delay 2s; :set i ($i + 1) }
  }
  :if ([:len [/certificate find name="${cert}" and private-key=yes]] = 0) do={
    :error "certificate signing did not complete for ${cert}"
  }
}

# --- REST endpoint (HTTPS / www-ssl on 443 only) -----------
/ip service set www-ssl certificate=${cert} disabled=no port=443 address=""
/ip service set www disabled=yes
/ip service set api disabled=yes
/ip service set api-ssl disabled=yes
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes

# --- WAN firewall: allow inbound REST ----------------------
:if ([:len [/ip firewall filter find comment="${fw}"]] = 0) do={
  /ip firewall filter add chain=input protocol=tcp dst-port=443 action=accept place-before=0 comment="${fw}"
}

# --- Dedicated API user ------------------------------------
:if ([:len [/user find name="${user}"]] > 0) do={
  /user set [find name="${user}"] password="${pass}" group=full
} else={
  /user add name="${user}" password="${pass}" group=full comment="MikroTik Magic remote"
}

:put "----------------------------------------"
:put "Setup complete. Copy this into MikroTik Magic:"
:put ("  Host: " . $dnsName)
:put "  Port: 443"
:put "  TLS:  on (allow self-signed)"
:put ("  User: ${user}")
:put "  Pass: (as generated in the app)"
:put "Backup tag (keep this): ${o.backupTag}"
:put "----------------------------------------"
`;
}

export function buildQuickSetupRollbackScript(o: { apiUser: string; backupTag: string }) {
  const user = o.apiUser;
  const cert = MAGIC_SETUP_CERT;
  const fw = MAGIC_SETUP_FW_COMMENT;

  return `# =========================================================
# MikroTik Magic — Rollback (soft) script
# Backup tag from setup: ${o.backupTag}
#
# This removes ONLY what the setup wizard added:
#   - firewall rule comment=${fw}
#   - clears www-ssl address restriction and disables the service
#   - removes the ${cert} certificate
#   - removes the "${user}" user
#
# It does NOT touch DDNS, DNS resolvers, or system identity — those are safe
# to keep. If you want to undo EVERYTHING (including DDNS) run this instead
# to hard-restore the pre-setup state (this WILL reboot the router):
#   /system backup load name=${o.backupTag}
# =========================================================

:put "Rolling back MikroTik Magic setup…"

# --- Firewall ---------------------------------------------
:if ([:len [/ip firewall filter find comment="${fw}"]] > 0) do={
  /ip firewall filter remove [find comment="${fw}"]
}

# --- REST service -----------------------------------------
/ip service set www-ssl address="" disabled=yes

# --- Certificate ------------------------------------------
:if ([:len [/certificate find name="${cert}"]] > 0) do={
  /certificate remove [find name="${cert}"]
}

# --- API user ---------------------------------------------
:if ([:len [/user find name="${user}"]] > 0) do={
  /user remove [find name="${user}"]
}

:put "Soft rollback complete."
:put "For a full restore of the pre-setup config, run:"
:put "  /system backup load name=${o.backupTag}"
`;
}

/** Soft-rollback body for one-click REST exec (same artefacts as .rsc). */
export function buildQuickSetupSoftRollbackCommands(apiUser: string): string {
  const cert = MAGIC_SETUP_CERT;
  const fw = MAGIC_SETUP_FW_COMMENT;
  return `:if ([:len [/ip firewall filter find comment="${fw}"]] > 0) do={ /ip firewall filter remove [find comment="${fw}"] }
/ip service set www-ssl address="" disabled=yes
:if ([:len [/certificate find name="${cert}"]] > 0) do={ /certificate remove [find name="${cert}"] }
:if ([:len [/user find name="${apiUser}"]] > 0) do={ /user remove [find name="${apiUser}"] }`;
}
