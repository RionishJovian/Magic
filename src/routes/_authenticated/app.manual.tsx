import { createFileRoute } from "@tanstack/react-router";
import { ACCOUNT_RANKS, ROLE_LABEL } from "@/lib/product-terminology";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app/manual")({
  head: () => ({
    meta: [
      { title: "User Manual · MikroTik Magic" },
      {
        name: "description",
        content:
          "Step-by-step guide to connect MikroTik routers, access points and the Local Connector to the MikroTik Magic web app.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Manual,
});

function Manual() {
  const t = useT();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 300_000 });
  const roles = me.data?.roles ?? [];
  const isStaff = isPrivilegedAccount(roles, me.data?.isPlatformAdmin);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t.label("User manual")}
        </div>
        <h1 className="text-2xl font-semibold">
          {t.label("Connect your network to MikroTik Magic")}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {isStaff
            ? t.copy(
                "MikroTik Magic is a cloud-hosted web app. Platform customers reach the RouterBoard with Magic Hub (Cloud Remote — the board dials out for Starlink / CGNAT) or Local Connector (agent on the LAN). Owner/admin accounts also get Public IP / DDNS via Quick Setup when the WAN has a real public address. This manual covers each path, the tools in the app, and the plan limits that apply to your account.",
              )
            : t.copy(
                "MikroTik Magic is a cloud-hosted web app. You reach your RouterBoard in two ways: Magic Hub (Cloud Remote — the board dials out to the MikroTik Magic VPS for Starlink and other CGNAT lines) or Local Connector (a paired agent on the LAN). This manual covers both paths, the tools in the app, and the plan limits that apply to your account.",
              )}
        </p>
      </header>

      <TopologyDiagram />

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t.label("What's in the app")}</h2>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "MikroTik Magic gives your account 14 features. The User manual is help only, so it does not count as a feature.",
          )}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <b className="text-foreground">{t.label("Overview")}</b> —{" "}
              {t.copy("health score, router status dots, alerts and quick links to every tool.")}
            </li>
            {isStaff ? (
              <li>
                <b className="text-foreground">{t.label("Quick setup")}</b> —{" "}
                {t.copy(
                  "guided wizard for DDNS, TLS, firewall, the API user and one-click rollback if a script fails.",
                )}
              </li>
            ) : null}
            <li>
              <b className="text-foreground">{t.label("Routers")}</b> —{" "}
              {t.copy(
                "add routers, live telemetry, interface traffic, Hotspot Share Protection and Magic Hub (Connect via Hub).",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Local Connector")}</b> —{" "}
              {t.copy(
                "guided setup for the Windows/macOS agent: pairing codes, heartbeat status, self-updates and bound devices.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Sites")}</b> —{" "}
              {t.copy("group devices by location on a real map and switch context in one click.")}
            </li>
            <li>
              <b className="text-foreground">{t.label("Devices & ports")}</b> —{" "}
              {t.copy("inventory of switches and devices with per-port status and details.")}
            </li>
            <li>
              <b className="text-foreground">{t.label("Optional AP integrations")}</b> —{" "}
              {t.copy(
                "advanced controller links. Test each controller before use. They are not required when external APs run in bridge mode and are managed in their native app.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Incidents")}</b> —{" "}
              {t.copy("outages and alerts raised by your devices, with their current state.")}
            </li>
          </ul>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <b className="text-foreground">{t.label("Fleet")}</b> —{" "}
              {t.copy(
                "live health, traffic and events across every router, with on-demand AI scans (never automatic).",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Live users")}</b> —{" "}
              {t.copy(
                "active sessions with kick, ban, bandwidth limits and remaining voucher time.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Vouchers")}</b> —{" "}
              {t.copy(
                "plan templates (1d / 7d / 1M / VIP), bulk code generation, printable slips and multi-router pooling.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Revenue")}</b> —{" "}
              {t.copy(
                "automatic MMK rollups from voucher usage, daily/weekly/monthly audit views, exportable.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Captive portal")}</b> —{" "}
              {t.copy(
                "liquid-glass captive-portal designer with editable text and images, deployed to the router in one click.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Syslog AI")}</b> —{" "}
              {t.copy(
                "HTTPS ingest from RouterOS (owner token, shown once), then AI translation of log lines into plain-language causes and fixes.",
              )}
            </li>
            <li>
              <b className="text-foreground">{t.label("Services & plan")}</b> —{" "}
              {t.copy("your current plan, expiry date, device allowance and renewal requests.")}
            </li>
            <li>
              <b className="text-foreground">{t.label("Profile & security")}</b> —{" "}
              {t.copy(
                "display name, password, language (English / Chinese / Burmese), install-to-phone and sign out.",
              )}
            </li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.copy("The User manual is help content — it is not part of the 14 features.")}
        </p>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t.label("Roles and limits")}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.dev)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[0]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.primary)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[1]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.user)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[2]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.agent)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[3]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.expired)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[4]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label(ROLE_LABEL.trial)}</b> —{" "}
            {t.copy(ACCOUNT_RANKS[5]!.blurb)}
          </li>
          <li>
            <b className="text-foreground">{t.label("Device limits")}</b> —{" "}
            {t.copy(
              "Emerald and Sapphire include hotspot management with 1 router, 3 sites and 15 optional AP controller integrations. Additional capacity is managed through an owner-approved device slot or the relevant account-bound feature key. Sapphire is 104,500 MMK / year (73,150 MMK while the launch offer is active, through 24 Sep 2026). Amethyst is unlimited. Quotas are enforced on the server, so an over-limit add is rejected even on rapid retries.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("AI scans")}</b> —{" "}
            {t.copy(
              "30 manual scans per month on standard plans. Owners can set a different monthly allowance when needed. Fleet and Security Insights share the same quota.",
            )}
          </li>
        </ul>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t.label("Install on your phone")}</h2>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "MikroTik Magic is installable. On iOS open it in Safari and tap Share → Add to Home Screen; on Android use Chrome menu → Install app. It then runs full-screen like a native app, with the same login. Profile has a shortcut card for this.",
          )}
        </p>
      </section>

      {isStaff ? (
        <>
          <section className="panel space-y-3 p-5">
            <h2 className="text-lg font-semibold">{t.label("Option A — Public IP / DDNS")}</h2>
            <p className="text-sm text-muted-foreground">
              {t.copy(
                "Manage the router from anywhere over MikroTik's own free Cloud DDNS hostname — no VPS or third-party service. Use this when the site has a public IP. Before you start, make sure you have:",
              )}
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>{t.copy("RouterOS v7.1 or newer (the REST API does not exist before 7.1).")}</li>
              <li>
                {t.copy(
                  "A reachable public endpoint: static public IP, MikroTik Cloud DDNS, or a tunnel (Cloudflare Tunnel, Tailscale, ZeroTier).",
                )}
              </li>
              <li>
                {t.copy("Admin access to the IP service, firewall, certificate and user menus.")}
              </li>
              <li>
                {t.copy(
                  "The IP addresses you want to allow — your MikroTik Magic egress IPs or your own admin IPs.",
                )}
              </li>
            </ul>
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              {t.copy(
                "CGNAT caveat: Starlink and most mobile ISPs hand out a shared address (100.64.0.0/10), so nothing from the internet can dial in — public-IP Quick Setup cannot work on those lines. Prefer Cloud Remote / Magic Hub: the RouterBoard dials out to the MikroTik Magic VPS hub. Local Connector is the alternative when you can run an always-on PC on site. Fiber lines with a public IP can use Quick Setup.",
              )}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <StepCard
              n="1"
              title={t.label("Get a public hostname (Cloud DDNS)")}
              body={`/ip cloud set ddns-enabled=yes
/ip cloud print
# copy the "dns-name" value, e.g. abc123.sn.mynetname.net`}
              note={t.copy(
                "If you already have a static public IP or a tunnel hostname, skip DDNS and use that hostname instead.",
              )}
            />
            <StepCard
              n="2"
              title={t.label("Install / generate a TLS certificate")}
              body={`# Self-signed (fastest — tick 'Allow self-signed TLS' in the app)
/certificate add name=magic-ca common-name=magic-ca key-usage=key-cert-sign,crl-sign
/certificate sign magic-ca
/certificate add name=magic-https common-name=<your-ddns-host> key-usage=tls-server
/certificate sign magic-https ca=magic-ca

# Or import a real cert (Let's Encrypt / commercial)
/certificate import file-name=fullchain.pem
/certificate import file-name=privkey.pem`}
              note={t.copy(
                "A real (non-self-signed) cert lets you keep 'Allow self-signed TLS' OFF for stronger security.",
              )}
            />
            <StepCard
              n="3"
              title={t.label("Enable REST over HTTPS on 443")}
              body={`/ip service disable www api api-ssl
/ip service set www-ssl certificate=magic-https port=443
/ip service enable www-ssl`}
              note={t.copy(
                "Disable plain www, api and api-ssl unless you actually use them — the REST endpoint is served by www-ssl.",
              )}
            />
            <StepCard
              n="4"
              title={t.label("Restrict who can reach it")}
              body={`# Lock the service itself to trusted source IPs
/ip service set www-ssl address=203.0.113.10/32,198.51.100.0/24

# Belt & braces at the firewall
/ip firewall filter
add chain=input protocol=tcp dst-port=443 src-address-list=magic-admins action=accept comment="Magic REST"
add chain=input protocol=tcp dst-port=443 action=drop comment="drop other 443"
/ip firewall address-list
add list=magic-admins address=203.0.113.10`}
              note={t.copy(
                "Do not leave port 443 open to the whole internet for admin access. Restrict it to the Magic egress plus your own IPs.",
              )}
            />
            <StepCard
              n="5"
              title={t.label("Create a dedicated app user")}
              body={`/user group add name=magic-api policy=api,rest-api,read,write,test,sensitive,password
/user add name=magic group=magic-api password=STRONG-RANDOM-PASSWORD comment="MikroTik Magic app"`}
              note={t.copy(
                "Never reuse the built-in admin account. Use a strong, unique password — credentials are AES-256-GCM encrypted at rest, but least privilege still matters.",
              )}
            />
            <StepCard
              n="6"
              title={t.label("Test from the app")}
              body={`# Quick sanity check from any machine:
curl -k -u magic:STRONG-RANDOM-PASSWORD \\
  https://<your-ddns-host>:443/rest/system/resource

# Then in MikroTik Magic:
# Routers → Add router → paste the host + port 443 → Test connection`}
              note={t.copy(
                "A green flashing dot on Overview means REST is reachable. Red means it was up but has been unreachable for under 5 minutes. Yellow means it has never connected yet.",
              )}
            />
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="text-lg font-semibold">{t.label("Full copy-paste block")}</h2>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-4 text-xs leading-relaxed text-emerald-200">{`# 1. DDNS
/ip cloud set ddns-enabled=yes

# 2. Self-signed cert (skip if importing a real one)
/certificate add name=magic-ca common-name=magic-ca key-usage=key-cert-sign,crl-sign
/certificate sign magic-ca
/certificate add name=magic-https common-name=[/ip cloud get dns-name] key-usage=tls-server
/certificate sign magic-https ca=magic-ca

# 3. REST on 443
/ip service disable www api api-ssl
/ip service set www-ssl certificate=magic-https port=443
/ip service enable www-ssl

# 4. Firewall restriction (edit the address!)
/ip firewall address-list add list=magic-admins address=YOUR.PUBLIC.IP/32
/ip service set www-ssl address=YOUR.PUBLIC.IP/32
/ip firewall filter
add chain=input protocol=tcp dst-port=443 src-address-list=magic-admins action=accept place-before=0 comment="Magic REST"

# 5. Dedicated user
/user group add name=magic-api policy=api,rest-api,read,write,test,sensitive,password
/user add name=magic group=magic-api password=CHANGE-ME comment="MikroTik Magic"`}</pre>
          </section>
        </>
      ) : null}

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">
          {isStaff
            ? t.label("Option B — Local Connector (no public IP needed)")
            : t.label("Option A — Local Connector (no public IP needed)")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "If the site is behind CGNAT, a mobile SIM, or a locked-down ISP router, you do not need DDNS, TLS or firewall rules at all. Install the MikroTik Magic Connector agent on an always-on Windows or macOS machine inside the same LAN. The agent dials out over HTTPS, so nothing on the customer network is exposed to the internet. Everything else in the app — terminal, vouchers, portal deploy, telemetry — behaves exactly the same.",
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "In the top navigation the Connectors tab now sits immediately after Routers (Routers → Connectors). Open Connectors → Guided setup and follow the four steps below. It mirrors the router Quick setup wizard, so you can jump back to any completed step. You can also open the page directly at /app/connectors — the highlighted tab and the breadcrumb at the top of the page confirm you are in the right section.",
          )}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <StepCard
            n="1"
            title={t.label("Name the connector")}
            body={`Connectors → Guided setup → "Main site bridge"`}
            note={t.copy(
              "Use the site or shop name so you can tell bridges apart later. One connector can serve every router and AP on that LAN.",
            )}
          />
          <StepCard
            n="2"
            title={t.label("Generate the pairing code")}
            body={`Connectors → Guided setup → Generate pairing code`}
            note={t.copy(
              "Shown once and valid for 30 minutes. The agent trades it for a permanent token on first contact; the plain code is never stored.",
            )}
          />
          <StepCard
            n="3"
            title={t.label("Install the agent on site")}
            body={`# Windows (elevated PowerShell)
powershell -Command "& { $c='PAIRING-CODE'; iwr https://mikromagic.app/api/public/connector/install/windows -OutFile $env:TEMP\\mm-install.ps1; & $env:TEMP\\mm-install.ps1 -PairingCode $c -BaseUrl https://mikromagic.app }"

# macOS (Terminal)
curl -fsSL https://mikromagic.app/api/public/connector/install/macos | sudo bash -s PAIRING-CODE`}
            note={t.copy(
              "Windows installs a SYSTEM scheduled task; macOS loads a launchd daemon. Both start at boot, restart on crash and self-update from signed manifests.",
            )}
          />
          <StepCard
            n="4"
            title={t.label("Verify and bind devices")}
            body={`Connectors → Test connection  (expect "Online")
Routers → Add router → Connection method: Local Connector
Advanced → AP integrations → Add controller → Connection method: Local Connector`}
            note={t.copy(
              "Heartbeat runs every 30 seconds. With Local Connector selected you enter the device's LAN IP (e.g. 192.168.88.1) and the agent reaches it locally. If the connector is offline or unpaired, calls fail fast with a clear error instead of silently falling back.",
            )}
          />
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {t.copy(
              "Outbound HTTPS 443 to mikromagic.app must be allowed on the site network — nothing inbound.",
            )}
          </li>
          <li>
            {t.copy(
              "Device credentials stay encrypted in the cloud; only the intended request payload crosses to the connector.",
            )}
          </li>
          <li>
            {t.copy(
              "Routers and APs left on Cloud / Direct keep working exactly as before — the two methods can be mixed in one account.",
            )}
          </li>
          <li>
            {t.copy(
              "Deleting or unpairing a connector leaves bound devices without transport until you change their connection method.",
            )}
          </li>
        </ul>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t.label("Status dots on Overview")}</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <b className="text-emerald-300">{t.label("Green (flashing)")}</b> —{" "}
            {t.copy("the router responded to the last poll.")}
          </li>
          <li>
            <b className="text-red-300">{t.label("Red (flashing)")}</b> —{" "}
            {t.copy(
              "it was online but has been unreachable for under 5 minutes. A toast appears on Overview.",
            )}
          </li>
          <li>
            <b className="text-amber-300">{t.label("Yellow (flashing)")}</b> —{" "}
            {t.copy("no router registered, or it has never connected.")}
          </li>
        </ul>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">
          {isStaff ? t.label("Option C — Magic Hub") : t.label("Option B — Magic Hub")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "For Starlink and other CGNAT lines the app cannot dial into the RouterBoard. RouterOS 7 already has WireGuard built in, so the board dials OUT to the MikroTik Magic hosted VPS hub. The hub holds one management peer per RouterBoard; the app then reaches RouterOS REST through the hub. Guest hotspot traffic still leaves via Starlink — the tunnel is management only. Stay in the Connect via Hub paste window for the key script; Scripts library blocks are optional recovery only.",
          )}
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-black/30 p-3 text-[11px] leading-relaxed">{`Starlink → RouterBoard → switch → AP (hotspot)
                │
                └── WireGuard OUT → hub.mikromagic.app:51820
                                         │
App (MikroTik Magic) ──HTTPS REST via hub──┘

One user account → one site → one RouterBoard → one hub peer (default plan).
Paid extra site/router quota → another RouterBoard → another hub peer when you Connect via Hub.`}</pre>
        <div className="grid gap-4 md:grid-cols-2">
          <StepCard
            n="1"
            title={t.label("Confirm WAN on the board")}
            body={`WinBox: default route exists
(ping 8.8.8.8 works)
Factory-only: optional Scripts → Magic Hub — 1) prep`}
            note={t.copy(
              "Skip Scripts prep if the board already has internet. The Connect paste sets www-ssl, magic-https, and rest-api — you do not need a second Scripts hop for REST.",
            )}
          />
          <StepCard
            n="2"
            title={t.label("Add the RouterBoard in the app")}
            body={`Routers → Add router
Connection method: Magic Hub
Name + WinBox user/pass → Add router
A paste-script window opens (Cloud Remote / Magic Hub)`}
            note={t.copy(
              "Default plans allow 1 site and 1 router. Paying to lift the limit lets the same account add another site/board; that board gets its own hub peer when you Connect via Hub.",
            )}
          />
          <StepCard
            n="3"
            title={t.label("Connect via Hub (one paste)")}
            body={`Paste-script window → Copy script
WinBox New Terminal → paste once
Wait for last-handshake in the printout
Ignore hub / 10.77.0.1 ping timeouts`}
            note={t.copy(
              "Private key is shown once. Script uses the hub IP when possible (avoids broken LAN DNS), tunnel /24, MTU 1280, www-ssl + cert, rest-api. Do not edit the endpoint. Do not save it into the Scripts library.",
            )}
          />
          <StepCard
            n="4"
            title={t.label("Check now → Test")}
            body={`App: Check now → Test
Expect Reachable — REST OK
Optional: Scripts → Magic Hub — 3) Verify only if Test fails`}
            note={t.copy(
              "Green means the hub can reach www-ssl on the tunnel. nginx 404/502 is a hub proxy issue, not a RouterOS version problem. Re-paste from Show paste window before hopping Scripts.",
            )}
          />
        </div>
        <h3 className="text-base font-semibold">
          {isStaff
            ? t.label("Full copy-paste checklist (Option C)")
            : t.label("Full copy-paste checklist (Option B)")}
        </h3>
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-4 text-xs leading-relaxed text-emerald-200">{`# A) WinBox — confirm WAN (default route / ping 8.8.8.8)
#    Factory-only optional: Scripts → Magic Hub — 1) prep

# B) MikroTik Magic (browser)
#    Routers → Add router → Magic Hub → Add
#    Paste-script window opens → Copy script

# C) WinBox — paste the app script once (keys + REST heal + bounce)
#    Good: last-handshake a few seconds ago. Ignore hub ICMP.

# D) App → Check now → Test  (Reachable — REST OK)
#    If failed: Show paste window → re-paste (not Scripts hopping)
#    Optional read-only: Scripts → Magic Hub — 3) Verify

# Undo: Magic Hub → Remove, or download Rollback from that panel.`}</pre>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {t.copy(
              "Do not build your own hub or paste peer blocks onto a DIY VPS — MikroTik Magic hosts hub.mikromagic.app for you.",
            )}
          </li>
          <li>
            {t.copy(
              "One RouterBoard = one WireGuard peer. Remove Magic Hub in the app before requesting a fresh script for the same board.",
            )}
          </li>
          <li>
            {t.copy(
              "The rollback script removes the magic-cloud interface, peer, address, mangle and firewall rules if you want to undo it.",
            )}
          </li>
          <li>
            {t.copy(
              "Hub nginx and iptables stay on the VPS — they are not part of the per-board Scripts. Do not re-edit nginx for each new router.",
            )}
          </li>
        </ul>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t.label("Syslog AI ingest")}</h2>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "Owners mint one HTTPS token per router (shown once, hashed at rest). Paste the Syslog AI HTTPS shipper from Scripts, or copy it from the one-time panel on Syslog AI. The board POSTs new /log lines to mikromagic.app every 15s over outbound 443. UDP syslog cannot reach this webhook. Events are kept 14 days.",
          )}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <StepCard
            n="1"
            title={t.label("Mint the token")}
            body={`Syslog AI → New token
Bind to this site (and router)
Copy the secret now — it is not shown again`}
            note={t.copy(
              "Only the owner can mint or revoke. If the URL leaks, revoke that token and mint a new one. The router must be given the new shipper.",
            )}
          />
          <StepCard
            n="2"
            title={t.label("Paste the HTTPS shipper")}
            body={`WinBox New Terminal
Paste Syslog AI — HTTPS log shipper
(or paste from the one-time panel)
Wait 15s → events appear`}
            note={t.copy(
              "The shipper is a 15-second scheduler. It does not use /system logging action remote. Allow outbound HTTPS 443 to mikromagic.app.",
            )}
          />
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t.label("Troubleshooting")}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <b className="text-foreground">{t.label("Timeout")}</b> —{" "}
            {t.copy(
              "the ISP is blocking inbound 443, or a drop rule sits above the accept rule. Reorder the rules so the accept rule comes first.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("401 Unauthorized")}</b> —{" "}
            {t.copy(
              "the user is missing the rest-api policy. Recreate the group with the policies shown above.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("TLS handshake failed")}</b> —{" "}
            {t.copy(
              "the certificate common-name does not match the DDNS host, or you are on a self-signed certificate. Tick 'Allow self-signed TLS' in the Add router form.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("Works from curl, fails from the app")}</b> —{" "}
            {t.copy(
              "the router's service address list does not include the Magic egress. Widen it, use the Local Connector, or use a tunnel.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("Device limit reached")}</b> —{" "}
            {t.copy(
              "your plan allows one router, three sites and fifteen access points. Request another slot from the app owner, or use the relevant account-bound feature key when available.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("Connector offline")}</b> —{" "}
            {t.copy(
              "the agent machine is asleep or has lost outbound HTTPS. Wake it, then check the heartbeat on the Connectors page.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("Syslog AI — no events")}</b> —{" "}
            {t.copy(
              "confirm the HTTPS shipper scheduler is running, outbound 443 to mikromagic.app is allowed, and the token is bound to the site you have selected. If the secret was lost, revoke and mint again.",
            )}
          </li>
          <li>
            <b className="text-foreground">{t.label("Magic Hub stuck Offline")}</b> —{" "}
            {t.copy(
              "confirm WAN (default route), re-paste Show paste window (not Scripts hopping), wait for last-handshake, ignore hub ICMP. App password must match WinBox with rest-api. nginx 404/502 after a fresh handshake is a hub REST proxy / secrets issue — contact the owner, not a RouterOS 7.1 upgrade.",
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}

function StepCard({
  n,
  title,
  body,
  note,
}: {
  n: string;
  title: string;
  body: string;
  note: string;
}) {
  return (
    <div className="panel space-y-3 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-300">
          {n}
        </span>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-emerald-200">
        {body}
      </pre>
      <p className="rounded-md border border-border/60 bg-surface/60 p-2 text-xs text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function TopologyDiagram() {
  return (
    <div className="panel overflow-hidden p-4">
      <svg
        viewBox="0 0 900 380"
        className="w-full h-auto"
        role="img"
        aria-label="Topology: MikroTik Magic cloud app connects to a RouterBoard over the internet via HTTPS 443."
      >
        <defs>
          <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
          <marker
            id="arrow-s"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#38bdf8" />
          </marker>
        </defs>

        <g>
          <rect
            x="30"
            y="150"
            width="200"
            height="110"
            rx="18"
            fill="url(#glass)"
            stroke="#6366f1"
            strokeWidth="1.5"
          />
          <text x="130" y="188" textAnchor="middle" fill="#e0e7ff" fontSize="14" fontWeight="700">
            MikroTik Magic
          </text>
          <text x="130" y="208" textAnchor="middle" fill="#a5b4fc" fontSize="11">
            Cloud web app
          </text>
          <text x="130" y="228" textAnchor="middle" fill="#94a3b8" fontSize="10">
            mikromagic.app
          </text>
        </g>

        <g>
          <ellipse
            cx="450"
            cy="205"
            rx="120"
            ry="60"
            fill="url(#glass)"
            stroke="#64748b"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
          <text x="450" y="200" textAnchor="middle" fill="#cbd5e1" fontSize="14" fontWeight="700">
            Internet
          </text>
          <text x="450" y="220" textAnchor="middle" fill="#94a3b8" fontSize="10">
            DDNS · public IP · connector · tunnel
          </text>
        </g>

        <g>
          <rect
            x="670"
            y="150"
            width="200"
            height="110"
            rx="18"
            fill="url(#glass)"
            stroke="#fbbf24"
            strokeWidth="1.5"
          />
          <text x="770" y="188" textAnchor="middle" fill="#fef3c7" fontSize="14" fontWeight="700">
            MikroTik RouterBoard
          </text>
          <text x="770" y="208" textAnchor="middle" fill="#fde68a" fontSize="11">
            RouterOS 7.1+ REST
          </text>
          <text x="770" y="228" textAnchor="middle" fill="#94a3b8" fontSize="10">
            www-ssl on :443
          </text>
        </g>

        <g>
          <rect
            x="670"
            y="290"
            width="200"
            height="70"
            rx="18"
            fill="url(#glass)"
            stroke="#f472b6"
            strokeWidth="1.2"
          />
          <text x="770" y="318" textAnchor="middle" fill="#fce7f3" fontSize="12" fontWeight="700">
            Wi-Fi AP · Hotspot
          </text>
          <text x="770" y="338" textAnchor="middle" fill="#f9a8d4" fontSize="10">
            Voucher login for guests
          </text>
        </g>

        <path
          d="M230 205 L 340 205"
          stroke="url(#sky)"
          strokeWidth="2.5"
          fill="none"
          markerEnd="url(#arrow-s)"
        />
        <path
          d="M560 205 L 670 205"
          stroke="url(#sky)"
          strokeWidth="2.5"
          fill="none"
          markerEnd="url(#arrow-s)"
        />
        <text x="450" y="280" textAnchor="middle" fill="#38bdf8" fontSize="11" fontWeight="600">
          HTTPS · https://your-host:443/rest
        </text>
        <text x="450" y="296" textAnchor="middle" fill="#7dd3fc" fontSize="10">
          TLS + firewall-restricted service
        </text>

        <path
          d="M770 260 L 770 290"
          stroke="#f472b6"
          strokeWidth="2"
          strokeDasharray="4 3"
          fill="none"
        />
      </svg>
    </div>
  );
}
