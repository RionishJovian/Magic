import { CONNECTOR_PRODUCTION_ORIGIN } from "@/lib/connector-install-origin";
import { buildSyslogShipperScript, syslogIngestUrl } from "@/lib/syslog-ingest";

export type ScriptCategory =
  | "Master"
  | "Hotspot"
  | "Firewall"
  | "VLAN"
  | "PPPoE"
  | "Wireless"
  | "VPN"
  | "QoS"
  | "Backup"
  | "Monitoring"
  | "DHCP"
  | "DNS";

export interface Script {
  id: string;
  title: string;
  description: string;
  category: ScriptCategory;
  tags: string[];
  routerOS: string;
  code: string;
}

export const CATEGORIES: ScriptCategory[] = [
  "Master",
  "Hotspot",
  "Firewall",
  "VLAN",
  "PPPoE",
  "Wireless",
  "VPN",
  "QoS",
  "Backup",
  "Monitoring",
  "DHCP",
  "DNS",
];

export const SCRIPTS: Script[] = [
  {
    id: "master-hotspot-gateway",
    title: "Master config — Starlink/ISP → RouterBoard → AP hotspot with vouchers",
    description:
      "End-to-end RouterBoard baseline for the topology WAN (Starlink/ISP fibre) → MikroTik gateway → Access Point. Sets identity, WAN DHCP client, LAN bridge, DHCP server, NAT, baseline firewall, DNS cache, NTP, Hotspot server on the LAN bridge with a voucher-friendly user profile, 3 time plans (1h / 1d / 7d), and 7 data-quota plans (500MB / 1GB / 2GB / 3GB / 5GB / 7GB / 10GB). Paste as one block into a factory-reset RouterOS 7.x device, then plug the AP into any LAN port in bridge mode.",
    category: "Master",
    tags: [
      "master",
      "hotspot",
      "voucher",
      "starlink",
      "gateway",
      "wan",
      "lan",
      "dhcp",
      "nat",
      "dns",
      "firewall",
      "access-point",
    ],
    routerOS: "7.x",
    code: `# =====================================================================
# MASTER CONFIG - MikroTik RouterBoard Hotspot Gateway (Voucher system)
# Topology:
#   [Starlink / ISP fibre]  ->  ether1 (WAN)
#   [MikroTik RouterBoard]  ->  ether2..etherN + AP (LAN bridge, 192.168.88.0/24)
#   [Access Point in bridge mode] -> serves Wi-Fi to clients that log in
#       via the Hotspot captive portal using a voucher code from admin.
#
# Tested on RouterOS 7.x. Change ONLY the values marked <<< CHANGE ME >>>.
# Apply on a factory-defaulted router (/system reset-configuration no-defaults=yes).
# =====================================================================

# --- 1. Identity, clock, users -------------------------------------------------
/system identity set name="HOTSPOT-GW"
/system clock set time-zone-name=Asia/Yangon                      ;# <<< CHANGE ME >>>
/system ntp client set enabled=yes servers=time.cloudflare.com,time.google.com
/user set admin password="ChangeThisStrongAdminPass!"              ;# <<< CHANGE ME >>>

# --- 2. Interface lists (WAN / LAN) -------------------------------------------
/interface list
add name=WAN
add name=LAN
/interface list member
add list=WAN interface=ether1

# --- 3. LAN bridge (all ports the AP + wired clients plug into) ---------------
/interface bridge
add name=bridge-lan protocol-mode=rstp comment="LAN bridge for AP + wired clients"
/interface bridge port
add bridge=bridge-lan interface=ether2
add bridge=bridge-lan interface=ether3
add bridge=bridge-lan interface=ether4
add bridge=bridge-lan interface=ether5
/interface list member
add list=LAN interface=bridge-lan

# --- 4. WAN - DHCP client on ether1 (Starlink / ISP fibre CPE) ----------------
/ip dhcp-client
add interface=ether1 disabled=no use-peer-dns=yes use-peer-ntp=yes \\
    add-default-route=yes default-route-distance=1 comment="WAN uplink"

# --- 5. LAN IP + DHCP server on the bridge ------------------------------------
/ip address
add address=192.168.88.1/24 interface=bridge-lan comment="LAN gateway IP"

/ip pool
add name=hotspot-pool ranges=192.168.88.10-192.168.88.254

/ip dhcp-server
add name=lan-dhcp interface=bridge-lan address-pool=hotspot-pool \\
    lease-time=1h disabled=no
/ip dhcp-server network
add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1 \\
    domain=hotspot.lan

# --- 6. DNS cache (router serves DNS to clients) ------------------------------
/ip dns set servers=1.1.1.1,9.9.9.9 allow-remote-requests=yes cache-size=10240KiB

# --- 7. NAT - masquerade LAN out the WAN --------------------------------------
/ip firewall nat
add chain=srcnat action=masquerade out-interface-list=WAN comment="LAN -> WAN masq"

# --- 8. Baseline firewall -----------------------------------------------------
/ip firewall filter
add chain=input action=accept connection-state=established,related comment="est/rel"
add chain=input action=drop  connection-state=invalid              comment="invalid"
add chain=input action=accept protocol=icmp                        comment="ICMP"
add chain=input action=accept in-interface-list=LAN                comment="LAN mgmt"
add chain=input action=drop  in-interface-list=WAN                 comment="drop WAN input"

add chain=forward action=accept connection-state=established,related
add chain=forward action=drop  connection-state=invalid
add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN
add chain=forward action=accept in-interface-list=WAN out-interface-list=LAN \\
    connection-state=established,related
add chain=forward action=drop  in-interface-list=WAN comment="drop unsolicited WAN"

# --- 9. HOTSPOT server on the LAN bridge (captive portal) ---------------------
/ip hotspot profile
add name=hsprof-vouchers hotspot-address=192.168.88.1 dns-name=login.hotspot.lan \\
    html-directory=hotspot login-by=http-chap,http-pap \\
    use-radius=no rate-limit="" split-user-domain=no

/ip hotspot user profile
add name=voucher-1h  session-timeout=1h  shared-users=1 rate-limit="2M/5M"  \\
    add-mac-cookie=yes mac-cookie-timeout=1h  comment="1 hour voucher, 5/2 Mbps"
add name=voucher-1d  session-timeout=1d  shared-users=1 rate-limit="3M/10M" \\
    add-mac-cookie=yes mac-cookie-timeout=1d  comment="1 day voucher, 10/3 Mbps"
add name=voucher-7d  session-timeout=7d  shared-users=2 rate-limit="5M/20M" \\
    add-mac-cookie=yes mac-cookie-timeout=7d  comment="7 day voucher, 20/5 Mbps"
add name=voucher-500mb shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=524288000" \\
    comment="500 MB data voucher"
add name=voucher-1gb   shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=1048576000" \\
    comment="1 GB data voucher"
add name=voucher-2gb   shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=2097152000" \\
    comment="2 GB data voucher"
add name=voucher-3gb   shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=3145728000" \\
    comment="3 GB data voucher"
add name=voucher-5gb   shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=5242880000" \\
    comment="5 GB data voucher"
add name=voucher-7gb   shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=7340032000" \\
    comment="7 GB data voucher"
add name=voucher-10gb  shared-users=1 rate-limit="5M/5M" add-mac-cookie=yes \\
    on-login="/ip hotspot user set [find name=\\$user] limit-bytes-total=10485760000" \\
    comment="10 GB data voucher"

/ip hotspot
add name=hs-lan interface=bridge-lan address-pool=hotspot-pool profile=hsprof-vouchers \\
    addresses-per-mac=1 disabled=no idle-timeout=5m

# Walled garden - allow BEFORE login (payment / status pages).
/ip hotspot walled-garden
add dst-host=*.mikrotik.com   action=allow
add dst-host=*.starlink.com   action=allow
add dst-host=pool.ntp.org     action=allow

# --- 10. Sample voucher codes (delete / regenerate as needed) -----------------
/ip hotspot user
add name=VCH-1H-DEMO01 password=VCH-1H-DEMO01 profile=voucher-1h comment="demo 1h"
add name=VCH-1D-DEMO01 password=VCH-1D-DEMO01 profile=voucher-1d comment="demo 1d"
add name=VCH-7D-DEMO01 password=VCH-7D-DEMO01 profile=voucher-7d comment="demo 7d"

# --- 11. QoS - fair share across all hotspot clients --------------------------
/queue type
add name=pcq-down kind=pcq pcq-classifier=dst-address pcq-rate=0
add name=pcq-up   kind=pcq pcq-classifier=src-address pcq-rate=0
/queue simple
add name=hotspot-fair target=192.168.88.0/24 queue=pcq-down/pcq-up \\
    comment="Fair share among all hotspot users"

# --- 12. Logging & backup -----------------------------------------------------
/system logging add topics=hotspot,info action=memory
/system scheduler
add name=daily-backup interval=1d start-time=02:30:00 \\
    on-event="/system backup save name=auto-backup"

# =====================================================================
# Verify:
#   /ip address print         -> WAN got an IP, LAN is 192.168.88.1/24
#   /ip hotspot active print  -> empty until a client logs in
#   Connect a phone to the AP, browse anywhere -> captive portal appears.
#   Enter VCH-1H-DEMO01 / VCH-1H-DEMO01 to test.
# =====================================================================`,
  },
  {
    id: "magic-hub-starlink-prep",
    title: "Magic Hub — 1) Factory board prep (optional WAN/LAN)",
    description:
      "OPTIONAL — only for a factory-fresh RouterOS 7 board that still needs Starlink WAN + a new LAN. Skip if the board already has a default route and internet. The app Connect via Hub paste now sets www-ssl, magic-https, and rest-api itself. Change ONLY the <<< CHANGE ME >>> lines. Never paste the Connect via Hub key script here.",
    category: "Master",
    tags: ["cloud", "wireguard", "starlink", "wan", "cgnat", "tls", "rest", "ntp", "ddns", "hub"],
    routerOS: "7.x",
    code: `# =====================================================================
# MAGIC HUB — OPTIONAL factory board prep (WinBox New Terminal)
# Skip this if the board already has WAN (default route) and a working LAN.
# The app Connect via Hub paste already enables www-ssl + cert + rest-api.
# RouterOS 7.1+ only (not TILE / ROS 6). ether1 = Starlink.
# After WAN works: Routers → Add router → Magic Hub → paste window only.
# Do NOT paste the Connect via Hub key script here — copy that from the app.
# Hotspot vouchers: use the Master config script separately.
# =====================================================================

/system identity set name="SITE-ROUTER"                            ;# <<< CHANGE ME >>>

/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes use-peer-ntp=no disabled=no comment="Starlink WAN"

/interface bridge add name=bridge1
/interface bridge port add bridge=bridge1 interface=ether2
/interface bridge port add bridge=bridge1 interface=ether3
/ip address add address=192.168.10.1/24 interface=bridge1 comment="LAN"
/ip pool add name=lan-pool ranges=192.168.10.100-192.168.10.200
/ip dhcp-server add name=lan-dhcp interface=bridge1 address-pool=lan-pool disabled=no
/ip dhcp-server network add address=192.168.10.0/24 gateway=192.168.10.1 dns-server=192.168.10.1

/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Starlink NAT"

/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/system ntp client set enabled=yes
/system ntp client servers add address=time.cloudflare.com

/ip firewall filter
add chain=input action=accept connection-state=established,related,untracked
add chain=input action=drop connection-state=invalid
add chain=input action=accept in-interface=bridge1
add chain=input action=accept protocol=icmp
add chain=input action=drop in-interface=ether1
add chain=forward action=accept connection-state=established,related,untracked
add chain=forward action=drop connection-state=invalid
add chain=forward action=accept in-interface=bridge1

# Wait until ether1 has an address and the clock is not 1970, then:
/ip cloud set ddns-enabled=yes
:delay 5s
/ip cloud print

/certificate add name=magic-https common-name=router days-valid=3650
/certificate sign magic-https
/ip service set www-ssl certificate=magic-https port=443 disabled=no

# Confirm WAN: /ip route print where dst-address=0.0.0.0/0
# Then app only: Routers → Add router → Magic Hub → paste window (not this Scripts page).`,
  },
  {
    id: "magic-hub-after-script",
    title: "Magic Hub — 2) Fix old tunnel (/24 + MTU)",
    description:
      "Recovery only — skip unless an old Connect script left magic-cloud on /32. Fresh Connect via Hub pastes already set /24 + MTU 1280. Prefer re-pasting Show paste window over this. Replace 10.77.0.X with the Tunnel IP on the router card.",
    category: "VPN",
    tags: ["cloud", "wireguard", "starlink", "mtu", "cgnat", "recovery"],
    routerOS: "7.x",
    code: `# =====================================================================
# MAGIC HUB — recovery only (/32 → /24 + MTU)
# Prefer: app → Show paste window → re-paste the full Connect script.
# Use this block only if you cannot open the paste window.
# Replace 10.77.0.X with Tunnel IP from the router card (drop /32).
# =====================================================================

/ip address remove [find interface="magic-cloud"]
/ip address add address=10.77.0.X/24 interface=magic-cloud comment="MikroTik Magic tunnel address"

/interface wireguard set [find name=magic-cloud] mtu=1280
/ip firewall mangle add chain=output out-interface=magic-cloud protocol=tcp tcp-flags=syn action=change-mss new-mss=1160 passthrough=yes comment="magic-cloud mss out"

# Then in Magic: Check now → Test. Expect Reachable — REST OK.`,
  },
  {
    id: "magic-hub-verify",
    title: "Magic Hub — 3) Verify (optional read-only)",
    description:
      "Optional read-only checks if Test fails. Prefer the prints at the end of the Connect paste. Good: last-handshake seconds ago, www-ssl has a certificate, tunnel /24. Ignore hub ICMP.",
    category: "VPN",
    tags: ["cloud", "wireguard", "verify", "rest"],
    routerOS: "7.x",
    code: `# =====================================================================
# MAGIC HUB — optional verify (read-only)
# Prefer: use the printout at the end of the Connect via Hub paste.
# Do not chase ping to the hub or 10.77.0.1 (ICMP often blocked).
# =====================================================================

/ip route print where dst-address=0.0.0.0/0
/interface wireguard peers print detail where interface=magic-cloud
/ip address print where interface=magic-cloud
/ip service print where name=www-ssl
/user group print where name=full

# Good: default route exists (WAN)
# Good: last-handshake a few seconds ago (tx/rx > 0)
# Good: magic-cloud address 10.77.0.N/24 (not /32)
# Good: www-ssl disabled=no certificate not empty
# Good: full group policy includes rest-api
# Then app → Check now → Test (not more Scripts hopping)
# Optional local REST (password = WinBox admin):
# /tool fetch url="https://127.0.0.1/rest/system/resource" user=admin password=YOUR_PASSWORD`,
  },
  {
    id: "hotspot-voucher-generator",
    title: "Bulk voucher generator (100 codes)",
    description:
      "RouterOS script that generates 100 random 8-character voucher codes on the voucher-1d profile and prints them so the admin can hand them out.",
    category: "Hotspot",
    tags: ["voucher", "generator", "script", "hotspot"],
    routerOS: "7.x",
    code: `# Generates 100 vouchers on profile "voucher-1d". Change count/profile as needed.
:local count 100
:local profile "voucher-1d"
:local chars  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
:for i from=1 to=$count do={
  :local code ""
  :for j from=1 to=8 do={
    :local n [:rand 0 ([:len $chars] - 1)]
    :set code ($code . [:pick $chars $n ($n + 1)])
  }
  /ip hotspot user add name=$code password=$code profile=$profile comment="batch"
  :put $code
}`,
  },
  {
    id: "hotspot-bypass-mac",
    title: "Bypass MAC address (staff / printers)",
    description:
      "Whitelist a MAC so the device skips the captive portal - useful for staff laptops, printers or CCTV behind the AP.",
    category: "Hotspot",
    tags: ["bypass", "mac", "ip-binding", "staff"],
    routerOS: "7.x",
    code: `/ip hotspot ip-binding
add mac-address=AA:BB:CC:DD:EE:FF type=bypassed comment="Front desk printer"`,
  },
  {
    id: "fw-baseline",
    title: "Baseline firewall (WAN / LAN)",
    description:
      "Sane default input/forward chain with established/related accept, invalid drop, and WAN drop.",
    category: "Firewall",
    tags: ["input", "forward", "wan", "lan"],
    routerOS: "7.x",
    code: `/ip firewall filter
add chain=input action=accept connection-state=established,related comment="accept established,related"
add chain=input action=drop  connection-state=invalid comment="drop invalid"
add chain=input action=accept protocol=icmp comment="accept ICMP"
add chain=input action=accept in-interface-list=LAN comment="accept LAN mgmt"
add chain=input action=drop  in-interface-list=WAN comment="drop all other WAN input"

add chain=forward action=accept connection-state=established,related
add chain=forward action=drop  connection-state=invalid
add chain=forward action=accept in-interface-list=LAN out-interface-list=WAN
add chain=forward action=drop  in-interface-list=WAN comment="drop unsolicited WAN forward"`,
  },
  {
    id: "fw-portknock",
    title: "Port knock for Winbox",
    description:
      "Three-stage port knock that temporarily allows Winbox from the knocking IP for 1 hour.",
    category: "Firewall",
    tags: ["port-knock", "winbox", "security"],
    routerOS: "7.x",
    code: `/ip firewall filter
add chain=input protocol=tcp dst-port=1111 action=add-src-to-address-list address-list=knock1 address-list-timeout=15s
add chain=input protocol=tcp dst-port=2222 src-address-list=knock1 action=add-src-to-address-list address-list=knock2 address-list-timeout=15s
add chain=input protocol=tcp dst-port=3333 src-address-list=knock2 action=add-src-to-address-list address-list=winbox-ok address-list-timeout=1h
add chain=input protocol=tcp dst-port=8291 src-address-list=winbox-ok action=accept comment="Winbox after knock"`,
  },
  {
    id: "fw-blocklist",
    title: "Auto-update DShield blocklist",
    description:
      "Fetches the DShield top attackers list daily and drops matching sources on the WAN.",
    category: "Firewall",
    tags: ["blocklist", "scheduler", "threat-intel"],
    routerOS: "7.x",
    code: `/system script
add name=update-dshield source={
  /tool fetch url="https://www.dshield.org/block.txt" mode=https dst-path=dshield.txt
  /ip firewall address-list remove [find list=dshield]
  :local content [/file get dshield.txt contents]
  :foreach line in=[:toarray [:tostr $content]] do={
    :if ([:pick $line 0 1] != "#") do={
      :local ip [:pick $line 0 [:find $line "\\t"]]
      :if ([:len $ip] > 6) do={
        /ip firewall address-list add list=dshield address=$ip timeout=1d
      }
    }
  }
}
/system scheduler
add name=dshield-daily interval=1d on-event=update-dshield start-time=03:00:00

/ip firewall raw
add chain=prerouting src-address-list=dshield action=drop in-interface-list=WAN`,
  },
  {
    id: "vlan-trunk",
    title: "Trunk + access VLANs on bridge",
    description:
      "Bridge VLAN filtering with a trunk uplink (ether1) and access ports on VLAN 10 and 20.",
    category: "VLAN",
    tags: ["bridge", "trunk", "access", "vlan-filtering"],
    routerOS: "7.x",
    code: `/interface bridge
add name=bridge1 vlan-filtering=no

/interface bridge port
add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged
add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged
add bridge=bridge1 interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged

/interface bridge vlan
add bridge=bridge1 vlan-ids=10 tagged=bridge1,ether1 untagged=ether2
add bridge=bridge1 vlan-ids=20 tagged=bridge1,ether1 untagged=ether3

/interface vlan
add name=vlan10 vlan-id=10 interface=bridge1
add name=vlan20 vlan-id=20 interface=bridge1

/interface bridge set bridge1 vlan-filtering=yes`,
  },
  {
    id: "vlan-mgmt",
    title: "Management VLAN 99",
    description: "Isolates router management on VLAN 99 with its own IP and firewall input list.",
    category: "VLAN",
    tags: ["management", "isolation"],
    routerOS: "7.x",
    code: `/interface bridge vlan add bridge=bridge1 vlan-ids=99 tagged=bridge1,ether1
/interface vlan add name=vlan99-mgmt vlan-id=99 interface=bridge1
/ip address add address=10.99.0.1/24 interface=vlan99-mgmt
/interface list add name=MGMT
/interface list member add list=MGMT interface=vlan99-mgmt
/ip firewall filter add chain=input in-interface-list=MGMT action=accept place-before=0 comment="mgmt VLAN"`,
  },
  {
    id: "pppoe-client",
    title: "PPPoE client on WAN",
    description:
      "PPPoE dial-up over ether1 with default route and MSS clamping for common ISP MTU.",
    category: "PPPoE",
    tags: ["client", "isp", "mss-clamp"],
    routerOS: "7.x",
    code: `/interface pppoe-client
add name=pppoe-wan interface=ether1 user=USERNAME password=PASSWORD \\
    disabled=no add-default-route=yes use-peer-dns=yes default-route-distance=1

/ip firewall mangle
add chain=forward protocol=tcp tcp-flags=syn tcp-mss=!0-1452 action=change-mss new-mss=1452 \\
    out-interface=pppoe-wan comment="clamp MSS to PMTU"`,
  },
  {
    id: "pppoe-server",
    title: "PPPoE server with profiles",
    description: "Runs a PPPoE access concentrator with a 10/10 Mbps profile and local user pool.",
    category: "PPPoE",
    tags: ["server", "bng", "profile"],
    routerOS: "7.x",
    code: `/ip pool add name=pppoe-pool ranges=10.10.10.10-10.10.10.254
/ppp profile
add name=pppoe-10m local-address=10.10.10.1 remote-address=pppoe-pool \\
    rate-limit="10M/10M" only-one=yes dns-server=1.1.1.1,9.9.9.9

/interface pppoe-server server
add service-name=my-isp interface=ether2 default-profile=pppoe-10m disabled=no

/ppp secret add name=client1 password=secret1 service=pppoe profile=pppoe-10m`,
  },
  {
    id: "capsman-wifi",
    title: "CAPsMAN 2.4/5 GHz provisioning",
    description:
      "Central controller config that auto-provisions dual-band CAPs with WPA2 and country regulations.",
    category: "Wireless",
    tags: ["capsman", "wifi", "provision"],
    routerOS: "7.x",
    code: `/caps-man security
add name=sec-wpa2 authentication-types=wpa2-psk encryption=aes-ccm passphrase="ChangeMe!"

/caps-man configuration
add name=cfg-2g country=united-states mode=ap ssid=MyNetwork band=2ghz-b/g/n \\
    security=sec-wpa2 datapath.bridge=bridge1
add name=cfg-5g country=united-states mode=ap ssid=MyNetwork band=5ghz-a/n/ac \\
    security=sec-wpa2 datapath.bridge=bridge1

/caps-man provisioning
add action=create-dynamic-enabled hw-supported-modes=g master-configuration=cfg-2g
add action=create-dynamic-enabled hw-supported-modes=a master-configuration=cfg-5g

/caps-man manager set enabled=yes`,
  },
  {
    id: "wg-server",
    title: "WireGuard server + peer",
    description: "WireGuard endpoint on UDP 13231 with a /24 tunnel and one peer template.",
    category: "VPN",
    tags: ["wireguard", "site-to-site", "roadwarrior"],
    routerOS: "7.x",
    code: `/interface wireguard
add name=wg0 listen-port=13231 mtu=1420

/ip address add address=10.66.66.1/24 interface=wg0

/interface wireguard peers
add interface=wg0 name=peer-laptop public-key="PEER_PUBKEY_HERE" \\
    allowed-address=10.66.66.2/32 persistent-keepalive=25s

/ip firewall filter
add chain=input protocol=udp dst-port=13231 action=accept place-before=0 comment="WireGuard"
add chain=forward in-interface=wg0 action=accept place-before=0`,
  },
  {
    id: "ipsec-site",
    title: "IPsec site-to-site (IKEv2)",
    description:
      "IKEv2/AES-256 site tunnel between two /24 LANs. Replace peer IP, secret and subnets.",
    category: "VPN",
    tags: ["ipsec", "ikev2", "site-to-site"],
    routerOS: "7.x",
    code: `/ip ipsec profile
add name=ike2 dh-group=modp2048 enc-algorithm=aes-256 hash-algorithm=sha256 lifetime=8h

/ip ipsec proposal
add name=ike2 auth-algorithms=sha256 enc-algorithms=aes-256-cbc pfs-group=modp2048

/ip ipsec peer
add name=siteB address=203.0.113.10/32 profile=ike2 exchange-mode=ike2

/ip ipsec identity
add peer=siteB auth-method=pre-shared-key secret="STRONG_SHARED_SECRET" \\
    generate-policy=port-strict

/ip ipsec policy
add peer=siteB src-address=192.168.10.0/24 dst-address=192.168.20.0/24 \\
    tunnel=yes proposal=ike2 action=encrypt`,
  },
  {
    id: "qos-queue-tree",
    title: "Simple queue per-IP fair share",
    description: "PCQ-based queue that shares WAN bandwidth fairly across all LAN clients.",
    category: "QoS",
    tags: ["pcq", "simple-queue", "fair-share"],
    routerOS: "7.x",
    code: `/queue type
add name=pcq-down kind=pcq pcq-classifier=dst-address pcq-rate=0
add name=pcq-up   kind=pcq pcq-classifier=src-address pcq-rate=0

/queue simple
add name=lan-fair target=192.168.88.0/24 \\
    max-limit=200M/50M queue=pcq-down/pcq-up`,
  },
  {
    id: "backup-email",
    title: "Nightly backup + email",
    description: "Exports config and binary backup, emails both to an ops mailbox, then cleans up.",
    category: "Backup",
    tags: ["scheduler", "email", "export"],
    routerOS: "7.x",
    code: `/tool e-mail set address=smtp.example.com port=587 start-tls=yes \\
    user=router@example.com password="APP_PASSWORD" from=router@example.com

/system script
add name=nightly-backup source={
  :local name ([/system identity get name] . "-" . [:pick [/system clock get date] 0 11])
  /export file=$name
  /system backup save name=$name
  :delay 5s
  /tool e-mail send to=ops@example.com subject="Backup $name" \\
      file=($name . ".rsc"),($name . ".backup") body="Automated nightly backup"
  :delay 10s
  /file remove [find name~"$name"]
}

/system scheduler
add name=nightly-backup interval=1d start-time=02:30:00 on-event=nightly-backup`,
  },
  {
    id: "monitor-wan",
    title: "WAN failover with netwatch",
    description:
      "Pings 1.1.1.1 through the primary WAN; on failure, raises the primary route distance so the backup takes over.",
    category: "Monitoring",
    tags: ["netwatch", "failover", "route"],
    routerOS: "7.x",
    code: `/ip route
add dst-address=1.1.1.1/32 gateway=<PRIMARY_GW> scope=10 comment="probe-primary"

/tool netwatch
add host=1.1.1.1 interval=10s timeout=1s \\
    up-script=":/ip route set [find comment=\\"wan-primary\\"] distance=1" \\
    down-script=":/ip route set [find comment=\\"wan-primary\\"] distance=50"`,
  },
  {
    id: "syslog-ai-https-shipper",
    title: "Syslog AI — HTTPS log shipper",
    description:
      "RouterOS 7 scheduler that POSTs new /log lines to MikroTik Magic Syslog AI over HTTPS every 15s. Replace PASTE_TOKEN with the one-time token from Syslog AI. Outbound 443 only — not UDP syslog.",
    category: "Monitoring",
    tags: ["syslog", "syslog-ai", "https", "ingest", "scheduler"],
    routerOS: "7.x",
    code: buildSyslogShipperScript(syslogIngestUrl(CONNECTOR_PRODUCTION_ORIGIN, "PASTE_TOKEN")),
  },
  {
    id: "monitor-syslog",
    title: "Remote syslog to Graylog/ELK",
    description:
      "UDP 514 to a LAN collector (Graylog/ELK). Not Syslog AI — Magic uses the HTTPS shipper script instead.",
    category: "Monitoring",
    tags: ["syslog", "logging", "siem"],
    routerOS: "7.x",
    code: `/system logging action
add name=remote target=remote remote=10.0.0.50 remote-port=514 src-address=0.0.0.0
/system logging
add topics=info,!debug action=remote
add topics=warning         action=remote
add topics=error,critical  action=remote`,
  },
  {
    id: "dhcp-server",
    title: "DHCP server on bridge",
    description: "Standard DHCP setup on the LAN bridge with a /24 pool and router as gateway/DNS.",
    category: "DHCP",
    tags: ["server", "pool", "lease"],
    routerOS: "7.x",
    code: `/ip pool add name=lan-pool ranges=192.168.88.100-192.168.88.254
/ip dhcp-server
add name=lan-dhcp interface=bridge1 address-pool=lan-pool lease-time=1d disabled=no
/ip dhcp-server network
add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1 domain=lan`,
  },
  {
    id: "dhcp-static",
    title: "Convert active lease to static",
    description: "One-liner that pins the currently active lease of a MAC to a fixed IP.",
    category: "DHCP",
    tags: ["static-lease", "reservation"],
    routerOS: "7.x",
    code: `/ip dhcp-server lease make-static [find mac-address="AA:BB:CC:DD:EE:FF"]`,
  },
  {
    id: "dns-adblock",
    title: "DNS ad-block with static entries",
    description:
      "Downloads a hosts-format blocklist and imports it as DNS static A records pointing to 0.0.0.0.",
    category: "DNS",
    tags: ["adblock", "static", "scheduler"],
    routerOS: "7.x",
    code: `/ip dns set servers=1.1.1.1,9.9.9.9 allow-remote-requests=yes cache-size=10240KiB

/system script
add name=update-adblock source={
  /tool fetch url="https://adaway.org/hosts.txt" mode=https dst-path=adblock.txt
  /ip dns static remove [find comment="adblock"]
  :local content [/file get adblock.txt contents]
  :foreach line in=[:toarray [:tostr $content]] do={
    :if ([:pick $line 0 8] = "127.0.0.1") do={
      :local host [:pick $line 10 [:len $line]]
      /ip dns static add name=$host address=0.0.0.0 comment="adblock"
    }
  }
}
/system scheduler add name=adblock interval=1d on-event=update-adblock start-time=04:00:00`,
  },
  {
    id: "dns-split",
    title: "Split-horizon DNS for internal services",
    description:
      "Answers *.corp.local with internal IPs while forwarding everything else upstream.",
    category: "DNS",
    tags: ["split-horizon", "internal"],
    routerOS: "7.x",
    code: `/ip dns static
add regexp=".*\\\\.corp\\\\.local" address=10.0.0.10 comment="internal wildcard"
add name=git.corp.local address=10.0.0.20
add name=wiki.corp.local address=10.0.0.21`,
  },
];
