// RouterOS Hotspot HTML template — "Liquid Glass" theme.
// Curly-braced tokens are replaced at ZIP-build time; RouterOS $(...) syntax
// is preserved verbatim so the router can render error states and variables.

import {
  parsePaymentMethods,
  type PortalGuestMode,
  type PortalPaymentMethod,
} from "./portal/modes";
import {
  renderGuestHelperFiles,
  renderLoginExtras,
  type PortalGuestConfig,
  type PortalPosEntry,
} from "./portal/guest-pages.server";
import { VIEWPORT_CONTENT } from "./viewport";
import { escapeHtml, safeCssHex } from "./html-escape";

export interface PortalTheme {
  businessName: string;
  welcomeText: string;
  terms: string;
  primaryHex: string;
  glassTintHex: string;
  logoUrl?: string;
  heroUrl?: string;
  guestMode?: PortalGuestMode;
  paymentMethods?: PortalPaymentMethod[];
  sellerPhone?: string;
  sellerLabel?: string;
  trialMinutes?: number;
  trialCooldownHours?: number;
  needCodeLabel?: string;
  askDeskHint?: string;
  posEntries?: PortalPosEntry[];
  packages?: Array<{ label: string; durationLabel: string; priceLabel: string }>;
}

function guestConfigFromTheme(theme: PortalTheme): PortalGuestConfig {
  const mode = theme.guestMode ?? "voucher_only";
  const paymentMethods = parsePaymentMethods(theme.paymentMethods);
  return {
    mode,
    paymentMethods,
    sellerPhone: theme.sellerPhone ?? "",
    sellerLabel: theme.sellerLabel ?? "Talk to our seller",
    trialMinutes: theme.trialMinutes ?? 10,
    trialCooldownHours: theme.trialCooldownHours ?? 12,
    needCodeLabel: theme.needCodeLabel ?? "I don't have a code",
    askDeskHint: theme.askDeskHint ?? "Ask the front desk for a Wi-Fi voucher code.",
    helperBase: "",
    posEntries: theme.posEntries ?? [],
    packages: theme.packages ?? [],
  };
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

// RouterOS releases before 7.16 cannot reliably return more than roughly 4 KiB
// through the file `contents` property used for integrity verification. Keep
// generated portal text files below that boundary and load the remaining
// presentation rules as a second local stylesheet.
const STYLE_CSS = `@import url("style-extra.css");
/* Liquid Glass portal — generated */
:root{
  --primary:{{primary}};
  --tint:{{tint}};
  --ink:#0b1020;
  --paper:#f6f8ff;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
html,body{height:100%;min-height:100dvh;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",system-ui,sans-serif;color:var(--paper);background:#05070f;overflow:hidden;-webkit-tap-highlight-color:transparent}
.stage{position:fixed;inset:0;display:grid;place-items:center;padding:24px;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));isolation:isolate}
.mesh{position:absolute;inset:-20%;z-index:-2;filter:blur(60px) saturate(140%);opacity:.9;
  background:
    radial-gradient(35% 40% at 20% 25%, var(--primary) 0%, transparent 60%),
    radial-gradient(30% 35% at 80% 20%, var(--tint) 0%, transparent 60%),
    radial-gradient(40% 45% at 60% 90%, #7aa2ff 0%, transparent 65%),
    radial-gradient(30% 35% at 10% 90%, #ff7ad9 0%, transparent 60%);
  animation:drift 22s ease-in-out infinite alternate}
@keyframes drift{to{transform:translate3d(4%,-3%,0) rotate(3deg)}}
.grain{position:absolute;inset:0;z-index:-1;opacity:.08;pointer-events:none;
  background-image:radial-gradient(#fff 1px,transparent 1px);background-size:3px 3px}
.card{
  width:min(420px,100%);
  padding:28px 26px 24px;
  border-radius:28px;
  background:#1a2238;
  background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.06));
  border:1px solid rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(28px) saturate(180%);
  backdrop-filter:blur(28px) saturate(180%);
  box-shadow:0 30px 80px -20px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.35);
  text-align:center
}
.logo{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;background:rgba(255,255,255,.15) center/60% no-repeat;border:1px solid rgba(255,255,255,.25)}
.logo.has-img{background-image:url("img/logo.png");background-size:cover}
h1{font-size:22px;font-weight:600;letter-spacing:-.01em}
.sub{margin-top:6px;font-size:13px;color:rgba(255,255,255,.72);line-height:1.45}
form{margin-top:22px;display:grid;gap:12px}
.field{position:relative}
input{
  width:100%;padding:14px 16px;font-size:16px;color:#fff;letter-spacing:.14em;text-align:center;text-transform:uppercase;
  border-radius:14px;border:1px solid rgba(255,255,255,.22);
  background:rgba(255,255,255,.08);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  outline:none;transition:.2s;-webkit-appearance:none;appearance:none
}
input::placeholder{color:rgba(255,255,255,.5);letter-spacing:.1em}
input:focus{border-color:var(--primary);box-shadow:0 0 0 4px rgba(122,208,255,.3);box-shadow:0 0 0 4px color-mix(in oklab,var(--primary) 30%,transparent)}
button{
  padding:14px 16px;font-size:15px;font-weight:600;color:#0b1020;
  border:none;border-radius:14px;cursor:pointer;touch-action:manipulation;
  -webkit-appearance:none;appearance:none;
  background:#fff;background:linear-gradient(180deg,#fff, color-mix(in oklab,var(--primary) 40%, #fff));
  box-shadow:0 10px 30px -10px rgba(122,208,255,.45);box-shadow:0 10px 30px -10px color-mix(in oklab,var(--primary) 60%,transparent)
}
button:active{transform:translateY(1px)}
.err{margin-top:10px;padding:8px 12px;border-radius:10px;background:rgba(255,80,80,.18);border:1px solid rgba(255,80,80,.4);font-size:13px}
.terms{margin-top:18px;font-size:11px;color:rgba(255,255,255,.55);line-height:1.5}
.foot{margin-top:14px;font-size:11px;color:rgba(255,255,255,.45)}
`;

const STYLE_EXTRA_CSS = `/* Liquid Glass portal extras — generated */
.guest-btn{
  display:block;width:100%;padding:14px 16px;font-size:15px;font-weight:600;text-align:center;
  border-radius:14px;text-decoration:none;border:none;cursor:pointer;color:#0b1020;touch-action:manipulation;
  background:#fff;background:linear-gradient(180deg,#fff, color-mix(in oklab,var(--primary) 40%, #fff))
}
.guest-btn.secondary{
  color:var(--primary);background:transparent;border:1.5px solid var(--primary)
}
.wm{
  position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:9;
  padding:6px 12px;border-radius:999px;pointer-events:none;
  font-size:11px;letter-spacing:.06em;color:rgba(255,255,255,.42);
  background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.05));
  border:1px solid rgba(255,255,255,.16);
  -webkit-backdrop-filter:blur(14px) saturate(160%);
  backdrop-filter:blur(14px) saturate(160%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.2)
}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .card{background:#1a2238}
}
`;

const WATERMARK = `<div class="wm">Vibes by Nish</div>`;

const LOGIN_HTML = `<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="${VIEWPORT_CONTENT}"/>
<title>{{businessName}} — Wi-Fi Login</title>
<link rel="stylesheet" href="style.css"/>
</head>
<body>
<div class="stage">
  <div class="mesh"></div>
  <div class="grain"></div>
  <main class="card">
    <div class="logo{{logoClass}}"></div>
    <h1>{{businessName}}</h1>
    <p class="sub">{{welcomeText}}</p>
    $(if error)<div class="err">$(error)</div>$(endif)
    <form name="login" action="$(link-login-only)" method="post" onsubmit="this.password.value=this.username.value;return true;">
      <input type="hidden" name="dst" value="$(link-orig)"/>
      <input type="hidden" name="popup" value="true"/>
      <input type="hidden" name="password" value=""/>
      <div class="field">
        <input name="username" type="text" placeholder="voucher code" autocapitalize="characters" autocorrect="off" autocomplete="off" required/>
      </div>
      <button type="submit">Connect</button>
    </form>
    {{loginExtras}}
    <p class="terms">{{terms}}</p>
    <p class="foot">Powered by {{businessName}} · MikroTik Hotspot</p>
  </main>
</div>
${WATERMARK}
</body></html>`;

const STATUS_HTML = `<html>
<head><meta charset="utf-8"/><title>Connected — {{businessName}}</title><link rel="stylesheet" href="style.css"/></head>
<body><div class="stage"><div class="mesh"></div><div class="grain"></div>
<main class="card">
  <div class="logo{{logoClass}}"></div>
  <h1>You're online</h1>
  <p class="sub">Signed in as <b>$(username)</b></p>
  <div style="margin-top:18px;display:grid;gap:8px;font-size:13px;text-align:left;padding:14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15)">
    <div>IP: <b>$(ip)</b></div>
    <div>MAC: <b>$(mac)</b></div>
    <div>Uptime: <b>$(uptime)</b></div>
    <div>Time left: <b>$(session-time-left)</b></div>
    <div>Used: <b>$(bytes-in-nice) ↓ / $(bytes-out-nice) ↑</b></div>
  </div>
  <form action="$(link-logout)" method="post" style="margin-top:16px"><button type="submit">Sign out</button></form>
  <p class="foot">{{businessName}}</p>
</main></div>${WATERMARK}</body></html>`;

const LOGOUT_HTML = `<html><head><meta charset="utf-8"/><title>Signed out</title><link rel="stylesheet" href="style.css"/></head><body>
<div class="stage"><div class="mesh"></div><div class="grain"></div>
<main class="card"><div class="logo{{logoClass}}"></div><h1>Signed out</h1>
<p class="sub">Thanks for visiting {{businessName}}. See you soon.</p>
<form action="$(link-login)" method="get" style="margin-top:20px"><button type="submit">Sign back in</button></form>
</main></div>${WATERMARK}</body></html>`;

const ERROR_HTML = `<html><head><meta charset="utf-8"/><title>Error</title><link rel="stylesheet" href="style.css"/></head><body>
<div class="stage"><div class="mesh"></div><div class="grain"></div>
<main class="card"><div class="logo{{logoClass}}"></div><h1>Something went wrong</h1>
<p class="sub">$(error)</p>
<form action="$(link-login)" method="get" style="margin-top:20px"><button type="submit">Try again</button></form>
</main></div>${WATERMARK}</body></html>`;

const ALOGIN_HTML = `<html><head><meta charset="utf-8"/><title>Connecting…</title><link rel="stylesheet" href="style.css"/><meta http-equiv="refresh" content="0; url=$(link-redirect)"/></head><body>
<div class="stage"><div class="mesh"></div><div class="grain"></div>
<main class="card"><div class="logo{{logoClass}}"></div><h1>Connecting…</h1><p class="sub">Redirecting to $(link-redirect)</p></main>
</div>${WATERMARK}</body></html>`;

const RADVERT_HTML = ALOGIN_HTML;

export interface PortalFile {
  name: string;
  content: string;
}

export function renderPortalFiles(theme: PortalTheme): PortalFile[] {
  const guest = guestConfigFromTheme(theme);
  const vars = {
    businessName: escapeHtml(theme.businessName),
    welcomeText: escapeHtml(theme.welcomeText),
    terms: escapeHtml(theme.terms),
    primary: safeCssHex(theme.primaryHex, "#ffb547"),
    tint: safeCssHex(theme.glassTintHex, "#7ad0ff"),
    logoClass: theme.logoUrl ? " has-img" : "",
    loginExtras: renderLoginExtras(guest),
  };
  const helpers = renderGuestHelperFiles(
    guest,
    theme.businessName,
    safeCssHex(theme.primaryHex, "#ffb547"),
  );
  return [
    { name: "login.html", content: fill(LOGIN_HTML, vars) },
    { name: "status.html", content: fill(STATUS_HTML, vars) },
    { name: "logout.html", content: fill(LOGOUT_HTML, vars) },
    { name: "error.html", content: fill(ERROR_HTML, vars) },
    { name: "alogin.html", content: fill(ALOGIN_HTML, vars) },
    { name: "radvert.html", content: fill(RADVERT_HTML, vars) },
    { name: "style.css", content: fill(STYLE_CSS, vars) },
    { name: "style-extra.css", content: fill(STYLE_EXTRA_CSS, vars) },
    ...helpers,
    { name: "README.txt", content: readme(theme) },
  ];
}

function readme(t: PortalTheme): string {
  const mode = t.guestMode ?? "voucher_only";
  return `${t.businessName} — Liquid Glass Hotspot Portal
=============================================

Guest mode: ${mode}

Upload every file in this ZIP to the router's /flash/hotspot or /hotspot
directory using WinBox (Files tab -> drag & drop), or via FTP:

  ftp <router-ip>
  cd hotspot
  mput *

Then point the hotspot profile at this directory:

  /ip hotspot profile set [find name=hsprof-vouchers] html-directory=hotspot

For hybrid_light / commerce, MikroTik Magic deploy also enables RouterOS 7.1+
Hotspot trial (login-by includes trial, trial-user-profile=mm-trial,
trial-uptime matches the Portal trial minutes). Connect buttons on seller /
payment pages POST to $(link-login-only) as T-$(mac-esc).

Reload the captive portal on a phone and you'll see the frosted-glass login.
Payment method names and card colours are operator-customizable in the app.

If your router already has a live portal, back it up first:
  /file print where name~"hotspot/"
`;
}

// Bundle intended for direct deployment to a router's /hotspot directory.
// Returns only the text files (HTML/CSS); binary assets (logo/hero) are
// fetched by the router itself from signed URLs at deploy time.
export function renderPortalTextBundle(theme: PortalTheme): PortalFile[] {
  return renderPortalFiles(theme).filter((f) => !f.name.endsWith("README.txt"));
}
