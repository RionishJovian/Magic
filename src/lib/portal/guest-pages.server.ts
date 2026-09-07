/**
 * Hotspot HTML pages for hybrid_light / commerce guest modes.
 * Deployed into the router's html-directory — works on RouterOS 7.1+ captive portal.
 * Temporary access uses native Hotspot trial login (T-$(mac-esc)), not cloud payments.
 */

import { enabledPaymentMethods, type PortalGuestMode, type PortalPaymentMethod } from "./modes";
import { VIEWPORT_CONTENT } from "../viewport";
import { escapeHtml, safeCssHex } from "../html-escape";

export type PortalPosEntry = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type PortalGuestConfig = {
  mode: PortalGuestMode;
  paymentMethods: PortalPaymentMethod[];
  sellerPhone: string;
  sellerLabel: string;
  trialMinutes: number;
  trialCooldownHours: number;
  needCodeLabel: string;
  askDeskHint: string;
  helperBase: string;
  posEntries: PortalPosEntry[];
  packages: Array<{
    label: string;
    durationLabel: string;
    priceLabel: string;
  }>;
};

function esc(s: string): string {
  return escapeHtml(s);
}

/** RouterOS Hotspot trial Connect control — variables must stay unescaped. */
function trialConnectBlock(opts: { unlockRequiresCopy: boolean; buttonLabel?: string }): string {
  const label = esc(opts.buttonLabel ?? "Connect");
  const disabledAttr = opts.unlockRequiresCopy ? " disabled" : "";
  const opacity = opts.unlockRequiresCopy ? "opacity:.45;" : "";
  return `$(if trial == 'yes')
<form id="mm-trial-form" action="$(link-login-only)" method="post" style="display:none">
  <input type="hidden" name="dst" value="$(link-orig)"/>
  <input type="hidden" name="username" value="T-$(mac-esc)"/>
</form>
<button type="button" class="guest-btn" style="margin-top:12px;${opacity}" id="connect-btn"${disabledAttr}>${label}</button>
<p class="sub" style="margin-top:8px">Temporary access uses MikroTik Hotspot trial (RouterOS 7.1+).</p>
$(else)
<div class="guest-warn" style="margin-top:12px">Temporary access is not enabled on this hotspot profile. Redeploy the portal from MikroTik Magic so trial login is configured.</div>
$(endif)`;
}

function copyUnlockScript(): string {
  return `<script>
(function(){
  var btn=document.getElementById('copy-btn');
  var connect=document.getElementById('connect-btn');
  var hint=document.getElementById('copy-hint');
  var field=document.getElementById('copy-field');
  var form=document.getElementById('mm-trial-form');
  if(connect&&form){
    connect.addEventListener('click', function(){
      if(connect.disabled) return;
      form.submit();
    });
  }
  if(!btn||!connect||!field) return;
  btn.addEventListener('click', function(){
    var v=field.value||'';
    function done(){
      connect.disabled=false;
      connect.style.opacity='1';
      if(hint) hint.textContent='Copied. You can Connect for temporary access, then paste this in your browser or chat app.';
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(v).then(done).catch(function(){ field.select(); document.execCommand('copy'); done(); });
    } else { field.select(); document.execCommand('copy'); done(); }
  });
})();
</script>`;
}

function shell(title: string, body: string, primary: string): string {
  const color = safeCssHex(primary, "#7ad0ff");
  return `<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="${VIEWPORT_CONTENT}"/>
<title>${esc(title)}</title>
<link rel="stylesheet" href="style.css"/>
<style>
.guest-stack{margin-top:18px;display:grid;gap:10px;text-align:left}
.guest-opt{
  display:block;padding:14px 16px;border-radius:14px;text-decoration:none;color:inherit;
  border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08)
}
.guest-opt b{display:block;font-size:14px}
.guest-opt span{display:block;margin-top:4px;font-size:12px;color:rgba(255,255,255,.7);line-height:1.4}
.guest-btn{
  display:block;width:100%;padding:14px 16px;font-size:15px;font-weight:600;text-align:center;
  border-radius:14px;text-decoration:none;border:none;cursor:pointer;color:#0b1020;touch-action:manipulation;
  background:#fff;background:linear-gradient(180deg,#fff, color-mix(in oklab,${color} 40%, #fff))
}
.guest-btn.secondary{
  color:${color};background:transparent;border:1.5px solid ${color}
}
.guest-warn{
  margin-top:12px;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.45;text-align:left;
  background:rgba(255,200,60,.14);border:1px solid rgba(255,200,60,.35)
}
.guest-info{
  margin-top:10px;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.45;text-align:left;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);white-space:pre-wrap
}
.guest-row{display:flex;gap:8px;align-items:center}
.guest-row input{
  flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.22);
  background:rgba(255,255,255,.08);color:#fff;font-size:14px
}
.pos-dist{margin-top:6px;font-size:12px;color:${color}}
</style>
</head>
<body>
<div class="stage">
  <div class="mesh"></div>
  <div class="grain"></div>
  <main class="card">
${body}
  </main>
</div>
</body></html>`;
}

function methodHref(cfg: PortalGuestConfig, m: PortalPaymentMethod): string {
  const base = cfg.helperBase;
  if (m.action === "seller") return `${base}seller.html`;
  if (m.action === "pos") return `${base}pos.html`;
  if (m.action === "packages") return `${base}packages.html?m=${encodeURIComponent(m.id)}`;
  return `${base}pay-${encodeURIComponent(m.id)}.html`;
}

export function renderLoginExtras(cfg: PortalGuestConfig): string {
  if (cfg.mode === "voucher_only") {
    return `<p class="sub" style="margin-top:14px">${esc(cfg.askDeskHint)}</p>`;
  }
  const href =
    cfg.mode === "commerce" ? `${cfg.helperBase}methods.html` : `${cfg.helperBase}help.html`;
  return `<a class="guest-btn secondary" style="margin-top:12px" href="${esc(href)}">${esc(cfg.needCodeLabel)}</a>`;
}

export function renderHelpPage(cfg: PortalGuestConfig, businessName: string): string {
  const methods = enabledPaymentMethods(cfg.paymentMethods, cfg.mode);
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>Need a code?</h1>`);
  bits.push(`<p class="sub">${esc(cfg.askDeskHint)}</p>`);
  bits.push(`<div class="guest-stack">`);
  for (const m of methods) {
    bits.push(
      `<a class="guest-opt" style="border-color:${esc(m.accentHex)}" href="${esc(methodHref(cfg, m))}"><b>${esc(m.label)}</b><span>${esc(m.description)}</span></a>`,
    );
  }
  if (!methods.length) {
    bits.push(
      `<div class="guest-info">No acquisition methods are enabled. Ask the front desk for a voucher.</div>`,
    );
  }
  bits.push(`</div>`);
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:14px" href="${esc(cfg.helperBase)}login.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  return shell("Need a code", bits.join("\n"), "#7ad0ff");
}

export function renderMethodsPage(
  cfg: PortalGuestConfig,
  businessName: string,
  primary: string,
): string {
  const methods = enabledPaymentMethods(cfg.paymentMethods, "commerce");
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>Choose a method</h1>`);
  bits.push(`<div class="guest-stack">`);
  for (const m of methods) {
    bits.push(
      `<a class="guest-opt" style="border-color:${esc(m.accentHex)}" href="${esc(methodHref(cfg, m))}"><b>${esc(m.label)}</b><span>${esc(m.description)}</span></a>`,
    );
  }
  if (!methods.length) {
    bits.push(`<div class="guest-info">No payment methods are enabled for this portal.</div>`);
  }
  bits.push(`</div>`);
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:14px" href="${esc(cfg.helperBase)}login.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  return shell("Choose a method", bits.join("\n"), primary);
}

export function renderPackagesPage(
  cfg: PortalGuestConfig,
  businessName: string,
  primary: string,
  continueHref: string,
): string {
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>Select a package</h1>`);
  bits.push(`<div class="guest-stack">`);
  if (cfg.packages.length === 0) {
    bits.push(
      `<div class="guest-info">No packages are published yet. Ask the front desk for a voucher code.</div>`,
    );
  } else {
    for (const p of cfg.packages) {
      bits.push(
        `<a class="guest-opt" href="${esc(continueHref)}"><b>${esc(p.label)} — ${esc(p.priceLabel)}</b><span>${esc(p.durationLabel)}</span></a>`,
      );
    }
  }
  bits.push(`</div>`);
  bits.push(
    `<div class="guest-info" style="margin-top:14px">After you continue you get <b>${cfg.trialMinutes} minutes</b> of Hotspot trial access to finish payment, then enter the voucher code you receive.</div>`,
  );
  bits.push(
    `<a class="guest-btn" style="margin-top:12px" href="${esc(continueHref)}">Continue</a>`,
  );
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:8px" href="${esc(cfg.helperBase)}methods.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  return shell("Select a package", bits.join("\n"), primary);
}

export function renderPayInfoPage(
  cfg: PortalGuestConfig,
  method: PortalPaymentMethod,
  businessName: string,
  primary: string,
): string {
  const copyVal = (method.copyValue || "").trim();
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>${esc(method.label)}</h1>`);
  bits.push(
    `<p class="sub">Temporary internet for <b style="color:${safeCssHex(primary, "#7ad0ff")}">${cfg.trialMinutes} minutes</b> via Hotspot trial. Pay using the details below, then use your voucher code on the login page.</p>`,
  );
  if (method.infoTitle.trim()) {
    bits.push(`<div class="guest-info"><b>${esc(method.infoTitle)}</b></div>`);
  }
  if (method.infoBody.trim()) {
    bits.push(`<div class="guest-info">${esc(method.infoBody)}</div>`);
  }
  if (copyVal) {
    bits.push(`<div class="guest-row" style="margin-top:8px">`);
    bits.push(`<input id="copy-field" readonly value="${esc(copyVal)}"/>`);
    bits.push(
      `<button type="button" class="guest-btn" style="width:auto;padding:12px 16px" id="copy-btn">Copy</button>`,
    );
    bits.push(`</div>`);
    bits.push(
      `<p class="sub" style="margin-top:10px" id="copy-hint">Copy the details before connecting.</p>`,
    );
  }
  bits.push(
    trialConnectBlock({
      unlockRequiresCopy: !!copyVal,
      buttonLabel: "Connect",
    }),
  );
  bits.push(
    `<div class="guest-warn">Do not let it expire. After trial ends you may need to wait about ${cfg.trialCooldownHours} hours before temporary access is available again on this device.</div>`,
  );
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:12px" href="${esc(cfg.helperBase)}methods.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  if (copyVal) bits.push(copyUnlockScript());
  else {
    bits.push(`<script>
(function(){
  var connect=document.getElementById('connect-btn');
  var form=document.getElementById('mm-trial-form');
  if(connect&&form) connect.addEventListener('click', function(){ form.submit(); });
})();
</script>`);
  }
  return shell(method.label, bits.join("\n"), method.accentHex || primary);
}

export function renderSellerPage(
  cfg: PortalGuestConfig,
  businessName: string,
  primary: string,
): string {
  const phone = cfg.sellerPhone.trim() || "";
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>${esc(cfg.sellerLabel)}</h1>`);
  bits.push(
    `<p class="sub">By continuing you will have temporary internet access for <b style="color:${safeCssHex(primary, "#7ad0ff")}">${cfg.trialMinutes} minutes</b> (Hotspot trial). Send a message to purchase a plan, then log in with your voucher code.</p>`,
  );
  if (phone) {
    bits.push(`<div class="guest-info"><b>Send a message to:</b></div>`);
    bits.push(`<div class="guest-row" style="margin-top:8px">`);
    bits.push(`<input id="copy-field" readonly value="${esc(phone)}"/>`);
    bits.push(
      `<button type="button" class="guest-btn" style="width:auto;padding:12px 16px" id="copy-btn">Copy</button>`,
    );
    bits.push(`</div>`);
    bits.push(
      `<p class="sub" style="margin-top:10px" id="copy-hint">You can only Connect after copying the number.</p>`,
    );
  }
  bits.push(
    trialConnectBlock({
      unlockRequiresCopy: !!phone,
      buttonLabel: "Connect",
    }),
  );
  bits.push(
    `<div class="guest-warn">Do not let it expire. After the trial ends you may need to wait about ${cfg.trialCooldownHours} hours before temporary access is available again on this device.</div>`,
  );
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:12px" href="${esc(cfg.helperBase)}login.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  if (phone) bits.push(copyUnlockScript());
  else {
    bits.push(`<script>
(function(){
  var connect=document.getElementById('connect-btn');
  var form=document.getElementById('mm-trial-form');
  if(connect&&form) connect.addEventListener('click', function(){ form.submit(); });
})();
</script>`);
  }
  return shell(cfg.sellerLabel, bits.join("\n"), primary);
}

export function renderPosPage(
  cfg: PortalGuestConfig,
  businessName: string,
  primary: string,
): string {
  const bits: string[] = [];
  bits.push(`<div class="logo"></div>`);
  bits.push(`<h1>Points of sale</h1>`);
  bits.push(`<div class="guest-stack" id="pos-list">`);
  if (cfg.posEntries.length === 0) {
    bits.push(
      `<div class="guest-info">No points of sale are configured yet. Add Sites with addresses and map pins in the app.</div>`,
    );
  } else {
    cfg.posEntries.forEach((p, i) => {
      const lat = p.latitude;
      const lng = p.longitude;
      bits.push(
        `<div class="guest-opt" data-lat="${lat ?? ""}" data-lng="${lng ?? ""}" data-i="${i}">`,
      );
      bits.push(`<b>${esc(p.name)}</b>`);
      bits.push(`<span>${esc(p.address || "Address not set")}</span>`);
      bits.push(`<div class="pos-dist" data-dist>—</div>`);
      bits.push(`</div>`);
    });
  }
  bits.push(`</div>`);
  bits.push(
    `<a class="guest-btn secondary" style="margin-top:14px" href="${esc(cfg.helperBase)}login.html">back</a>`,
  );
  bits.push(`<p class="foot">${esc(businessName)}</p>`);
  bits.push(`<script>
(function(){
  function hav(a,b,c,d){
    var R=6371, toRad=Math.PI/180;
    var dLat=(c-a)*toRad, dLon=(d-b)*toRad;
    var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a*toRad)*Math.cos(c*toRad)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2*R*Math.asin(Math.sqrt(x));
  }
  function paint(lat,lng){
    var nodes=document.querySelectorAll('[data-lat]');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      var tLat=parseFloat(el.getAttribute('data-lat')||'');
      var tLng=parseFloat(el.getAttribute('data-lng')||'');
      var distEl=el.querySelector('[data-dist]');
      if(!distEl) continue;
      if(!isFinite(tLat)||!isFinite(tLng)){ distEl.textContent='Distance unavailable'; continue; }
      var km=hav(lat,lng,tLat,tLng);
      distEl.textContent='≈ '+km.toLocaleString(undefined,{maximumFractionDigits:1})+' km';
    }
  }
  if(!navigator.geolocation){
    var list=document.getElementById('pos-list');
    if(list){
      var note=document.createElement('div');
      note.className='guest-info';
      note.textContent='Location access is not available in this browser. Distances cannot be shown.';
      list.prepend(note);
    }
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function(pos){ paint(pos.coords.latitude, pos.coords.longitude); },
    function(){
      var list=document.getElementById('pos-list');
      if(!list) return;
      var note=document.createElement('div');
      note.className='guest-info';
      note.textContent='Allow location access to see live distance to each point of sale.';
      list.prepend(note);
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
  );
})();
</script>`);
  return shell("Points of sale", bits.join("\n"), primary);
}

export function renderGuestHelperFiles(
  cfg: PortalGuestConfig,
  businessName: string,
  primary: string,
): Array<{ name: string; content: string }> {
  if (cfg.mode === "voucher_only") return [];
  const methods = enabledPaymentMethods(cfg.paymentMethods, cfg.mode);
  const out: Array<{ name: string; content: string }> = [];

  if (cfg.mode === "hybrid_light") {
    out.push({ name: "help.html", content: renderHelpPage(cfg, businessName) });
  }
  if (cfg.mode === "commerce") {
    out.push({ name: "methods.html", content: renderMethodsPage(cfg, businessName, primary) });
    const packageContinue =
      methods.find((m) => m.action === "pay_info") != null
        ? `${cfg.helperBase}pay-${methods.find((m) => m.action === "pay_info")!.id}.html`
        : methods.find((m) => m.action === "seller")
          ? `${cfg.helperBase}seller.html`
          : `${cfg.helperBase}methods.html`;
    out.push({
      name: "packages.html",
      content: renderPackagesPage(cfg, businessName, primary, packageContinue),
    });
  }

  const needSeller = methods.some((m) => m.action === "seller");
  const needPos = methods.some((m) => m.action === "pos");
  if (needSeller) {
    out.push({ name: "seller.html", content: renderSellerPage(cfg, businessName, primary) });
  }
  if (needPos) {
    out.push({ name: "pos.html", content: renderPosPage(cfg, businessName, primary) });
  }
  for (const m of methods.filter((x) => x.action === "pay_info")) {
    out.push({
      name: `pay-${m.id}.html`,
      content: renderPayInfoPage(cfg, m, businessName, primary),
    });
  }
  return out;
}
