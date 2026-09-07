import type { Dict } from "../types";

/**
 * Burmese (Unicode).
 *
 * `ui` holds feature, tab and section titles, which are translated. Action
 * buttons are rendered through `t.action(...)` and always stay English, so they
 * must never appear in this catalog — the audit fails the build if they do.
 */
export const my: Dict = {
  ui: {
    Advanced: "အဆင့်မြင့်",
    "Could not load voucher plans. Try again in a moment.":
      "Voucher plan များကို မတင်နိုင်ပါ။ ခဏနေရင် ထပ်စမ်းပါ။",
    "Could not load recent batches for this hotspot.":
      "ဤ Hotspot အတွက် လတ်တလော batch များကို မတင်နိုင်ပါ။",
    "Site topology": "Site ကွန်ရက်ပုံစံ",
    "Sales history will appear here": "အရောင်းမှတ်တမ်းကို ဤနေရာတွင် ပြပါမည်",
    "Page not found": "စာမျက်နှာ မတွေ့ပါ",
    "This Easy Mode page is not available.": "ဤ Easy Mode စာမျက်နှာကို မရနိုင်ပါ။",
    "Back to Easy Mode": "Easy Mode သို့ ပြန်သွားရန်",
    "This router has no built-in Wi-Fi.": "ဤ router တွင် Wi-Fi မပါရှိပါ။",
    "My access point is plugged into": "ကျွန်ုပ်၏ access point ချိတ်ထားသော port",
    "Saving Wi-Fi name…": "Wi-Fi အမည် သိမ်းနေသည်…",
    Refresh: "ပြန်လည်စစ်ဆေးရန်",
    "Search guests": "ဧည့်သည် ရှာရန်",
    "Search name, address, or device": "အမည်၊ လိပ်စာ သို့မဟုတ် စက်ဖြင့် ရှာရန်",
    "No guests match your search.": "ရှာဖွေမှုနှင့် ကိုက်ညီသော ဧည့်သည် မရှိပါ။",
    "Print this batch": "ဤ batch ကို ပုံနှိပ်ရန်",
    "Magic Dude": "Magic Dude",
    "Recent revenue activity": "လတ်တလော ဝင်ငွေလှုပ်ရှားမှု",
    Source: "ရင်းမြစ်",
    "NTP Time Sync": "NTP အချိန်ကိုက်ညီမှု",
    "WAN Input Guard": "WAN Input Guard (Internet ဝင်ရောက်မှု)",
    "Login Flood Guard": "Login Flood Guard (ဝoucher စမ်းသပ်မှု)",
    "Login Bypass Shield": "Login Bypass Shield (လော့ဂ်အင် ကျော်လွှားမှု ကာကွယ်ရေး)",
    "Client Isolation": "Client Isolation (ဧည့်သည်ခွဲ)",
    "Trial Guest Access": "Trial Guest Access (အခမဲ့ trial)",
    "Fair Share QoS": "Fair Share QoS (bandwidth မျှဝေ)",
    "Auto Daily Backup": "Auto Daily Backup (ည backup)",
    Protection: "ကာကွယ်မှု",
    "Hotspot Operations": "Hotspot လုပ်ငန်း",
    "Quick Config": "အမြန်ဆုံး Config",
    "Hotspot settings": "Hotspot ဆက်တင်များ",
    "CGNAT detected — use Magic Hub or Local Connector":
      "CGNAT တွေ့ရှိ — Magic Hub သို့မဟုတ် Local Connector သုံးပါ",
    "Magic Hub": "Magic Hub",
    "Option C — Magic Hub": "နည်းလမ်း C — Magic Hub",
    "Option B — Magic Hub": "နည်းလမ်း B — Magic Hub",
    "Option A — Local Connector (no public IP needed)":
      "နည်းလမ်း A — Local Connector (public IP မလို)",
    "Add the RouterBoard in the app": "အက်ပ်တွင် RouterBoard ထည့်ပါ",
    "Prep the board (Scripts)": "ဘုတ် ပြင်ဆင်ရန် (Scripts)",
    "Confirm WAN on the board": "ဘုတ်တွင် WAN ရှိကြောင်း အတည်ပြုပါ",
    "Connect via Hub": "Hub မှ ချိတ်ဆက်ရန်",
    "Connect via Hub (one paste)": "Hub မှ ချိတ်ဆက်ရန် (တစ်ကြိမ် ကူးထည့်)",
    "Paste this on the router": "ဤအရာကို router ပေါ်တွင် ကူးထည့်ပါ",
    "Verify + Test": "စစ်ဆေးပြီး စမ်းသပ်ရန်",
    "Check now → Test": "ယခု စစ်ဆေး → စမ်းသပ်",
    "Full copy-paste checklist (Option C)": "ကူးယူကူးထည့် စစ်ဆေးစာရင်း အပြည့် (နည်းလမ်း C)",
    "Full copy-paste checklist (Option B)": "ကူးယူကူးထည့် စစ်ဆေးစာရင်း အပြည့် (နည်းလမ်း B)",
    "Magic Hub stuck Offline": "Magic Hub Offline တွင် ပိတ်မိနေသည်",
    "Syslog AI ingest": "Syslog AI လက်ခံခြင်း",
    "Mint the token": "Token ထုတ်ရန်",
    "Paste the HTTPS shipper": "HTTPS ပို့စခရစ် ကူးထည့်ရန်",
    "Syslog AI — no events": "Syslog AI — ဖြစ်ရပ် မရှိ",
    "Your sandbox router": "သင့် Sandbox Router",
    Board: "ဘုတ်",
    Identity: "အမည်",
    Host: "လိပ်စာ",
    "Multi-WAN & failover": "Multi-WAN နှင့် failover",
    "Plan, preflight and apply safely": "စီမံ၊ ကြိုတင်စစ်ဆေးပြီး လုံခြုံစွာ အသုံးချပါ",
    Mode: "မုဒ်",
    "LAN interface": "LAN အင်တာဖေ့စ်",
    "Hold-down (seconds)": "Hold-down (စက္ကန့်)",
    "Owner or admin access required": "ပိုင်ရှင် သို့မဟုတ် အက်ဒမင် ခွင့်ပြုချက် လိုအပ်သည်",
    "Discovered routers": "ရှာတွေ့ထားသော Router များ",
    "Deployment history": "တပ်ဆင်မှု မှတ်တမ်း",
    "Real device": "အစစ်အမှန် စက်",
    Rehearsal: "လေ့ကျင့်မှု",
    "Devices & ports": "စက်များနှင့် ပေါ့တ်များ",
    Incidents: "ဖြစ်ရပ်များ",
    "Coming soon": "မကြာမီ",
    Operations: "လုပ်ငန်းဆောင်ရွက်မှု",
    "Alert rules": "သတိပေး စည်းမျဉ်းများ",
    On: "ဖွင့်",
    "Failed checks": "မအောင်မြင်သော စစ်ဆေးမှုများ",
    "Quiet minutes": "ငြိမ်သက် မိနစ်များ",
    Notifications: "အကြောင်းကြားချက်များ",
    "Real-time notifications": "အချိန်နှင့်တပြေးညီ အကြောင်းကြားချက်များ",
    Time: "အချိန်",
    Data: "ဒေတာ",
    Custom: "စိတ်ကြိုက်",
    "Show in the app": "အက်ပ်တွင် ပြပါ",
    "Email me": "အီးမေးလ် ပို့ပါ",
    "Minimum severity": "အနိမ့်ဆုံး ပြင်းထန်မှု",
    "Captive portal": "Captive portal စာမျက်နှာ",
    "Services & plan": "ဝန်ဆောင်မှုနှင့် အစီအစဉ်",
    "Profile & security": "ပရိုဖိုင်နှင့် လုံခြုံရေး",
    "Production readiness": "ထုတ်လုပ်မှု အသင့်ဖြစ်မှု",
    Prerequisites: "လိုအပ်ချက်များ",
    "Supported hardware": "ပံ့ပိုးသော ဟာ့ဒ်ဝဲ",
    "In your inventory": "သင့်စာရင်းတွင်",
    Type: "အမျိုးအစား",
    "Not enabled in this deployment": "ဤတပ်ဆင်မှုတွင် မဖွင့်ထား",
    "MCP is read-only": "MCP သည် ဖတ်သာရ",
    "Exposed tools": "ထုတ်ပြထားသော ကိရိယာများ",
    "Read-only": "ဖတ်သာရ",
    Authorization: "ခွင့်ပြုချက်",
    "Disabled write tools": "ပိတ်ထားသော ရေးကိရိယာများ",
    Disabled: "ပိတ်ထားသည်",
    "Required before any write tool is enabled": "ရေးကိရိယာ မဖွင့်မီ လိုအပ်သည်",
    "Real hardware — writes are gated": "အစစ်အမှန် ဟာ့ဒ်ဝဲ — ရေးခြင်းကို ထိန်းချုပ်ထားသည်",
    "Registered routers": "မှတ်ပုံတင်ထားသော Router များ",
    "Test router setup checklist": "စမ်းသပ် Router တပ်ဆင် စစ်ဆေးစာရင်း",
    "Staged rollout rules": "အဆင့်လိုက် ထုတ်လုပ်မှု စည်းမျဉ်းများ",
    "Test Lab": "စမ်းသပ် ဓာတ်ခွဲခန်း",
    "Router environment": "Router ပတ်ဝန်းကျင်",
    "Business summary": "စီးပွားရေး အနှစ်ချုပ်",
    "Revenue today": "ယနေ့ ဝင်ငွေ",
    "Voucher revenue today": "ယနေ့ voucher ဝင်ငွေ",
    "Live telemetry": "တိုက်ရိုက် telemetry",
    "Focus interface": "အာရုံစိုက် interface",
    "Hotspot dashboard": "ဟော့စပေါ့ ဒက်ရှ်ဘုတ်",
    "Quick actions": "အမြန် လုပ်ဆောင်ချက်များ",
    "All tools": "ကိရိယာ အားလုံး",
    "Last 7 days": "နောက်ဆုံး ၇ ရက်",
    "Last 30 days": "နောက်ဆုံး ၃၀ ရက်",
    "Active sessions": "လက်ရှိ session များ",
    "Offline sites": "အော့ဖ်လိုင်း နေရာများ",
    "Connect your network to MikroTik Magic": "သင့်ကွန်ရက်ကို MikroTik Magic နှင့် ချိတ်ဆက်ခြင်း",
    "What's in the app": "အက်ပ်တွင် ပါဝင်သည့် အင်္ဂါရပ်များ",
    Overview: "ခြုံငုံသုံးသပ်ချက်",
    Agent: "အေးဂျင့်",
    "Roles and limits": "အခန်းကဏ္ဍနှင့် ကန့်သတ်ချက်များ",
    Owner: "ပိုင်ရှင်",
    Admin: "အက်ဒမင်",
    Client: "ဖောက်သည်",
    Primary: "ပင်မအကောင့်",
    User: "အသုံးပြုသူ",
    "MikroMagic Agent": "MikroMagic အေးဂျင့်",
    Expired: "သက်တမ်းကုန်",
    "Device limits": "စက်ပစ္စည်း ကန့်သတ်ချက်",
    "AI scans": "AI စကင်န်",
    "Install on your phone": "ဖုန်းတွင် ထည့်သွင်းခြင်း",
    "Option A — Cloud Remote (DDNS + TLS)": "နည်းလမ်း A — Cloud Remote (DDNS + TLS)",
    "Option A — Public IP / DDNS": "နည်းလမ်း A — အများသုံး IP / DDNS",
    "Cloud Remote (DDNS + TLS)": "Cloud Remote (DDNS + TLS)",
    "Public IP / DDNS": "အများသုံး IP / DDNS",
    "Board hostname (label)": "ဘုတ် အမည်တံဆိပ်",
    "Local Connector": "Local Connector",
    "Connection method": "ချိတ်ဆက်နည်းလမ်း",
    "Select a connector": "Connector ရွေးပါ",
    "Check this line": "ဤလိုင်းကို စစ်ဆေးပါ",
    "Public IP — Cloud Remote works": "အများသုံး IP — Cloud Remote အလုပ်လုပ်သည်",
    "Port 443 unreachable — fix firewall / port forward":
      "Port 443 မရောက်ရှိ — firewall / port forward ကို ပြင်ပါ",
    "Cloud DDNS not active yet": "Cloud DDNS မဖွင့်ရသေးပါ",
    "Router not reachable": "Router သို့ မရောက်ရှိပါ",
    "Cloud DDNS": "Cloud DDNS",
    "WAN address": "WAN လိပ်စာ",
    "Public address": "အများသုံး လိပ်စာ",
    "Get a public hostname (Cloud DDNS)": "အများသုံး hostname ရယူပါ (Cloud DDNS)",
    "Install / generate a TLS certificate": "TLS လက်မှတ် ထည့်သွင်း/ဖန်တီးပါ",
    "Enable REST over HTTPS on 443": "port 443 တွင် HTTPS REST ဖွင့်ပါ",
    "Restrict who can reach it": "ဝင်ရောက်နိုင်သူများကို ကန့်သတ်ပါ",
    "Create a dedicated app user": "အက်ပ်အတွက် သီးသန့် user ဖန်တီးပါ",
    "Test from the app": "အက်ပ်မှ စမ်းသပ်ပါ",
    "Full copy-paste block": "အပြည့်အစုံ ကူးယူရန် စာသား",
    "Option B — Local Connector (no public IP needed)":
      "နည်းလမ်း B — Local Connector (public IP မလို)",
    "Generate the pairing code": "တွဲချိတ်ကုဒ် ထုတ်ပါ",
    "Install the agent on site": "နေရာတွင် agent ထည့်သွင်းပါ",
    "Verify and bind devices": "စစ်ဆေးပြီး စက်များ ချိတ်ပါ",
    "Status dots on Overview": "ခြုံငုံသုံးသပ်ချက် အခြေအနေ အမှတ်များ",
    "Green (flashing)": "အစိမ်း (မှိတ်တုတ်)",
    "Red (flashing)": "အနီ (မှိတ်တုတ်)",
    "Yellow (flashing)": "အဝါ (မှိတ်တုတ်)",
    Troubleshooting: "ပြဿနာ ဖြေရှင်းခြင်း",
    Timeout: "အချိန်ကုန် (Timeout)",
    "401 Unauthorized": "401 ခွင့်ပြုချက်မရှိ",
    "TLS handshake failed": "TLS handshake မအောင်မြင်",
    "Works from curl, fails from the app": "curl ဖြင့်ရသော်လည်း အက်ပ်မှ မရ",
    "Device limit reached": "စက်ပစ္စည်း ကန့်သတ်ချက် ပြည့်သွားပြီ",
    "Connector offline": "Connector အော့ဖ်လိုင်း",
    // Navigation / feature names
    Home: "ဟုမ်း",
    Routers: "Router များ",
    Sites: "တည်နေရာများ",
    "Access Points": "AP များ",
    "Optional AP integrations": "ရွေးချယ်နိုင်သော AP ချိတ်ဆက်မှုများ",
    "Not required for hotspot operation": "Hotspot အလုပ်လုပ်ရန် မလိုအပ်ပါ",
    "Set up external AP ports": "ပြင်ပ AP port များ တပ်ဆင်ရန်",
    "Connect a verified controller": "စစ်ဆေးအတည်ပြုပြီးသော controller ကို ချိတ်ဆက်ရန်",
    "Connect an optional controller": "ရွေးချယ်နိုင်သော controller ကို ချိတ်ဆက်ရန်",
    Connectors: "ချိတ်ဆက်ကိရိယာများ",
    Fleet: "စက်အုပ်စု",
    "Live users": "တိုက်ရိုက်အသုံးပြုသူများ",
    Vouchers: "ဗောက်ချာများ",
    Payments: "ငွေလက်ခံ",
    "Syslog AI": "Ai Syslog စစ်ဆေးမှု",
    "Live operations": "တိုက်ရိုက် လည်ပတ်မှု",
    "Gateways online": "အွန်လိုင်း Gateway များ",
    Offline: "အော့ဖ်လိုင်း",
    "Open incidents": "ဖွင့်ထားသော ဖြစ်ရပ်များ",
    "How will you reach the router?": "Router သို့ မည်သို့ ချိတ်ဆက်မည်နည်း။",
    "User manual": "အသုံးပြုနည်းလမ်းညွှန်",
    Profile: "ကိုယ်ရေးအချက်အလက်",
    "Quick setup": "အမြန်တပ်ဆင်မှု",
    Status: "အခြေအနေ",

    // Routers / Access Points / Connectors
    "Guided connector setup": "Connector လမ်းညွှန်တပ်ဆင်မှု",
    "Name the connector": "Connector အမည်ပေးပါ",
    "Pairing code": "တွဲချိတ်ကုဒ်",
    "Install the agent": "Agent ကို ထည့်သွင်းပါ",
    "Verify & bind devices": "စစ်ဆေးပြီး စက်များချိတ်ဆက်ပါ",
    "Add controller": "Controller ထည့်ရန်",
    "Install the desktop connector agent": "Desktop connector agent ထည့်သွင်းခြင်း",
    "Add a connector": "Connector ထည့်ရန်",
    "Devices through this connector": "ဤ connector မှတဆင့် စက်များ",
    "Router Management": "Router စီမံခန့်ခွဲမှု",
    "Edit router": "Router ပြင်ဆင်ရန်",
    "Add a router": "Router ထည့်ရန်",
    "Your routers": "သင့် Router များ",
    "Last seen": "နောက်ဆုံးတွေ့ချိန်",
    Version: "ဗားရှင်း",
    "Local network": "ဒေသတွင်းကွန်ရက်",
    Devices: "စက်ပစ္စည်းများ",
    "Interfaces / traffic": "အင်တာဖေ့စ် / ဒေတာစီးဆင်းမှု",
    "Service counts": "ဝန်ဆောင်မှု အရေအတွက်",
    Firewall: "ဖိုင်းယားဝေါလ်",
    WireGuard: "WireGuard",
    Queues: "Queue များ",
    Syslog: "Syslog",
    "MikroTik Magic": "MikroTik Magic",
    "Easy dashboard": "လွယ်ကူသော ဒက်ရှ်ဘုတ်",
    "Easy mode": "လွယ်ကူသော မုဒ်",
    "Easy Mode": "လွယ်ကူသော မုဒ်",
    "Welcome · Myitkyina": "ကြိုဆိုပါသည် · မြစ်ကြီးနား",
    More: "နောက်ထပ်",
    "More for your business": "သင့်လုပ်ငန်းအတွက် နောက်ထပ်",
    Revenue: "ဝင်ငွေ",
    "Voucher plans": "Voucher အစီအစဉ်များ",
    "Print slips": "စာရွက်များ ပုံနှိပ်ရန်",
    "Guest portal": "ဧည့်သည် Portal",
    "Help and guides": "အကူအညီနှင့် လမ်းညွှန်များ",
    "Account settings": "အကောင့် ဆက်တင်များ",
    "Track voucher income": "Voucher ဝင်ငွေကို ခြေရာခံရန်",
    "Time and data plans": "အချိန်နှင့် ဒေတာ အစီအစဉ်များ",
    "Choose your print layout": "ပုံနှိပ်ပုံစံကို ရွေးရန်",
    "Customize the guest welcome page": "ဧည့်သည် ကြိုဆိုစာမျက်နှာကို ပြင်ရန်",
    "Learn how to run your hotspot": "သင့် hotspot ကို စီမံနည်း လေ့လာရန်",
    "Profile and preferences": "ပရိုဖိုင်နှင့် နှစ်သက်ရာများ",
    "Switch to Advanced Mode": "အဆင့်မြင့် မုဒ်သို့ ပြောင်းရန်",
    there: "ထိုနေရာ",
    Checking: "စစ်ဆေးနေသည်",
    Online: "အွန်လိုင်း",
    "Needs attention": "စစ်ဆေးရန် လိုအပ်သည်",
    "Open settings": "ဆက်တင်များ ဖွင့်ရန်",
    Unavailable: "ယာယီ မရရှိနိုင်ပါ",
    "Finish your guest portal": "ဧည့်သည် Portal ကို အပြီးသတ်ပါ",
    "Add a welcome message and logo for guests.": "ဧည့်သည်များအတွက် ကြိုဆိုစာနှင့် လိုဂို ထည့်ပါ။",
    "Connect your first router": "သင့်ပထမဆုံး Router ကို ချိတ်ဆက်ပါ",
    "Add your MikroTik before setting up guest access.":
      "ဧည့်သည်အသုံးပြုခွင့် မတပ်ဆင်မီ MikroTik ကို ထည့်ပါ။",
    "Next step": "နောက်တစ်ဆင့်",
    Continue: "ဆက်လုပ်ရန်",
    "See revenue details": "ဝင်ငွေအသေးစိတ် ကြည့်ရန်",
    Protect: "ကာကွယ်ရန်",
    "Checking routers…": "Router များကို စစ်ဆေးနေသည်…",
    "Turn protection off": "ကာကွယ်မှု ပိတ်ရန်",
    "Run safety check and protect": "လုံခြုံရေးစစ်ဆေးပြီး ကာကွယ်ရန်",
    "Checking router…": "Router ကို စစ်ဆေးနေသည်…",
    "Save Wi-Fi name": "Wi-Fi အမည် သိမ်းရန်",
    "Live data refreshes every 20 seconds.": "တိုက်ရိုက်ဒေတာကို စက္ကန့် ၂၀ တိုင်း ပြန်လည်ဖတ်သည်။",
    "Checking connected routers…": "ချိတ်ဆက်ထားသော Router များကို စစ်ဆေးနေသည်…",
    "Could not load your routers": "သင့် Router များကို မဖွင့်နိုင်ပါ",
    "No physical router connected": "Physical Router မချိတ်ဆက်ရသေးပါ",
    "Checking your connected router…": "ချိတ်ဆက်ထားသော Router ကို စစ်ဆေးနေသည်…",
    "Could not load your router right now.": "ယခု သင့် Router ကို မဖွင့်နိုင်ပါ။",
    "Connect a router to see live guests.": "တိုက်ရိုက်ဧည့်သည်များကို ကြည့်ရန် Router ချိတ်ဆက်ပါ။",
    "Checking live guests…": "တိုက်ရိုက်ဧည့်သည်များကို စစ်ဆေးနေသည်…",
    "Could not read live guests from this router.":
      "ဤ Router မှ တိုက်ရိုက်ဧည့်သည်များကို မဖတ်နိုင်ပါ။",
    "No guests are online right now.": "ယခု အွန်လိုင်းဧည့်သည် မရှိပါ။",
    "Connect router": "Router ချိတ်ဆက်ရန်",
    "Open setup": "Setup ဖွင့်ရန်",
    "Checking your connected routers…": "ချိတ်ဆက်ထားသော Router များကို စစ်ဆေးနေသည်…",
    "We could not load your routers. Try again or open Advanced Mode.":
      "Router များကို မဖွင့်နိုင်ပါ။ ထပ်ကြိုးစားပါ သို့မဟုတ် Advanced Mode ကို ဖွင့်ပါ။",
    "Connect a router before setting the Wi-Fi name.":
      "Wi-Fi အမည် မသတ်မှတ်မီ Router ကို ချိတ်ဆက်ပါ။",
    "Reading the current Hotspot and Wi-Fi setup…":
      "လက်ရှိ Hotspot နှင့် Wi-Fi setup ကို ဖတ်နေသည်…",
    "We could not read this router. Open Connect router to test it.":
      "ဤ Router ကို မဖတ်နိုင်ပါ။ စမ်းသပ်ရန် Connect router ကို ဖွင့်ပါ။",
    "The router is ready for Easy Mode setup.": "Router သည် Easy Mode setup အတွက် အသင့်ဖြစ်ပါပြီ။",
    "Your hotspot, simplified": "သင့် hotspot ကို ရိုးရှင်းစွာ",
    "Good evening": "မင်္ဂလာညနေခင်းပါ",
    "Everything you need to sell Wi-Fi access today.":
      "ယနေ့ Wi-Fi အသုံးပြုခွင့် ရောင်းချရန် လိုအပ်သမျှ",
    "Your first site": "သင့်ပထမဆုံးနေရာ",
    "Today's sales": "ယနေ့ ရောင်းအား",
    "Voucher totals are loading": "Voucher စုစုပေါင်းကို ဖွင့်နေသည်",
    "active voucher": "အသုံးပြုနေသော voucher",
    "active vouchers": "အသုံးပြုနေသော voucher များ",
    "active guests": "အသုံးပြုနေသော ဧည့်သည်များ",
    Live: "တိုက်ရိုက်",
    "Revenue over the last 7 days": "နောက်ဆုံး ၇ ရက် ဝင်ငွေ",
    "Your network": "သင့်ကွန်ရက်",
    WAN: "ဝမ်",
    Router: "Router",
    Hub: "ဟပ်",
    "View hotspot health": "Hotspot အခြေအနေကို ကြည့်ရန်",
    "We could not confirm the router right now.": "ယခု Router ကို အတည်မပြုနိုင်ပါ။",
    "Run your business": "သင့်လုပ်ငန်းကို လည်ပတ်ပါ",
    "Tap a tile to begin": "စတင်ရန် အကွက်တစ်ခုကို နှိပ်ပါ",
    "Sell vouchers": "Voucher ရောင်းရန်",
    "Create access codes": "အသုံးပြုခွင့်ကုဒ်များ ဖန်တီးရန်",
    "Ready to hand out": "ဝေငှရန် အသင့်",
    Guests: "ဧည့်သည်များ",
    "devices online": "စက်များ အွန်လိုင်း",
    "Protect hotspot": "Hotspot ကာကွယ်ရန်",
    "Review security checks": "လုံခြုံရေး စစ်ဆေးချက်များကို ကြည့်ရန်",
    "Voucher codes": "Voucher ကုဒ်များ",
    "Create access codes for your guests": "ဧည့်သည်များအတွက် အသုံးပြုခွင့်ကုဒ်များ ဖန်တီးရန်",
    "Selling at": "ရောင်းချမည့်နေရာ",
    "Choose your hotspot": "သင့် hotspot ကို ရွေးပါ",
    "Select a router": "Router ကို ရွေးပါ",
    "Connect a physical router before creating vouchers.":
      "Voucher မဖန်တီးမီ physical router ကို ချိတ်ဆက်ပါ။",
    "How many codes?": "ကုဒ် ဘယ်နှစ်ခု လိုပါသလဲ",
    "Up to 100 per batch": "တစ်သုတ်လျှင် ၁၀၀ အထိ",
    "Ready to sell": "ရောင်းချရန် အသင့်",
    "Select a plan to continue": "ဆက်လုပ်ရန် plan ကို ရွေးပါ",
    "Your codes are ready": "သင့်ကုဒ်များ အသင့်ဖြစ်ပါပြီ",
    "Keep them private until you hand them to guests.": "ဧည့်သည်များထံ မပေးမချင်း လျှို့ဝှက်ထားပါ။",
    "Copy all": "အားလုံး ကူးရန်",
    "Manage batch": "သုတ်ကို စီမံရန်",
    "Codes are single-use and protected": "ကုဒ်များသည် တစ်ကြိမ်သုံးပြီး ကာကွယ်ထားသည်",
    "Recent batches": "လတ်တလော သုတ်များ",
    "Created for this hotspot": "ဤ hotspot အတွက် ဖန်တီးထားသည်",
    "View all": "အားလုံး ကြည့်ရန်",
    "Loading your batches…": "သင့်သုတ်များကို ဖွင့်နေသည်…",
    "No batches yet. Your first generated codes will appear here.":
      "သုတ်မရှိသေးပါ။ ပထမဆုံး ဖန်တီးသောကုဒ်များ ဤနေရာတွင် ပေါ်လာပါမည်။",
    "Recommended · Magic Hub": "အကြံပြုထားသည် · Magic Hub",
    "Connect your hotspot securely": "သင့် hotspot ကို လုံခြုံစွာ ချိတ်ဆက်ပါ",
    "Use the production setup wizard to save credentials and test the connection.":
      "အထောက်အထားများကို သိမ်းပြီး ချိတ်ဆက်မှု စမ်းသပ်ရန် production setup wizard ကို သုံးပါ။",
    "Router status": "Router အခြေအနေ",
    "Not connected": "မချိတ်ဆက်ရသေးပါ",
    "Open Magic Hub setup": "Magic Hub setup ကို ဖွင့်ရန်",
    "Use Local Connector": "Local Connector ကို သုံးရန်",
    "A connector is available": "Connector ရှိပါသည်",
    "Pair a connector for private networks": "သီးသန့်ကွန်ရက်များအတွက် Connector တွဲချိတ်ပါ",
    "Router password stays protected": "Router စကားဝှက်ကို ကာကွယ်ထားသည်",
    "Credentials are encrypted and never displayed after saving.":
      "အထောက်အထားများကို စာဝှက်ပြီး သိမ်းဆည်းပြီးနောက် မပြသပါ။",
  },
  copy: {
    "WAN → router → LAN ports for the selected site, with live link status.":
      "ရွေးထားသော site အတွက် WAN → router → LAN port များနှင့် လက်ရှိ link အခြေအနေ။",
    "Add a site with a physical router to see the network diagram.":
      "ကွန်ရက်ပုံကို ကြည့်ရန် အစစ်အမှန် router ပါသော site တစ်ခု ထည့်ပါ။",
    "Building diagram…": "ကွန်ရက်ပုံ ဖန်တီးနေသည်…",
    "Emerald and Sapphire include hotspot management with 1 router, 3 sites and 15 optional AP controller integrations. Additional capacity is managed through an owner-approved device slot or the relevant account-bound feature key. Sapphire is 104,500 MMK / year (73,150 MMK while the launch offer is active, through 24 Sep 2026). Amethyst is unlimited. Quotas are enforced on the server, so an over-limit add is rejected even on rapid retries.":
      "Emerald နှင့် Sapphire တွင် hotspot စီမံခန့်ခွဲမှု ပါဝင်ပြီး Router ၁ ခု၊ site ၃ ခုနှင့် ရွေးချယ်နိုင်သော AP controller integration slot ၁၅ ခု ပါဝင်သည်။ ထပ်ဆောင်း capacity ကို owner အတည်ပြုထားသော device slot သို့မဟုတ် သက်ဆိုင်ရာ account-bound feature key ဖြင့် စီမံနိုင်သည်။ Sapphire သည် တစ်နှစ်လျှင် ၁၀၄,၅၀၀ MMK (launch offer ကာလအတွင်း ၇၃,၁၅၀ MMK၊ ၂၀၂၆ စက်တင်ဘာ ၂၄ ရက်အထိ) ဖြစ်သည်။ Amethyst တွင် အကန့်အသတ်မရှိပါ။ Quota များကို server ပေါ်တွင် အတည်ပြုကန့်သတ်ထားသောကြောင့် အမြန်ထပ်ခါတလဲလဲ ကြိုးစားသော်လည်း ကန့်သတ်ချက်ကျော်လွန်သော ထည့်သွင်းမှုကို ပယ်ချမည်။",
    "Emerald and Sapphire include hotspot management with 1 router, 3 sites and 15 access points. Additional capacity is managed through an owner-approved device slot or the relevant account-bound feature key. Sapphire is 104,500 MMK / year (73,150 MMK while the launch offer is active, through 24 Sep 2026). Amethyst is unlimited. Quotas are enforced on the server, so an over-limit add is rejected even on rapid retries.":
      "Emerald နှင့် Sapphire တွင် hotspot စီမံခန့်ခွဲမှု ပါဝင်ပြီး Router ၁ ခု၊ site ၃ ခုနှင့် access point ၁၅ ခု ပါဝင်သည်။ ထပ်ဆောင်း capacity ကို owner အတည်ပြုထားသော device slot သို့မဟုတ် သက်ဆိုင်ရာ account-bound feature key ဖြင့် စီမံနိုင်သည်။ Sapphire သည် တစ်နှစ်လျှင် ၁၀၄,၅၀၀ MMK (launch offer ကာလအတွင်း ၇၃,၁၅၀ MMK၊ ၂၀၂၆ စက်တင်ဘာ ၂၄ ရက်အထိ) ဖြစ်သည်။ Amethyst တွင် အကန့်အသတ်မရှိပါ။ Quota များကို server ပေါ်တွင် အတည်ပြုကန့်သတ်ထားသောကြောင့် အမြန်ထပ်ခါတလဲလဲ ကြိုးစားသော်လည်း ကန့်သတ်ချက်ကျော်လွန်သော ထည့်သွင်းမှုကို ပယ်ချမည်။",
    "30 manual scans per month on standard plans. Owners can set a different monthly allowance when needed. Fleet and Security Insights share the same quota.":
      "ပုံမှန် plan များတွင် တစ်လလျှင် ကိုယ်တိုင် scan ၃၀ ကြိမ် ပြုလုပ်နိုင်သည်။ လိုအပ်ပါက ပိုင်ရှင်များက လစဉ်ခွင့်ပြုချက် အရေအတွက်ကို ပြောင်းလဲသတ်မှတ်နိုင်သည်။ Fleet နှင့် Security Insights သည် quota တစ်ခုတည်းကို မျှဝေသုံးသည်။",
    "your plan allows one router, three sites and fifteen access points. Request another slot from the app owner, or use the relevant account-bound feature key when available.":
      "သင့် plan သည် Router ၁ ခု၊ site ၃ ခုနှင့် access point ၁၅ ခု ခွင့်ပြုသည်။ ထပ်မံထည့်ရန် app ပိုင်ရှင်ထံမှ slot အသစ် တောင်းဆိုပါ၊ သို့မဟုတ် ရရှိနိုင်ပါက သက်ဆိုင်ရာ account-bound feature key ကို အသုံးပြုပါ။",
    "Platform · router monitor": "ပလက်ဖောင်း · Router စောင့်ကြည့်မှု",
    "Status-only monitor for Developers. Users, MikroMagic Agents, and Expired accounts never see this. Active = Magic Hub online or handshake/seen within 5 minutes.":
      "Developer များအတွက်သာ အခြေအနေစောင့်ကြည့်မှုဖြစ်သည်။ အသုံးပြုသူများ၊ MikroMagic Agent များနှင့် သက်တမ်းကုန်အကောင့်များ မမြင်ရပါ။ Active ဆိုသည်မှာ Magic Hub online ဖြစ်ခြင်း သို့မဟုတ် ၅ မိနစ်အတွင်း handshake/seen ရှိခြင်းဖြစ်သည်။",
    "No settled voucher payments yet.": "အပြီးသတ်ထားသော voucher ပေးချေမှု မရှိသေးပါ။",
    "Vouchers grouped by the plans you created. Gross is settled voucher revenue plus legacy redemptions; net removes refunded orders.":
      "Voucher များကို သင်ဖန်တီးထားသော plan အလိုက် စုစည်းပြထားသည်။ Gross တွင် အပြီးသတ်ထားသော voucher ဝင်ငွေနှင့် ယခင် redemption များ ပါဝင်ပြီး net မှ refund order များကို နုတ်ထားသည်။",
    "Only Used voucher codes count toward gross and net. Active access and unused stock are excluded; net removes refunds.":
      "အသုံးပြုပြီးသော voucher code များသာ စုစုပေါင်းဝင်ငွေနှင့် အသားတင်ဝင်ငွေတွင် ရေတွက်ပါသည်။ လက်ရှိအသုံးပြုခွင့်နှင့် မသုံးရသေးသော stock များ မပါဝင်ဘဲ၊ အသားတင်ဝင်ငွေတွင် refund များကို နုတ်ထားပါသည်။",
    Mark: "အမှတ်အသားပြုပါ",
    "as handed to a customer. This stamps the voucher comment and opens a printable slip; it does not record income. Record the settled cash or online sale in Payments first.":
      "ကို ဖောက်သည်ထံ ပေးအပ်ပြီးအဖြစ် အမှတ်အသားပြုပါ။ Voucher comment ထည့်ပြီး ပုံနှိပ်နိုင်သော slip ကိုဖွင့်ပေးမည်ဖြစ်သော်လည်း ဝင်ငွေကို မမှတ်တမ်းတင်ပါ။ အပြီးသတ်ထားသော ငွေသား သို့မဟုတ် online sale ကို Payments တွင် အရင်မှတ်တမ်းတင်ပါ။",
    "Choose the language used across MikroTik Magic. Navigation, section titles and explanatory text are translated. Action buttons, RouterOS commands and product names stay in English.":
      "MikroTik Magic တွင် အသုံးပြုမည့် ဘာသာစကားကို ရွေးပါ။ Navigation၊ section title နှင့် ရှင်းလင်းစာသားများကို ဘာသာပြန်ပေးမည်ဖြစ်ပြီး action button၊ RouterOS command နှင့် product name များကို အင်္ဂလိပ်အတိုင်း ထားမည်။",
    "A magician is brewing a new feature..which will be available soon":
      "မှော်ဆရာတစ်ဦးသည် feature အသစ်ကို ချက်ပြုတ်နေသည်.. မကြာမီ ရရှိနိုင်ပါမည်",
    "Upcoming soon....": "မကြာမီ ရောက်ရှိပါမည်....",
    "This Operations tab is a quiet preview. No feature details yet — stay tuned.":
      "ဤ Operations တဘ်သည် တိတ်ဆိတ်သော preview ဖြစ်သည်။ Feature အသေးစိတ် မရှိသေးပါ — ဆက်လက် စောင့်မျှော်ပါ။",
    "Privileged tenant access — billing, user management, scripts, backups, and full site control.":
      "အခွင့်ထူးခံ tenant ဝင်ရောက်ခွင့် — ငွေစာရင်း၊ အသုံးပြုသူ စီမံခန့်ခွဲမှု၊ scripts၊ backups နှင့် ဆိုက် အပြည့်အဝ ထိန်းချုပ်မှု။",
    "Standard tenant access — routers, vouchers, portal, and live sessions for your sites.":
      "ပုံမှန် tenant ဝင်ရောက်ခွင့် — router၊ voucher၊ portal နှင့် သင့်ဆိုက်များအတွက် တိုက်ရိုက် session များ။",
    'Promoting a router to production needs a primary tenant user plus the exact phrase, for example: "':
      "Router ကို ထုတ်လုပ်မှုသို့ မြှင့်တင်ရန် ပင်မ tenant အသုံးပြုသူနှင့် တိကျသော စာသား လိုအပ်သည်၊ ဥပမာ - “",
    "Keeps the router clock accurate using Cloudflare + Google time servers, and sets Asia/Yangon (UTC+06:30) so schedules match the platform. Required for TLS certificates and daily backup times — voucher session lengths are relative and do not need NTP.":
      "Cloudflare နှင့် Google time server များဖြင့် router နာရီကို တိကျစေပြီး Asia/Yangon (UTC+06:30) သတ်မှတ်ကာ platform အချိန်ဇယားနှင့် ကိုက်ညီစေသည်။ TLS certificate နှင့် nightly backup အတွက် NTP လိုအပ်သည် — voucher session ကြာချိန်သည် relative ဖြစ်ပြီး NTP မလိုပါ။",
    "Blocks unsolicited internet traffic to the router itself. WinBox and SSH stay LAN-only. Requires a WAN interface list.":
      "Internet မှ router ကိုယ်တိုင် သို့ unsolicited traffic ကို ပိတ်ဆို့သည်။ WinBox နှင့် SSH သည် LAN-only ဖြစ်သည်။ WAN interface list လိုအပ်သည်။",
    "If one device tries too many voucher codes too fast, the router kicks that MAC and blocks it for 30 minutes. Stops code-guessing tools without locking out normal guests.":
      "စက်တစ်လုံးက voucher code များကို အလွန်မြန်ဆန်စွာ အကြိမ်များစွာ စမ်းပါက router သည် ထို MAC ကို ထုတ်ပြီး ၃၀ မိနစ် ပိတ်ပင်သည်။ ပုံမှန် ဧည့်သည်များကို မပိတ်ဘဲ code-guessing tool များကို ရပ်တန့်သည်။",
    "Prevents hotspot guests from seeing or reaching each other's devices. Requires a LAN interface list on the board.":
      "Hotspot ဧည့်သည်များ တစ်ဦးနှင့် တစ်ဦး စက်ပစ္စည်းများကို မမြင်နိုင်၊ မရောက်နိုင်အောင် ကာကွယ်သည်။ ဘုတ်တွင် LAN interface list လိုအပ်သည်။",
    "Enables a free timed trial session for walk-in guests before they buy a voucher. Uses the mm-trial profile (10 min, 1.5 Mbps). Requires Hotspot and RouterOS 7.1+.":
      "Voucher မဝယ်မီ လာရောက်ဧည့်သည်များအတွက် အခမဲ့ trial session (mm-trial profile — ၁၀ မိနစ်၊ ၁.၅ Mbps) ဖွင့်သည်။ Hotspot နှင့် RouterOS 7.1+ လိုအပ်သည်။",
    "Splits your internet bandwidth fairly across all connected guests so no single user can hog the connection.":
      "ချိတ်ဆက်ထားသော ဧည့်သည်အားလုံးအကြား bandwidth ကို မျှတစွာ ဖြန့်ဝေပြီး တစ်ဦးတည်းက connection ကို မသိမ်းပါ။",
    "Saves a full router config backup every night at 02:30 to the router's flash storage. Named mm-auto-backup.":
      "ည ၀၂:၃၀ တွင် router config backup အပြည့်ကို flash storage တွင် mm-auto-backup အဖြစ် သိမ်းသည်။",
    "Partial protection — LAN interface list is missing, so guest DNS bypass is not blocked. Run Magic Hub board prep first.":
      "Partial protection — LAN interface list မရှိသေးသဖြင့် guest DNS bypass ကို မပိတ်နိုင်ပါ။ Magic Hub board prep script ကို အရင် run ပါ။",
    "Login Bypass Shield is on": "Login Bypass Shield ဖွင့်ထားသည်",
    "Login Bypass Shield is off": "Login Bypass Shield ပိတ်ထားသည်",
    "Could not update Login Bypass Shield": "Login Bypass Shield ကို ပြင်ဆင်၍ မရပါ",
    "Blocks VPN tunnels and outside DNS resolvers that guests use to skip the voucher login page. Needs a LAN interface list for full DNS protection.":
      "ဧည့်သည်များ voucher login စာမျက်နှာကို ကျော်ရန် အသုံးပြုသော VPN tunnel နှင့် ပြင်ပ DNS resolver များကို ပိတ်ဆို့သည်။ DNS အပြည့်အဝ ကာကွယ်ရန် LAN interface list လိုအပ်သည်။",
    "Hide description": "ဖော်ပြချက် ဖျောက်ရန်",
    "Show description": "ဖော်ပြချက် ပြရန်",
    "{label} is on": "{label} ဖွင့်ပြီး",
    "{label} is off": "{label} ပိတ်ပြီး",
    "Could not update {label}": "{label} ကို မပြင်နိုင်ပါ",
    "Router unreachable — run Test on this card first. Quick Config needs a live REST connection to apply settings on the board.":
      "Router ကို မရောက်နိုင်ပါ — ဤ card တွင် Test ကို အရင် run ပါ။ Quick Config သည် REST connection live ဖြစ်မှ ဘုတ်ပေါ် settings apply လုပ်နိုင်သည်။",
    "Could not load config: {message}": "Config မဖွင့်နိုင်ပါ: {message}",
    "Changes apply to the router immediately over REST. Settings persist across reboots. Does not modify Magic Hub WireGuard or www-ssl.":
      "ပြောင်းလဲချက်များကို REST ဖြင့် router တွင် ချက်ချင်း apply လုပ်သည်။ Reboot ပြီးနောက် settings ကျန်ရှိသည်။ Magic Hub WireGuard သို့မဟုတ် www-ssl ကို မပြင်ပါ။",
    "A local MikroTik Magic Connector runs inside the customer network and dials out to the cloud. Devices bound to it are managed without port forwarding or a public IP. For Starlink without a site PC, pick Magic Hub on Routers instead.":
      "ဒေသတွင်း MikroTik Magic Connector သည် ဖောက်သည်ကွန်ရက်အတွင်း လည်ပတ်ပြီး cloud သို့ ထွက်ချိတ်သည်။ ချိတ်ထားသော စက်များကို port forwarding သို့မဟုတ် အများသုံး IP မလိုဘဲ စီမံနိုင်သည်။ Starlink သုံးပြီး ဆိုက်တွင် PC မရှိလျှင် Routers တွင် Magic Hub ကို ရွေးပါ။",
    "{n} rules": "စည်းမျဉ်း {n} ခု",
    "0 peers": "peer ၀ ခု",
    "{ok}/{total} handshake": "{ok}/{total} handshake ရှိ",
    "{n} trees": "tree {n} ခု",
    "{n} today": "ယနေ့ {n} ခု",
    "Pick a connection method first. Cloud Remote needs a public IP. Local Connector needs a paired agent on site. Magic Hub is for Starlink and other CGNAT lines — the RouterBoard dials out to the MikroTik Magic hub. Credentials are encrypted at rest with AES-256-GCM.":
      "ဦးစွာ ချိတ်ဆက်နည်း ရွေးပါ။ Cloud Remote အတွက် အများသုံး IP လိုသည်။ Local Connector အတွက် ဆိုက်တွင် တွဲပြီးသား agent လိုသည်။ Magic Hub သည် Starlink နှင့် အခြား CGNAT လိုင်းများအတွက် — RouterBoard က MikroTik Magic hub သို့ ထွက်ချိတ်သည်။ ခွင့်ပြုချက်များကို AES-256-GCM ဖြင့် သိမ်းသည်။",
    "Three ways, three names: Magic Hub (Starlink — router calls us, then a paste-script window). Cloud Remote (public IP — we call the router). Local Connector (a PC on site). They are not the same. Credentials are encrypted at rest with AES-256-GCM.":
      "နည်းလမ်းသုံးခု၊ အမည်သုံးခု — Magic Hub (Starlink — router က ကျွန်ုပ်တို့ကို ခေါ်ပြီး paste-script ဝင်းဒိုး ပွင့်သည်)။ Cloud Remote (အများသုံး IP — ကျွန်ုပ်တို့က router ကို ခေါ်သည်)။ Local Connector (ဆိုက်ရှိ PC)။ တူညီသည် မဟုတ်။ ခွင့်ပြုချက်များကို AES-256-GCM ဖြင့် သိမ်းသည်။",
    "Magic Hub is Cloud Remote — the main way to manage a board from the app (Starlink included). After Add router, a paste-script window opens. Local Connector is a PC on site. Public IP / DDNS is only if the WAN has a real public address. Credentials are encrypted at rest with AES-256-GCM.":
      "Magic Hub သည် Cloud Remote — အက်ပ်မှ ဘုတ်ကို စီမံသည့် အဓိကနည်း (Starlink အပါအဝင်)။ Add router ပြီးနောက် paste-script ဝင်းဒိုး ပွင့်သည်။ Local Connector သည် ဆိုက်ရှိ PC။ Public IP / DDNS သည် WAN တွင် အစစ်အမှန် အများသုံး လိပ်စာရှိမှသာ။ ခွင့်ပြုချက်များကို AES-256-GCM ဖြင့် သိမ်းသည်။",
    "Magic Hub is Cloud Remote — the main way to manage a board from the app (Starlink included). After Add router, a paste-script window opens. Local Connector is a PC on site. Credentials are encrypted at rest with AES-256-GCM.":
      "Magic Hub သည် Cloud Remote — အက်ပ်မှ ဘုတ်ကို စီမံသည့် အဓိကနည်း (Starlink အပါအဝင်)။ Add router ပြီးနောက် paste-script ဝင်းဒိုး ပွင့်သည်။ Local Connector သည် ဆိုက်ရှိ PC။ ခွင့်ပြုချက်များကို AES-256-GCM ဖြင့် သိမ်းသည်။",
    "Magic Hub is not Cloud Remote. Tap Add router (not the Magic Hub card). A window then shows the paste script — it is not on the Scripts page.":
      "Magic Hub သည် Cloud Remote မဟုတ်။ Add router ကို နှိပ်ပါ (Magic Hub ကတ်ကိုသာ မနှိပ်ပါနှင့်)။ ထို့နောက် paste script ဝင်းဒိုး ပွင့်မည် — Scripts စာမျက်နှာ မဟုတ်။",
    "Magic Hub is Cloud Remote. Tap Add router (not only the Magic Hub card). A window then shows the paste script — it is not on the Scripts page.":
      "Magic Hub သည် Cloud Remote။ Add router ကို နှိပ်ပါ (Magic Hub ကတ်ကိုသာ မနှိပ်ပါနှင့်)။ ထို့နောက် paste script ဝင်းဒိုး ပွင့်မည် — Scripts စာမျက်နှာ မဟုတ်။",
    "Magic Hub is the Starlink path. Cloud Remote is a different button.":
      "Magic Hub သည် Starlink လမ်းကြောင်း။ Cloud Remote သည် အခြား ခလုတ်ဖြစ်သည်။",
    "Magic Hub is Cloud Remote — the main way the app reaches this board.":
      "Magic Hub သည် Cloud Remote — အက်ပ်က ဤဘုတ်သို့ ရောက်သည့် အဓိကနည်း။",
    "This window is Magic Hub — not Cloud Remote, not the Scripts page. Copy the commands into WinBox New Terminal.":
      "ဤဝင်းဒိုးသည် Magic Hub — Cloud Remote မဟုတ်၊ Scripts စာမျက်နှာ မဟုတ်။ ညွှန်ကြားချက်များကို WinBox New Terminal ထဲသို့ ကူးယူပါ။",
    "This window is Magic Hub (Cloud Remote). Copy the commands into WinBox New Terminal. It is not the Scripts page.":
      "ဤဝင်းဒိုးသည် Magic Hub (Cloud Remote)။ ညွှန်ကြားချက်များကို WinBox New Terminal ထဲသို့ ကူးယူပါ။ Scripts စာမျက်နှာ မဟုတ်။",
    "This window is Magic Hub (Cloud Remote). Stay here — do not hop to the Scripts page for the key script.":
      "ဤဝင်းဒိုးသည် Magic Hub (Cloud Remote)။ ဤနေရာတွင်ပင် နေပါ — key script အတွက် Scripts စာမျက်နှာသို့ မခုန်ပါနှင့်။",
    "Board already has WAN internet (default route). If not, fix DHCP on ether1 first — then come back to this window.":
      "ဘုတ်တွင် WAN အင်တာနက် (default route) ရှိပြီးသား။ မရှိလျှင် ether1 ပေါ်တွင် DHCP အရင်ပြင်ပါ — ထို့နောက် ဤဝင်းဒိုးသို့ ပြန်လာပါ။",
    "From WinBox on this board (not your Mac/PC): /ping 8.8.8.8 must succeed. LAN and WAN must not share the same IP.":
      "ဤဘုတ်၏ WinBox မှ (Mac/PC မဟုတ်): /ping 8.8.8.8 အောင်မြင်ရမည်။ LAN နှင့် WAN တူညီသော IP မမျှဝေရ။",
    "Copy script → WinBox New Terminal → paste once. It sets WireGuard, www-ssl + cert, and rest-api. Safe to paste again.":
      "Script ကူးယူ → WinBox New Terminal → တစ်ကြိမ် ကူးထည့်ပါ။ WireGuard၊ www-ssl + လက်မှတ်နှင့် rest-api သတ်မှတ်ပေးသည်။ ထပ်ကူးထည့်၍ ရသည်။",
    "Copy script → WinBox New Terminal → paste once. If you see STOP, fix WAN and paste again — the hub is not installed until preflight passes.":
      "Script ကူးယူ → WinBox New Terminal → တစ်ကြိမ် ကူးထည့်ပါ။ STOP မြင်လျှင် WAN ပြင်ပြီး ပြန်ကူးထည့်ပါ — preflight မအောင်မီ hub မတပ်ဆင်ပါ။",
    "Wait for last-handshake a few seconds ago in the printout. Ignore ping timeouts to the hub or 10.77.0.1.":
      "ပရင့်ထုတ်ချက်တွင် last-handshake စက္ကန့်အနည်းငယ် အကြာက ဖြစ်သည်အထိ စောင့်ပါ။ hub သို့မဟုတ် 10.77.0.1 သို့ ping timeout ကို လျစ်လျူရှုပါ။",
    "Back in the app: Check now → Test. App password must match WinBox. Expect Reachable — REST OK.":
      "အက်ပ်သို့ ပြန်ပါ: ယခု စစ်ဆေး → စမ်းသပ်။ အက်ပ် စကားဝှက်သည် WinBox နှင့် တူရမည်။ Reachable — REST OK မျှော်လင့်ပါ။",
    "Private key is shown only once (kept for this browser tab). Do not invent keys or edit the hub endpoint. Do not save this into the Scripts library.":
      "Private key ကို တစ်ကြိမ်သာ ပြသည် (ဤ browser tab တွင် သိမ်းသည်)။ Key ကိုယ်တိုင် မဖန်တီးပါနှင့်၊ hub endpoint မပြင်ပါနှင့်။ Scripts စာကြည့်တိုက်ထဲ မသိမ်းပါနှင့်။",
    "Tap Connect via Hub (or Add router with Magic Hub selected). A window then shows the paste script. That window is not Cloud Remote and not the Scripts page.":
      "Hub မှ ချိတ်ဆက်ရန် ကို နှိပ်ပါ (သို့မဟုတ် Magic Hub ရွေးထားပြီး Add router)။ ထို့နောက် paste script ဝင်းဒိုး ပွင့်မည်။ ထိုဝင်းဒိုးသည် Cloud Remote မဟုတ်၊ Scripts စာမျက်နှာ မဟုတ်။",
    "Tap Connect via Hub (or Add router with Magic Hub selected). A window then shows the paste script. That window is Cloud Remote, not the Scripts page.":
      "Hub မှ ချိတ်ဆက်ရန် ကို နှိပ်ပါ (သို့မဟုတ် Magic Hub ရွေးထားပြီး Add router)။ ထို့နောက် paste script ဝင်းဒိုး ပွင့်မည်။ ထိုဝင်းဒိုးသည် Cloud Remote ဖြစ်ပြီး Scripts စာမျက်နှာ မဟုတ်။",
    "This board is already on Magic Hub. The paste script appears once in a window after Add router or Connect via Hub — not on the Scripts page. If you lost it, Remove then Connect via Hub.":
      "ဤဘုတ်သည် Magic Hub ပေါ်တွင် ရှိပြီးသား။ paste script သည် Add router သို့မဟုတ် Hub မှ ချိတ်ဆက်ရန် ပြီးနောက် ဝင်းဒိုးတွင် တစ်ကြိမ်သာ ပေါ်သည် — Scripts စာမျက်နှာ မဟုတ်။ ပျောက်သွားလျှင် Remove ပြီး Hub မှ ချိတ်ဆက်ရန် ကို နှိပ်ပါ။",
    "This board is already on Magic Hub (Cloud Remote). The paste script appears once in a window after Add router or Connect via Hub — not on the Scripts page. If you lost it, Remove then Connect via Hub.":
      "ဤဘုတ်သည် Magic Hub (Cloud Remote) ပေါ်တွင် ရှိပြီးသား။ paste script သည် Add router သို့မဟုတ် Hub မှ ချိတ်ဆက်ရန် ပြီးနောက် ဝင်းဒိုးတွင် တစ်ကြိမ်သာ ပေါ်သည် — Scripts စာမျက်နှာ မဟုတ်။ ပျောက်သွားလျှင် Remove ပြီး Hub မှ ချိတ်ဆက်ရန် ကို နှိပ်ပါ။",
    "Starlink / CGNAT with no site PC. Add the board on Routers — a paste-script window opens. Not Cloud Remote.":
      "Starlink / CGNAT၊ ဆိုက်တွင် PC မရှိ။ Routers တွင် ဘုတ်ထည့်ပါ — paste-script ဝင်းဒိုး ပွင့်မည်။ Cloud Remote မဟုတ်။",
    "Cloud Remote for Starlink / CGNAT. Add the board — a paste-script window opens.":
      "Starlink / CGNAT အတွက် Cloud Remote။ ဘုတ်ထည့်ပါ — paste-script ဝင်းဒိုး ပွင့်မည်။",
    "Starlink / CGNAT, no site PC. After Add router a paste-script window opens. Not Cloud Remote.":
      "Starlink / CGNAT၊ ဆိုက်တွင် PC မရှိ။ Add router ပြီးနောက် paste-script ဝင်းဒိုး ပွင့်မည်။ Cloud Remote မဟုတ်။",
    "Cloud Remote for Starlink / CGNAT. After Add router a paste-script window opens.":
      "Starlink / CGNAT အတွက် Cloud Remote။ Add router ပြီးနောက် paste-script ဝင်းဒိုး ပွင့်မည်။",
    "Remove Magic Hub for {name}?": "{name} အတွက် Magic Hub ကို ဖယ်ရှားမည်လား?",
    "On CGNAT the hostname is only a label — the app will not dial it after WireGuard is connected. Use MikroTik Cloud DDNS or any public DNS name you control.":
      "CGNAT တွင် hostname သည် အမည်တံဆိပ်သာ — WireGuard ချိတ်ပြီးနောက် အက်ပ်က ထိုလိပ်စာကို ထပ်မခေါ်ပါ။ MikroTik Cloud DDNS သို့မဟုတ် သင်ထိန်းချုပ်သော အများသုံး DNS အမည် သုံးပါ။",
    "On CGNAT the hostname is only a label — the app will not dial it after Magic Hub is connected. Use MikroTik Cloud DDNS or any public DNS name you control.":
      "CGNAT တွင် hostname သည် အမည်တံဆိပ်သာ — Magic Hub ချိတ်ပြီးနောက် အက်ပ်က ထိုလိပ်စာကို ထပ်မခေါ်ပါ။ MikroTik Cloud DDNS သို့မဟုတ် သင်ထိန်းချုပ်သော အများသုံး DNS အမည် သုံးပါ။",
    "A nickname only. Magic Hub never dials this — Starlink and CGNAT are fine. Leave blank to use the router name.":
      "အမည်တံဆိပ်သာ။ Magic Hub က ဤလိပ်စာကို မခေါ်ပါ — Starlink နှင့် CGNAT အဆင်ပြေသည်။ ဗလာထားလျှင် router အမည်ကို သုံးမည်။",
    "Add the router — the one-time Magic Hub script appears on the card. Paste it on the RouterBoard, then Check now.":
      "Router ထည့်ပါ — တစ်ကြိမ်သုံး Magic Hub script ကတ်ပေါ်တွင် ပေါ်မည်။ RouterBoard ပေါ်တွင် ကူးထည့်ပြီး Check now နှိပ်ပါ။",
    "RouterBoard dials out to the MikroTik Magic hub. Best for Starlink / CGNAT when you have no always-on PC on site.":
      "RouterBoard က MikroTik Magic hub သို့ ထွက်ချိတ်သည်။ ဆိုက်တွင် အမြဲဖွင့် PC မရှိသော Starlink / CGNAT အတွက် အကောင်းဆုံး။",
    "After you add the router, use Magic Hub below (always visible on the card) → Connect via Hub → paste the one-time script on the RouterBoard → Check now.":
      "Router ထည့်ပြီးနောက် အောက်တွင် အမြဲမြင်ရသော Magic Hub → Hub မှ ချိတ်ဆက်ရန် → တစ်ကြိမ်သုံး script ကို RouterBoard ပေါ်တွင် ကူးထည့် → ယခု စစ်ဆေးပါ။",
    "Local Connector reaches the LAN IP through a paired agent. Pair one under Connectors if the list is empty.":
      "Local Connector သည် တွဲပြီးသား agent မှတစ်ဆင့် LAN IP သို့ ရောက်သည်။ စာရင်း ဗလာဖြစ်လျှင် Connectors တွင် ဦးစွာ တွဲပါ။",
    "Cloud Remote connects over HTTPS (www-ssl, port 443 by default). Keep the self-signed certificate option on for MikroTik Cloud DDNS certificates.":
      "Cloud Remote သည် HTTPS (ပုံမှန် www-ssl port ၄၄၃) မှ ချိတ်သည်။ MikroTik Cloud DDNS လက်မှတ်များအတွက် self-signed ခွင့်ပြု ရွေးချယ်မှုကို ဖွင့်ထားပါ။",
    "Public IP / DDNS connects over HTTPS (www-ssl, port 443 by default). Keep the self-signed certificate option on for MikroTik Cloud DDNS certificates.":
      "Public IP / DDNS သည် HTTPS (ပုံမှန် www-ssl port ၄၄၃) မှ ချိတ်သည်။ MikroTik Cloud DDNS လက်မှတ်များအတွက် self-signed ခွင့်ပြု ရွေးချယ်မှုကို ဖွင့်ထားပါ။",
    "MikroTik Magic is a cloud-hosted web app. It reaches your RouterBoard in three ways: Cloud Remote / Magic Hub (router dials out to the MikroTik Magic VPS — for Starlink and other CGNAT lines), Local Connector (agent on the LAN), or Quick Setup when the WAN has a real public IP / DDNS + HTTPS. This manual covers each path, the tools in the app, and the plan limits that apply to your account.":
      "MikroTik Magic သည် cloud တွင် လက်ခံထားသော ဝဘ်အက်ပ်ဖြစ်သည်။ RouterBoard သို့ နည်းလမ်းသုံးမျိုးဖြင့် ရောက်ရှိသည် — Cloud Remote / Magic Hub (router က MikroTik Magic VPS သို့ ထွက်ချိတ်သည် — Starlink နှင့် အခြား CGNAT လိုင်းများအတွက်)၊ Local Connector (LAN အတွင်း agent)၊ သို့မဟုတ် WAN တွင် အများသုံး IP / DDNS + HTTPS ရှိသည့်အခါ Quick Setup။ ဤလက်စွဲတွင် လမ်းကြောင်းတစ်ခုချင်း၊ အက်ပ်ကိရိယာများနှင့် အကောင့်အစီအစဉ် ကန့်သတ်ချက်များကို ဖော်ပြသည်။",
    "MikroTik Magic is a cloud-hosted web app. You reach your RouterBoard in two ways: Magic Hub (Cloud Remote — the board dials out to the MikroTik Magic VPS for Starlink and other CGNAT lines) or Local Connector (a paired agent on the LAN). This manual covers both paths, the tools in the app, and the plan limits that apply to your account.":
      "MikroTik Magic သည် cloud တွင် လက်ခံထားသော ဝဘ်အက်ပ်ဖြစ်သည်။ RouterBoard သို့ နည်းလမ်းနှစ်မျိုးဖြင့် ရောက်ရှိသည် — Magic Hub (Cloud Remote — Starlink နှင့် အခြား CGNAT လိုင်းများအတွက် ဘုတ်က MikroTik Magic VPS သို့ ထွက်ချိတ်သည်) သို့မဟုတ် Local Connector (LAN တွင် တွဲပြီးသား agent)။ ဤလက်စွဲတွင် လမ်းကြောင်းနှစ်ခု၊ အက်ပ်ကိရိယာများနှင့် အကောင့်အစီအစဉ် ကန့်သတ်ချက်များကို ဖော်ပြသည်။",
    "add routers, live telemetry, interface traffic, Hotspot Share Protection and Magic Hub (Connect via Hub).":
      "router ထည့်ခြင်း၊ တိုက်ရိုက် telemetry၊ interface traffic၊ Hotspot Share Protection နှင့် Magic Hub (Hub မှ ချိတ်ဆက်ရန်)။",
    "MikroTik Magic is a cloud-hosted web app. Platform customers reach the RouterBoard with Magic Hub (Cloud Remote — the board dials out for Starlink / CGNAT) or Local Connector (agent on the LAN). Owner/admin accounts also get Public IP / DDNS via Quick Setup when the WAN has a real public address. This manual covers each path, the tools in the app, and the plan limits that apply to your account.":
      "MikroTik Magic သည် cloud တွင် လက်ခံထားသော ဝဘ်အက်ပ်ဖြစ်သည်။ ပလက်ဖောင်းဖောက်သည်များသည် Magic Hub (Cloud Remote — Starlink / CGNAT အတွက် ဘုတ်က ထွက်ချိတ်သည်) သို့မဟုတ် Local Connector (LAN အတွင်း agent) ဖြင့် RouterBoard သို့ ရောက်သည်။ Owner/admin အကောင့်များသည် WAN တွင် အများသုံး လိပ်စာ ရှိသောအခါ Quick Setup မှ Public IP / DDNS လည်း ရသည်။ ဤလက်စွဲတွင် လမ်းကြောင်းတစ်ခုချင်း၊ အက်ပ်ကိရိယာများနှင့် အကောင့်အစီအစဉ် ကန့်သတ်ချက်များကို ဖော်ပြသည်။",
    "CGNAT caveat: Starlink and most mobile ISPs hand out a shared address (100.64.0.0/10), so nothing from the internet can dial in — public-IP Quick Setup cannot work on those lines. Prefer Cloud Remote / Magic Hub: the RouterBoard dials out to the MikroTik Magic VPS hub. Local Connector is the alternative when you can run an always-on PC on site. Fiber lines with a public IP can use Quick Setup.":
      "CGNAT သတိပေးချက် — Starlink နှင့် မိုဘိုင်း ISP အများစုက မျှဝေလိပ်စာ (100.64.0.0/10) ပေးသောကြောင့် အင်တာနက်မှ ဝင်ခေါ်၍ မရပါ — အများသုံး IP Quick Setup ထိုလိုင်းများတွင် အလုပ်မလုပ်ပါ။ Cloud Remote / Magic Hub ကို ဦးစားပေးပါ — RouterBoard က MikroTik Magic VPS hub သို့ ထွက်ချိတ်သည်။ ဆိုက်တွင် အမြဲဖွင့် PC ထားနိုင်လျှင် Local Connector ကို အစားထိုးသုံးနိုင်သည်။ အများသုံး IP ရှိသော ဖိုက်ဘာလိုင်းများတွင် Quick Setup သုံးနိုင်သည်။",
    "For Starlink and other CGNAT lines the app cannot dial into the RouterBoard. RouterOS 7 already has WireGuard built in, so the board dials OUT to the MikroTik Magic hosted VPS hub. The hub holds one management peer per RouterBoard; the app then reaches RouterOS REST through the hub. Guest hotspot traffic still leaves via Starlink — the tunnel is management only. WinBox paste blocks live in Scripts (owner) under Magic Hub.":
      "Starlink နှင့် အခြား CGNAT လိုင်းများတွင် အက်ပ်က RouterBoard သို့ ဝင်ခေါ်၍ မရပါ။ RouterOS 7 တွင် WireGuard ပါပြီးသားဖြစ်သောကြောင့် ဘုတ်က MikroTik Magic host လုပ်ထားသော VPS hub သို့ ထွက်ချိတ်သည်။ Hub က RouterBoard တစ်လုံးလျှင် management peer တစ်ခု ထားရှိပြီး အက်ပ်က hub မှ RouterOS REST သို့ ရောက်သည်။ ဧည့်သည် hotspot traffic သည် Starlink မှ ဆက်ထွက်သည် — tunnel သည် စီမံခန့်ခွဲမှုအတွက်သာ ဖြစ်သည်။ WinBox ကူးထည့်စာတန်းများသည် ပိုင်ရှင် Scripts အောက်ရှိ Magic Hub တွင် ရှိသည်။",
    "For Starlink and other CGNAT lines the app cannot dial into the RouterBoard. RouterOS 7 already has WireGuard built in, so the board dials OUT to the MikroTik Magic hosted VPS hub. The hub holds one management peer per RouterBoard; the app then reaches RouterOS REST through the hub. Guest hotspot traffic still leaves via Starlink — the tunnel is management only. Stay in the Connect via Hub paste window for the key script; Scripts library blocks are optional recovery only.":
      "Starlink နှင့် အခြား CGNAT လိုင်းများတွင် အက်ပ်က RouterBoard သို့ ဝင်ခေါ်၍ မရပါ။ RouterOS 7 တွင် WireGuard ပါပြီးသားဖြစ်သောကြောင့် ဘုတ်က MikroTik Magic host လုပ်ထားသော VPS hub သို့ ထွက်ချိတ်သည်။ Hub က RouterBoard တစ်လုံးလျှင် management peer တစ်ခု ထားရှိပြီး အက်ပ်က hub မှ RouterOS REST သို့ ရောက်သည်။ ဧည့်သည် hotspot traffic သည် Starlink မှ ဆက်ထွက်သည် — tunnel သည် စီမံခန့်ခွဲမှုအတွက်သာ ဖြစ်သည်။ Key script အတွက် Hub မှ ချိတ်ဆက်ရန် paste ဝင်းဒိုးတွင် နေပါ၊ Scripts စာကြည့်တိုက်သည် ရွေးချယ် ပြန်ပြင်ရန်သာ။",
    "Default plans allow 1 site and 1 router. Paying to lift the limit lets the same account add another site/board; that board gets its own hub peer when you Connect via Hub.":
      "ပုံမှန် အစီအစဉ်များက site ၁ ခုနှင့် router ၁ လုံးသာ ခွင့်ပြုသည်။ ပိုမိုရန် ပေးချေပြီး ကန့်သတ်ချက် မြှင့်လျှင် တူညီသော အကောင့်က site/ဘုတ် ထပ်ထည့်နိုင်ပြီး ထိုဘုတ်ကို Hub မှ ချိတ်ဆက်သောအခါ hub peer အသစ် ရရှိသည်။",
    "RouterOS 7.1+ only (not TILE CCR1xxx). ether1 = Starlink. This script is hub/REST prep (WAN, LAN, NTP, cert, www-ssl) — not the WireGuard keys and not the full hotspot Master.":
      "RouterOS 7.1+ သာ (TILE CCR1xxx မဟုတ်)။ ether1 = Starlink။ ဤ script သည် hub/REST ပြင်ဆင်မှု (WAN, LAN, NTP, cert, www-ssl) — WireGuard key မပါ၊ hotspot Master အပြည့်အစုံ မဟုတ်။",
    "Skip Scripts prep if the board already has internet. The Connect paste sets www-ssl, magic-https, and rest-api — you do not need a second Scripts hop for REST.":
      "ဘုတ်တွင် အင်တာနက် ရှိပြီးသားဆိုလျှင် Scripts ပြင်ဆင်မှုကို ကျော်ပါ။ Connect paste က www-ssl၊ magic-https နှင့် rest-api သတ်မှတ်ပေးသည် — REST အတွက် Scripts ထပ်ခုန်ရန် မလို။",
    "The script contains this board’s private key and is shown only once. It already sets tunnel /24 and MTU 1280. Do not invent keys or edit the hub endpoint by hand. Do not put that script in the Scripts library.":
      "script တွင် ဤဘုတ်၏ private key ပါပြီး တစ်ကြိမ်သာ ပြသည်။ tunnel /24 နှင့် MTU 1280 ပါပြီးသား။ ကိုယ်တိုင် key မဖန်တီးပါနှင့်၊ hub endpoint ကို လက်ဖြင့် မပြင်ပါနှင့်။ ထို script ကို Scripts စာကြည့်တိုက်ထဲ မထည့်ပါနှင့်။",
    "Private key is shown once. Script uses the hub IP when possible (avoids broken LAN DNS), tunnel /24, MTU 1280, www-ssl + cert, rest-api. Do not edit the endpoint. Do not save it into the Scripts library.":
      "Private key ကို တစ်ကြိမ်သာ ပြသည်။ Script က ဖြစ်နိုင်လျှင် hub IP သုံးသည် (LAN DNS ပျက်ခြင်းကို ရှောင်ရန်)၊ tunnel /24၊ MTU 1280၊ www-ssl + လက်မှတ်၊ rest-api။ Endpoint မပြင်ပါနှင့်။ Scripts စာကြည့်တိုက်ထဲ မသိမ်းပါနှင့်။",
    "Green / Online means the hub can reach www-ssl on the tunnel. Then telemetry, terminal, vouchers and portal deploy work over WireGuard.":
      "အစိမ်း / Online ဆိုသည်မှာ hub က tunnel ပေါ်ရှိ www-ssl သို့ ရောက်နိုင်သည်။ ထို့နောက် telemetry၊ terminal၊ voucher နှင့် portal တင်ခြင်းတို့ WireGuard မှ လုပ်ဆောင်သည်။",
    "Green means the hub can reach www-ssl on the tunnel. nginx 404/502 is a hub proxy issue, not a RouterOS version problem. Re-paste from Show paste window before hopping Scripts.":
      "အစိမ်းဆိုသည်မှာ hub က tunnel ပေါ်ရှိ www-ssl သို့ ရောက်နိုင်သည်။ nginx 404/502 သည် hub proxy ပြဿနာ၊ RouterOS ဗားရှင်း ပြဿနာ မဟုတ်။ Scripts သို့ မခုန်မီ Show paste window မှ ပြန်ကူးထည့်ပါ။",
    "Do not build your own hub or paste peer blocks onto a DIY VPS — MikroTik Magic hosts hub.mikromagic.app for you.":
      "ကိုယ်ပိုင် hub မတည်ဆောက်ပါနှင့်၊ DIY VPS ပေါ်သို့ peer block မကူးထည့်ပါနှင့် — MikroTik Magic က hub.mikromagic.app ကို သင့်အတွက် host လုပ်ပေးသည်။",
    "One RouterBoard = one WireGuard peer. Remove Magic Hub in the app before requesting a fresh script for the same board.":
      "RouterBoard တစ်လုံး = WireGuard peer တစ်ခု။ တူညီသော ဘုတ်အတွက် script အသစ် တောင်းမီ အက်ပ်တွင် Magic Hub ကို ဖယ်ရှားပါ။",
    "The rollback script removes the magic-cloud interface, peer, address, mangle and firewall rules if you want to undo it.":
      "ပြန်ဖျက်လိုလျှင် rollback script က magic-cloud interface၊ peer၊ လိပ်စာ၊ mangle နှင့် firewall စည်းမျဉ်းများကို ဖယ်ရှားသည်။",
    "Hub nginx and iptables stay on the VPS — they are not part of the per-board Scripts. Do not re-edit nginx for each new router.":
      "Hub nginx နှင့် iptables သည် VPS ပေါ်တွင်သာ ရှိသည် — ဘုတ်တစ်လုံးချင်း Scripts မဟုတ်။ Router အသစ်တိုင်းအတွက် nginx ကို ပြန်မပြင်ပါနှင့်။",
    "confirm the board has WAN internet, the app script was imported, magic-cloud is /24 not /32, and /interface/wireguard/peers shows a recent last-handshake. www-ssl must have a certificate on port 443. Tick Allow self-signed. If Connect via Hub fails in the app, the hosted hub secrets may be missing — contact the owner.":
      "ဘုတ်တွင် WAN အင်တာနက် ရှိကြောင်း၊ အက်ပ် script တင်ပြီးကြောင်း၊ magic-cloud သည် /24 ဖြစ်ပြီး /32 မဟုတ်ကြောင်းနှင့် /interface/wireguard/peers တွင် last-handshake မကြာသေးကြောင်း အတည်ပြုပါ။ www-ssl တွင် port ၄၄၃ လက်မှတ် ရှိရမည်။ Allow self-signed ကို ရွေးပါ။ အက်ပ်တွင် Hub မှ ချိတ်ဆက်ရန် မအောင်မြင်ပါက hosted hub လျှို့ဝှက်ချက်များ ပျောက်နေနိုင်သည် — ပိုင်ရှင်ကို ဆက်သွယ်ပါ။",
    "confirm WAN (default route), re-paste Show paste window (not Scripts hopping), wait for last-handshake, ignore hub ICMP. App password must match WinBox with rest-api. nginx 404/502 after a fresh handshake is a hub REST proxy / secrets issue — contact the owner, not a RouterOS 7.1 upgrade.":
      "WAN (default route) အတည်ပြုပါ၊ Show paste window မှ ပြန်ကူးထည့်ပါ (Scripts မခုန်ပါနှင့်)၊ last-handshake စောင့်ပါ၊ hub ICMP လျစ်လျူရှုပါ။ အက်ပ် စကားဝှက်သည် WinBox နှင့် တူပြီး rest-api ပါရမည်။ Handshake အသစ်ပြီးနောက် nginx 404/502 သည် hub REST proxy / secrets ပြဿနာ — ပိုင်ရှင်ကို ဆက်သွယ်ပါ၊ RouterOS 7.1 အဆင့်မြှင့်ရန် မဟုတ်။",
    "Gateways, guests online, and open incidents — refreshed every minute.":
      "Gateway များ၊ အွန်လိုင်း ဧည့်သည်များနှင့် ဖွင့်ထားသော ဖြစ်ရပ်များ — တစ်မိနစ်တိုင်း ပြန်လည်ဆန်းသစ်သည်။",
    "Pick one path. All of them unlock Live, vouchers, portal deploy and telemetry.":
      "လမ်းကြောင်းတစ်ခု ရွေးပါ။ အားလုံးက Live၊ voucher၊ portal တင်ခြင်းနှင့် telemetry ကို ဖွင့်ပေးသည်။",
    "This is a virtual MikroTik stored in your account. Connection checks, Live users, and Vouchers work the same as a real router. Nothing is dialled — not LAN, not Cloud DDNS, not the Singapore hub.":
      "ဤသည်မှာ သင့်အကောင့်တွင် သိမ်းထားသော virtual MikroTik ဖြစ်သည်။ ချိတ်ဆက်စစ်ဆေးခြင်း၊ Live users နှင့် Vouchers သည် အစစ် Router ကဲ့သို့ အလုပ်လုပ်သည်။ LAN, Cloud DDNS, စင်္ကာပူ hub မည်သည့်နေရာကိုမျှ မခေါ်ဆိုပါ။",
    "Could not load your sandbox. Try again in a moment.":
      "Sandbox ကို ဖွင့်၍မရပါ။ ခဏနေပြီး ထပ်ကြိုးစားပါ။",
    "No sandbox yet.": "Sandbox မရှိသေးပါ။",
    "Create one virtual RB5009. It does not count toward your paid router quota. One per account.":
      "virtual RB5009 တစ်လုံး ဖန်တီးပါ။ ပေးချေထားသော Router ခွင့်ပြုချက်ကို မသုံးပါ။ အကောင့်တစ်ခုလျှင် တစ်လုံး။",
    "Sandbox is a virtual MikroTik in your account — Live users and Vouchers work without hardware. Real routers are physical devices and every write is gated.":
      "Sandbox သည် သင့်အကောင့်ရှိ virtual MikroTik ဖြစ်သည် — ဟာ့ဒ်ဝဲမလိုဘဲ Live users နှင့် Vouchers သုံးနိုင်သည်။ အစစ် Router များသည် ရုပ်ပိုင်းဆိုင်ရာ စက်များဖြစ်ပြီး ရေးခြင်းတိုင်းကို ထိန်းချုပ်ထားသည်။",
    "This router is a virtual lab device. Kick, ban and vouchers stay in the app and never reach hardware. Magic Hub and Multi-WAN are not available.":
      "ဤ Router သည် virtual lab စက်ဖြစ်သည်။ Kick, ban နှင့် voucher များသည် အက်ပ်ထဲတွင်သာ ရှိပြီး ဟာ့ဒ်ဝဲသို့ မရောက်ပါ။ Magic Hub နှင့် Multi-WAN မရနိုင်ပါ။",
    "Runs from the cloud against a public WAN IP or Cloud DDNS hostname (not a LAN IP). Reads Cloud DDNS and tests whether the internet can reach the router. Starlink and mobile ISPs are usually CGNAT — those sites need Magic Hub or Local Connector.":
      "ကလောက်မှ အများပြည်သူ WAN IP သို့မဟုတ် Cloud DDNS hostname (LAN IP မဟုတ်) ကို စစ်ဆေးသည်။ Cloud DDNS ဖတ်ပြီး အင်တာနက်မှ Router သို့ ရောက်နိုင်ခြင်းကို စမ်းသည်။ Starlink နှင့် မိုဘိုင်း ISP များသည် အများအားဖြင့် CGNAT ဖြစ်သောကြောင့် ထိုနေရာများတွင် Magic Hub သို့မဟုတ် Local Connector လိုအပ်သည်။",
    "Then set the router up locally on that same machine":
      "ထို့နောက် ထိုကွန်ပျူတာပေါ်တွင် Router ကို ဒေသတွင်း တပ်ဆင်ပါ",
    "Plug an Ethernet cable from that computer into any RB4011 LAN port (ether2 – ether10) yourself — this is a manual step the app cannot perform. Then run the local setup tool. It asks for the router username and password on that computer only: they are never typed into this page and never sent to MikroMagic.":
      "ထိုကွန်ပျူတာမှ Ethernet ကြိုးကို RB4011 ၏ LAN ပေါ့တ် တစ်ခုခု (ether2–ether10) သို့ သင်ကိုယ်တိုင် ထည့်ပါ — အက်ပ်က မလုပ်ပေးနိုင်သော လက်ဖြင့် လုပ်ရမည့် အဆင့်ဖြစ်သည်။ ထို့နောက် ဒေသတွင်း တပ်ဆင်ကိရိယာကို ဖွင့်ပါ။ Router အသုံးပြုသူအမည်နှင့် စကားဝှက်ကို ထိုကွန်ပျူတာပေါ်တွင်သာ မေးသည်။ ဤစာမျက်နှာတွင် ရိုက်မည် မဟုတ်၊ MikroMagic သို့လည်း မပို့ပါ။",
    "Local setup tool": "ဒေသတွင်း တပ်ဆင်ကိရိယာ",
    "Checking your access…": "သင့်ခွင့်ပြုချက်ကို စစ်ဆေးနေသည်…",
    "This part of the Test Lab talks to physical hardware, so only the app owner or an admin can open it.":
      "Test Lab ၏ ဤအပိုင်းသည် ရုပ်ပိုင်းဆိုင်ရာ ဟာ့ဒ်ဝဲနှင့် ဆက်သွယ်သောကြောင့် ပိုင်ရှင် သို့မဟုတ် အက်ဒမင်သာ ဖွင့်နိုင်သည်။",
    "Use a spare physical MikroTik. Every write is gated. MCP access is a policy checklist — it never talks to hardware.":
      "အရန် ရုပ်ပိုင်းဆိုင်ရာ MikroTik ကို သုံးပါ။ ရေးခြင်းတိုင်းကို ထိန်းချုပ်ထားသည်။ MCP သည် မူဝါဒ စစ်ဆေးစာရင်းဖြစ်ပြီး ဟာ့ဒ်ဝဲနှင့် မဆက်သွယ်ပါ။",
    "Found by the local connector on the customer LAN. Run the local setup tool on the connector machine to authenticate and bootstrap a router — the admin password is never entered here.":
      "ဖောက်သည် LAN ပေါ်ရှိ ဒေသတွင်း connector က ရှာတွေ့သည်။ Connector စက်ပေါ်တွင် ဒေသတွင်း တပ်ဆင်ကိရိယာဖြင့် Router ကို အတည်ပြုပြီး စတင်တပ်ဆင်ပါ — အက်ဒမင် စကားဝှက်ကို ဤနေရာတွင် ထည့်မည် မဟုတ်ပါ။",
    "Nothing discovered yet. Connect the machine to a router LAN port and rescan.":
      "ဘာမှ မတွေ့ရသေးပါ။ စက်ကို Router LAN ပေါ့တ်နှင့် ချိတ်ပြီး ပြန်ရှာပါ။",
    "Last seen": "နောက်ဆုံး မြင်ရချိန်",
    Backup: "အရန်သိမ်းခြင်း",
    "No backup recorded": "အရန်သိမ်းမှတ်တမ်း မရှိသေး",
    "Rollback available": "ပြန်လှည့်နိုင်သည်",
    "No rollback script": "ပြန်လှည့် စကရစ် မရှိ",
    "Every configuration push, rehearsal or real, kept so you can see exactly what changed, who changed it and whether it was verified.":
      "ဖွဲ့စည်းမှု တင်ခြင်းတိုင်း (လေ့ကျင့်မှု သို့မဟုတ် အစစ်) ကို သိမ်းထားသောကြောင့် ဘာပြောင်းခဲ့သလဲ၊ ဘယ်သူပြောင်းသလဲ၊ အတည်ပြုပြီးပြီလား ဆိုသည်ကို ကြည့်နိုင်သည်။",
    "We could not load the deployment history. Try again in a moment.":
      "တပ်ဆင်မှု မှတ်တမ်းကို တင်မရပါ။ ခဏနေမှ ထပ်ကြိုးစားပါ။",
    "No deployments recorded yet. Rehearsals appear here too.":
      "တပ်ဆင်မှု မှတ်တမ်း မရှိသေး။ လေ့ကျင့်မှုများလည်း ဤတွင် ပေါ်မည်။",
    "Every switch, gateway and access point behind your router, in one list. Actions your hardware cannot do are shown as unavailable rather than failing.":
      "သင့် Router နောက်ရှိ switch၊ gateway နှင့် AP အားလုံးကို စာရင်းတစ်ခုတွင် ကြည့်ပါ။ ဟာ့ဒ်ဝဲ မလုပ်နိုင်သော လုပ်ဆောင်ချက်များကို ကျရှုံးမည့်အစား မရနိုင်ဟု ပြသည်။",
    "We could not load your devices. Try again in a moment.":
      "သင့်စက်များကို တင်မရပါ။ ခဏနေမှ ထပ်ကြိုးစားပါ။",
    "No devices yet. Add the switches and access points behind your router.":
      "စက် မရှိသေး။ Router နောက်ရှိ switch နှင့် AP များကို ထည့်ပါ။",
    "Reading ports…": "ပေါ့တ်များ ဖတ်နေသည်…",
    "links up": "လင့်ခ် ချိတ်ဆက်ပြီး",
    "ports powered": "ပေါ့တ်များ ပါဝါရပြီး",
    "PoE draw not reported": "PoE သုံးစွဲမှု မဖော်ပြ",
    measured: "တိုင်းတာပြီး",
    "This cuts power to whatever is plugged into this port. Type the port name":
      "ဤပေါ့တ်တွင် တပ်ထားသော စက်သို့ ပါဝါ ဖြတ်မည်။ ပေါ့တ်အမည်ကို ရိုက်ပါ",
    "to confirm.": "အတည်ပြုရန်။",
    "Problems worth your attention, raised only after repeated failed checks and kept quiet for a while after the first alert.":
      "သတိပြုသင့်သော ပြဿနာများ။ စစ်ဆေးမှု အကြိမ်ကြိမ် မအောင်မြင်မှသာ တင်ပြပြီး ပထမ သတိပေးပြီးနောက် ခဏ ငြိမ်သက်ထားသည်။",
    "We could not load incidents. Try again in a moment.":
      "ဖြစ်ရပ်များကို တင်မရပါ။ ခဏနေမှ ထပ်ကြိုးစားပါ။",
    "Nothing is wrong right now. Run a check to refresh this view.":
      "ယခု အဆင်ပြေနေသည်။ ဤမြင်ကွင်းကို ပြန်လည်စစ်ဆေးရန် စစ်ဆေးမှု ပြုလုပ်ပါ။",
    Started: "စတင်ချိန်",
    "Turn an alert off, or change how many failed checks it takes and how long we stay quiet afterwards.":
      "သတိပေးချက်ကို ပိတ်နိုင်သည် သို့မဟုတ် မအောင်မြင်သော စစ်ဆေးမှု အရေအတွက်နှင့် နောက်ဆက်တွဲ ငြိမ်သက်ချိန်ကို ပြောင်းနိုင်သည်။",
    "inventory of switches and devices with per-port status and details.":
      "ပေါ့တ်အလိုက် အခြေအနေနှင့် အသေးစိတ်ပါသော switch နှင့် စက်စာရင်း။",
    "outages and alerts raised by your devices, with their current state.":
      "သင့်စက်များမှ ထွက်သော ပြတ်တောက်မှုနှင့် သတိပေးချက်များ၊ လက်ရှိ အခြေအနေနှင့်အတူ။",
    "your current plan, expiry date, device allowance and renewal requests.":
      "လက်ရှိ အစီအစဉ်၊ သက်တမ်းကုန်ရက်၊ စက်ခွင့်ပြုချက်နှင့် သက်တမ်းတိုး တောင်းဆိုမှုများ။",
    "display name, password, language (English / Chinese / Burmese), install-to-phone and sign out.":
      "ဖော်ပြအမည်၊ စကားဝှက်၊ ဘာသာစကား (အင်္ဂလိပ် / တရုတ် / မြန်မာ)၊ ဖုန်းသို့ ထည့်သွင်းခြင်းနှင့် ထွက်ခြင်း။",
    "The User manual is help content — it is not part of the 14 features.":
      "အသုံးပြုနည်းလမ်းညွှန်သည် အကူအညီစာသားဖြစ်သည် — လက္ခဏာ ၁၄ ခုထဲတွင် မပါဝင်ပါ။",
    "In the top navigation the Connectors tab now sits immediately after Routers (Routers → Connectors). Open Connectors → Guided setup and follow the four steps below. It mirrors the router Quick setup wizard, so you can jump back to any completed step. You can also open the page directly at /app/connectors — the highlighted tab and the breadcrumb at the top of the page confirm you are in the right section.":
      "အပေါ် လမ်းညွှန်တွင် Connectors တဘ်သည် ယခု Routers ၏ နောက်တွင် ချက်ချင်းရှိသည် (Routers → Connectors)။ Connectors → Guided setup ကို ဖွင့်ပြီး အောက်ပါ အဆင့်လေးဆင့်ကို လိုက်နာပါ။ Router Quick setup နှင့် တူသောကြောင့် ပြီးစီးပြီး အဆင့်သို့ ပြန်သွားနိုင်သည်။ /app/connectors သို့ တိုက်ရိုက်လည်း ဖွင့်နိုင်သည် — မီးမောင်းထိုးထားသော တဘ်နှင့် စာမျက်နှာထိပ်ရှိ breadcrumb က မှန်ကန်သော အပိုင်းတွင် ရှိကြောင်း အတည်ပြုသည်။",
    "Back-office only. Cash sales, bank-transfer receipts and the guest sessions they paid for. Vouchers are only issued once a sale is recorded.":
      "နောက်ခံရုံးသုံးသာ။ ငွေသား ရောင်းချမှု၊ ဘဏ်လွှဲ ပြေစာနှင့် ၎င်းတို့ ပေးချေထားသော ဧည့်သည် ဆက်ရှင်များ။ ရောင်းချမှု မှတ်တမ်းတင်ပြီးမှသာ voucher ထုတ်ပေးသည်။",
    "Dark mode is the default look. Switch to light if you prefer brighter browsing — accents stay brand blue → violet either way.":
      "အမှောင်မုဒ်သည် ပုံသေ အသွင်အပြင်ဖြစ်သည်။ ပိုလင်းသော ကြည့်ရှုမှုကို ကြိုက်လျှင် အလင်းမုဒ်သို့ ပြောင်းပါ — အမှတ်တံဆိပ် အပြာမှ ခရမ်းရောင် အသားပေးအရောင်များသည် နှစ်မုဒ်လုံးတွင် တူညီသည်။",
    "An honest picture before you go live: what is set up, what is not, and exactly which hardware this app can control.":
      "အွန်လိုင်းမတင်မီ ရိုးသားသော ခြုံငုံသုံးသပ်ချက်။ ဘာတပ်ဆင်ပြီးပြီလဲ၊ ဘာမတပ်သေးလဲ၊ ဤအက်ပ်က မည်သည့် ဟာ့ဒ်ဝဲကို ထိန်းချုပ်နိုင်သလဲ။",
    "A MikroTik gateway running RouterOS 7 with the REST service reachable — directly, through a paired local connector, or via Magic Hub.":
      "RouterOS 7 နှင့် REST ဝန်ဆောင်မှု ရောက်ရှိနိုင်သော MikroTik gateway — တိုက်ရိုက်၊ တွဲချိတ်ထားသော ဒေသတွင်း connector မှ၊ သို့မဟုတ် Magic Hub မှ။",
    "A dedicated API user on the router. Never reuse the admin account you log into WebFig with.":
      "Router ပေါ်ရှိ သီးသန့် API အသုံးပြုသူ။ WebFig ဝင်သည့် အက်ဒမင်အကောင့်ကို ပြန်မသုံးပါနှင့်။",
    "Bank details entered for manual transfer, since no live payment provider is enabled.":
      "တိုက်ရိုက် ငွေပေးချေ ဝန်ဆောင်မှု မဖွင့်ထားသောကြောင့် လက်ဖြင့် လွှဲရန် ဘဏ်အချက်အလက် ထည့်ထားသည်။",
    "At least one alert rule turned on, so an outage reaches you before your guests do.":
      "အနည်းဆုံး သတိပေး စည်းမျဉ်း တစ်ခု ဖွင့်ထားပါ၊ ဧည့်သည် မသိခင် ပြတ်တောက်မှုကို သင်သိနိုင်ရန်။",
    "A crossed-out action means this app cannot perform it on that hardware — use the vendor's own tool instead.":
      "မျဉ်းဖြတ်ထားသော လုပ်ဆောင်ချက်သည် ထိုဟာ့ဒ်ဝဲတွင် ဤအက်ပ် မလုပ်နိုင်ကြောင်း ဆိုလိုသည် — ရောင်းချသူ၏ ကိရိယာကို အသုံးပြုပါ။",
    "Live card or wallet payment providers — checkout uses bank transfer with manual receipt review.":
      "ကတ် သို့မဟုတ် ပိုက်ဆံအိတ် ငွေပေးချေမှု — ငွေရှင်းခြင်းသည် ဘဏ်လွှဲနှင့် လက်ဖြင့် ပြေစာ စစ်ဆေးခြင်းကို သုံးသည်။",
    "Live port reads for Ruijie, Cisco, TP-Link and UniFi switches — inventory and capabilities only.":
      "Ruijie၊ Cisco၊ TP-Link နှင့် UniFi switch များအတွက် တိုက်ရိုက် ပေါ့တ်ဖတ်ခြင်း — လက်ရှိတွင် စာရင်းနှင့် စွမ်းရည်သာ။",
    "Automatic remediation. Every configuration change needs a person to confirm it.":
      "အလိုအလျောက် ပြင်ဆင်ခြင်း။ ဖွဲ့စည်းမှု ပြောင်းလဲမှုတိုင်းကို လူက အတည်ပြုရမည်။",
    "An AI assistant connected over MCP can look at your network. It cannot change it: no tool exposed today creates, disconnects, blocks or deletes anything.":
      "MCP မှ ချိတ်ဆက်ထားသော AI လက်ထောက်သည် သင့်ကွန်ရက်ကို ကြည့်နိုင်သည်။ ပြောင်းလဲ၍ မရပါ။ ယနေ့ ထုတ်ပြထားသော ကိရိယာများသည် ဖန်တီးခြင်း၊ ဖြတ်ခြင်း၊ ပိတ်ဆို့ခြင်း သို့မဟုတ် ဖျက်ခြင်း မလုပ်ပါ။",
    "These exist in the source code but are not registered with the MCP server and do not appear in its manifest, so no client can call them.":
      "ဤကိရိယာများသည် ရင်းမြစ်ကုဒ်တွင် ရှိသော်လည်း MCP ဆာဗာတွင် မမှတ်ပုံတင်ဘဲ manifest တွင် မပေါ်သောကြောင့် မည်သည့် client မှ ခေါ်၍ မရပါ။",
    "Nothing on this page contacts a router by itself. A read-only connection check always runs first, writes happen one router at a time, and each one needs a typed confirmation.":
      "ဤစာမျက်နှာရှိ အရာများသည် ကိုယ်တိုင် Router သို့ မဆက်သွယ်ပါ။ အမြဲ ဖတ်သာရ ဆက်သွယ်မှု စစ်ဆေးမှု အရင်လုပ်သည်။ ရေးခြင်းကို Router တစ်လုံးချင်းစီ လုပ်ပြီး တစ်ခုချင်းစီကို စာရိုက် အတည်ပြုရမည်။",
    "Could not load your routers. Try again in a moment.":
      "သင့် Router များကို တင်မရပါ။ ခဏနေမှ ထပ်ကြိုးစားပါ။",
    "No routers are registered yet.": "Router မမှတ်ပုံတင်ရသေးပါ။",
    "Work through the checklist below first. When your isolated lab router is ready, register it deliberately from the Routers page — it will be created as a test router.":
      "အောက်ပါ စစ်ဆေးစာရင်းကို အရင် လုပ်ပါ။ သီးခြား ဓာတ်ခွဲခန်း Router အဆင်သင့်ဖြစ်သောအခါ Routers စာမျက်နှာမှ ရည်ရွယ်ချက်ရှိရှိ မှတ်ပုံတင်ပါ — စမ်းသပ် Router အဖြစ် ဖန်တီးမည်။",
    "None.": "မရှိ။",
    "Every item must be true before the first guarded write.":
      "ပထမဆုံး ထိန်းချုပ်ရေး ရေးခြင်း မလုပ်မီ အချက်တိုင်း မှန်ရမည်။",
    "Test-router actions run against ${BATCH_LIMIT.test} router at a time; production allows at most ${BATCH_LIMIT.production}.":
      "စမ်းသပ် Router လုပ်ဆောင်ချက်များသည် တစ်ကြိမ်လျှင် ${BATCH_LIMIT.test} လုံး၊ ထုတ်လုပ်မှုတွင် အများဆုံး ${BATCH_LIMIT.production} လုံး။",
    'Promoting a router to production needs an owner or admin role plus the exact phrase, for example: "':
      "Router ကို ထုတ်လုပ်မှုသို့ မြှင့်တင်ရန် ပိုင်ရှင် သို့မဟုတ် အက်ဒမင် အခန်းကဏ္ဍနှင့် တိကျသော စာသား လိုအပ်သည်၊ ဥပမာ - “",
    'Publishing a portal to production needs the phrase "DEPLOY PRODUCTION <router name>"; a test router uses "DEPLOY <router name>".':
      "Portal ကို ထုတ်လုပ်မှုသို့ ထုတ်ဝေရန် “DEPLOY PRODUCTION <router name>” စာသား လိုအပ်သည်။ စမ်းသပ် Router သည် “DEPLOY <router name>” ကို သုံးသည်။",
    "Connection checks, validation failures, promotions, deploys, rollbacks and failed confirmations are all written to the operations audit — never with secrets.":
      "ဆက်သွယ်မှု စစ်ဆေးမှုများ၊ အတည်ပြု မအောင်မြင်မှုများ၊ မြှင့်တင်မှုများ၊ တပ်ဆင်မှုများ၊ ပြန်လှည့်မှုများနှင့် အတည်ပြု မအောင်မြင်မှုများအားလုံးကို လုပ်ငန်းဆောင်ရွက်မှု စစ်ဆေးမှတ်တမ်းတွင် ရေးသည် — လျှို့ဝှက်ချက်များ မပါ။",
    "We could not load your business figures. Retry in a moment.":
      "စီးပွားရေး ကိန်းဂဏန်းများ မရယူနိုင်ပါ။ ခဏအကြာတွင် ပြန်ကြိုးစားပါ။",
    "No sites yet": "နေရာ မရှိသေးပါ",
    "Manage the router from anywhere over MikroTik's free xxxx.sn.mynetname.net hostname. Needs a public IP on the WAN line.":
      "MikroTik ၏ အခမဲ့ xxxx.sn.mynetname.net hostname ဖြင့် မည်သည့်နေရာမှမဆို Router ကို စီမံနိုင်သည်။ WAN လိုင်းတွင် အများသုံး IP လိုအပ်သည်။",
    "A paired agent on the site reaches the router's LAN IP. Works behind CGNAT (Starlink, mobile ISPs) with no port forwarding.":
      "လုပ်ငန်းခွင်ရှိ တွဲချိတ်ထားသော agent သည် Router ၏ LAN IP သို့ ချိတ်ဆက်ပေးသည်။ CGNAT (Starlink၊ မိုဘိုင်း ISP) အောက်တွင်လည်း port forward မလိုဘဲ အလုပ်လုပ်သည်။",
    "Hostname filled in above — add the router to finish.":
      "Hostname ကို အထက်တွင် အလိုအလျောက် ဖြည့်ပြီးပါပြီ — Router ထည့်၍ ပြီးဆုံးပါစေ။",
    "Manage the router from anywhere over MikroTik's own free Cloud DDNS hostname — no VPS or third-party service. Use this when the site has a public IP. Before you start, make sure you have:":
      "MikroTik ကိုယ်ပိုင် အခမဲ့ Cloud DDNS hostname ဖြင့် မည်သည့်နေရာမှမဆို Router ကို စီမံပါ — VPS သို့မဟုတ် ပြင်ပဝန်ဆောင်မှု မလိုပါ။ နေရာတွင် အများသုံး IP ရှိမှ အသုံးပြုပါ။ မစတင်မီ အောက်ပါတို့ ရှိရန် လိုအပ်သည် —",
    "MikroTik Magic gives your account 14 features. The User manual is help only, so it does not count as a feature.":
      "MikroTik Magic သည် သင့်အကောင့်အတွက် အင်္ဂါရပ် ၁၄ ခု ပေးထားသည်။ User manual သည် အကူအညီ အချက်အလက်သာ ဖြစ်သောကြောင့် အင်္ဂါရပ်အဖြစ် မရေတွက်ပါ။",
    "health score, router status dots, alerts and quick links to every tool.":
      "ကျန်းမာရေးအမှတ်၊ Router အခြေအနေ အမှတ်များ၊ သတိပေးချက်များနှင့် အင်္ဂါရပ်အားလုံးသို့ အမြန်လင့်များ။",
    "guided wizard for DDNS, TLS, firewall, the API user and one-click rollback if a script fails.":
      "DDNS၊ TLS၊ firewall နှင့် API user တို့ကို လမ်းညွှန်ပေးသော wizard၊ script မအောင်မြင်ပါက တစ်ချက်နှိပ်ရုံဖြင့် ပြန်လည်ရုပ်သိမ်းနိုင်သည်။",
    "guided setup for the Windows/macOS agent: pairing codes, heartbeat status, self-updates and bound devices.":
      "Windows/macOS agent အတွက် လမ်းညွှန် တပ်ဆင်မှု — တွဲချိတ်ကုဒ်၊ heartbeat အခြေအနေ၊ အလိုအလျောက် အပ်ဒိတ်နှင့် ချိတ်ဆက်ထားသော စက်များ။",
    "group devices by location on a real map and switch context in one click.":
      "တကယ့်မြေပုံပေါ်တွင် တည်နေရာအလိုက် စက်များကို အုပ်စုဖွဲ့ပြီး တစ်ချက်နှိပ်ရုံဖြင့် ပြောင်းကြည့်နိုင်သည်။",
    "manage UniFi, MikroTik CAPsMAN, Ruijie/Reyee and generic controllers: SSIDs, Wi-Fi passwords, VLANs, radios, reboots, alarms and clients.":
      "UniFi၊ MikroTik CAPsMAN၊ Ruijie/Reyee နှင့် အခြား controller များကို စီမံပါ — SSID၊ Wi-Fi စကားဝှက်၊ VLAN၊ radio၊ ပြန်စတင်ခြင်း၊ သတိပေးချက်နှင့် အသုံးပြုသူများ။",
    "live health, traffic and events across every router, with on-demand AI scans (never automatic).":
      "Router အားလုံး၏ တိုက်ရိုက် ကျန်းမာရေး၊ traffic နှင့် ဖြစ်ရပ်များ၊ လိုအပ်ချိန်တွင် ကိုယ်တိုင် နှိပ်၍ AI စကင်န် (အလိုအလျောက် မလုပ်ပါ)။",
    "active sessions with kick, ban, bandwidth limits and remaining voucher time.":
      "လက်ရှိ အသုံးပြုနေသူများ — ဖြုတ်ချခြင်း၊ ပိတ်ပင်ခြင်း၊ bandwidth ကန့်သတ်ခြင်းနှင့် ကျန်ရှိသော voucher အချိန်။",
    "plan templates (1d / 7d / 1M / VIP), bulk code generation, printable slips and multi-router pooling.":
      "အစီအစဉ် ပုံစံများ (၁ ရက် / ၇ ရက် / ၁ လ / VIP)၊ ကုဒ်အများအပြား ထုတ်ခြင်း၊ ပရင့်ထုတ်နိုင်သော စလစ်များနှင့် Router အများဖြင့် မျှဝေသုံးခြင်း။",
    "Plans · bulk codes · printable slips · live status.":
      "အစီအစဉ်များ · ကုဒ်အများ · ပရင့်စလစ် · တိုက်ရိုက် အခြေအနေ။",
    "automatic MMK rollups from voucher usage, daily/weekly/monthly audit views, exportable.":
      "Voucher အသုံးပြုမှုမှ ကျပ်ငွေ ဝင်ငွေကို အလိုအလျောက် စုစည်းပြီး နေ့စဉ်/အပတ်စဉ်/လစဉ် စာရင်းများ ကြည့်နိုင်၊ ထုတ်ယူနိုင်သည်။",
    "liquid-glass captive-portal designer with editable text and images, deployed to the router in one click.":
      "စာသားနှင့် ဓာတ်ပုံများ ပြင်ဆင်နိုင်သော liquid-glass Portal ဒီဇိုင်နာ၊ တစ်ချက်နှိပ်ရုံဖြင့် Router သို့ တင်နိုင်သည်။",
    "HTTPS ingest from RouterOS (owner token, shown once), then AI translation of log lines into plain-language causes and fixes.":
      "RouterOS မှ HTTPS ဖြင့် လက်ခံသည် (ပိုင်ရှင် token၊ တစ်ကြိမ်သာ ပြသည်)၊ ထို့နောက် AI က log များကို နားလည်လွယ်သော အကြောင်းရင်းနှင့် ဖြေရှင်းနည်းအဖြစ် ပြောင်းသည်။",
    "Owners mint one HTTPS token per router (shown once, hashed at rest). Paste the Syslog AI HTTPS shipper from Scripts, or copy it from the one-time panel on Syslog AI. The board POSTs new /log lines to mikromagic.app every 15s over outbound 443. UDP syslog cannot reach this webhook. Events are kept 14 days.":
      "ပိုင်ရှင်က Router တစ်လုံးလျှင် HTTPS token တစ်ခု ထုတ်သည် (တစ်ကြိမ်သာ ပြပြီး hash ဖြင့် သိမ်းသည်)။ Scripts မှ Syslog AI HTTPS ပို့စခရစ် ကူးထည့်ပါ၊ သို့မဟုတ် Syslog AI ၏ တစ်ကြိမ်သာ ပြသသော ဘောင်မှ ကူးပါ။ ဘုတ်က /log စာကြောင်းအသစ်များကို စက္ကန့် ၁၅ ကြာတိုင်း mikromagic.app သို့ ထွက် ၄၄၃ မှ POST လုပ်သည်။ UDP syslog သည် ဤ webhook သို့ မရောက်နိုင်ပါ။ ဖြစ်ရပ်များကို ၁၄ ရက် သိမ်းသည်။",
    "Only the owner can mint or revoke. If the URL leaks, revoke that token and mint a new one. The router must be given the new shipper.":
      "ပိုင်ရှင်သာ ထုတ်နိုင်/ရုပ်သိမ်းနိုင်သည်။ URL ပေါက်ကြားပါက ထို token ကို ရုပ်သိမ်းပြီး အသစ်ထုတ်ပါ။ Router တွင် ပို့စခရစ်အသစ် ထည့်ရမည်။",
    "The shipper is a 15-second scheduler. It does not use /system logging action remote. Allow outbound HTTPS 443 to mikromagic.app.":
      "ပို့စခရစ်သည် စက္ကန့် ၁၅ ကြာ scheduler ဖြစ်သည်။ /system logging action remote မသုံးပါ။ mikromagic.app သို့ ထွက် HTTPS ၄၄၃ ကို ခွင့်ပြုပါ။",
    "confirm the HTTPS shipper scheduler is running, outbound 443 to mikromagic.app is allowed, and the token is bound to the site you have selected. If the secret was lost, revoke and mint again.":
      "HTTPS ပို့ scheduler လည်နေကြောင်း၊ mikromagic.app သို့ ထွက် ၄၄၃ ခွင့်ပြုထားကြောင်းနှင့် token ကို ရွေးထားသော site နှင့် ချိတ်ထားကြောင်း အတည်ပြုပါ။ လျှို့ဝှက်ချက် ပျောက်ပါက ရုပ်သိမ်းပြီး အသစ်ထုတ်ပါ။",
    "full access, sees and manages every account, no expiry, unlimited AI scans.":
      "အပြည့်အဝ ဝင်ရောက်ခွင့်၊ အကောင့်တိုင်းကို မြင်ရပြီး စီမံနိုင်သည်၊ သက်တမ်းမကုန်၊ AI စကင်န် အကန့်အသတ်မရှိ။",
    "full operational access including destructive commands; no expiry.":
      "အန္တရာယ်ရှိသော command များအပါအဝင် လုပ်ဆောင်ခွင့် အပြည့်၊ သက်တမ်း မကုန်ပါ။",
    "own data only. New accounts are active for 7 days, then flip to Expired automatically until a plan is purchased or the owner reactivates them.":
      "မိမိ၏ ဒေတာသာ။ အကောင့်သစ်များသည် ၇ ရက် အသုံးပြုနိုင်ပြီး ထို့နောက် အလိုအလျောက် သက်တမ်းကုန်သွားမည်။ အစီအစဉ် ဝယ်ယူမှ သို့မဟုတ် ပိုင်ရှင်မှ ပြန်ဖွင့်ပေးမှ ပြန်အသုံးပြုနိုင်သည်။",
    "never expires. Earns 15 Magic Coins for every Emerald or Sapphire purchase made by an account they created.":
      "သက်တမ်း မကုန်ပါ။ သူဖန်တီးပေးသော အကောင့်တစ်ခုမှ Emerald သို့မဟုတ် Sapphire ဝယ်ယူတိုင်း Magic Coins ၁၅ ခု ရရှိသည်။",
    "must renew on Services. Your RouterBoard hotspot keeps serving guests. Home, Profile and this manual stay open so you can renew; Live users, Portal, Routers and other cloud ops stay closed until you pay.":
      "Services တွင် သက်တမ်းတိုးရမည်။ RouterBoard hotspot သည် ဧည့်သည်များကို ဆက်လက် ဝန်ဆောင်မှုပေးသည်။ Home၊ Profile နှင့် ဤလက်စွဲကို သက်တမ်းတိုးရန် ဖွင့်ထားပြီး Live users၊ Portal၊ Routers နှင့် အခြား cloud ops များကို ပေးချေပြီးမှသာ ပြန်ဖွင့်သည်။",
    "Emerald and Sapphire include hotspot management with 1 router, 3 sites and 15 access points. Plus Tier Pass (+30,000 MMK / month on Emerald, or +300,000 MMK / year on Sapphire) adds +1 router, +7 sites and +20 access points. Sapphire is 104,500 MMK / year (73,150 MMK while the launch offer is active, through 24 Sep 2026). Amethyst is unlimited. Quotas are enforced on the server, so an over-limit add is rejected even on rapid retries.":
      "Emerald နှင့် Sapphire တွင် hotspot စီမံခန့်ခွဲမှု ပါဝင်ပြီး Router ၁ / site ၃ / AP ၁၅ ခု ပါသည်။ Plus Tier Pass (Emerald တွင် + ၃၀,၀၀၀ MMK / လ သို့မဟုတ် Sapphire တွင် + ၃၀၀,၀၀၀ MMK / နှစ်) ဖြင့် Router + ၁ / site + ၇ / AP + ၂၀ ရယူနိုင်သည်။ Sapphire သည် တစ်နှစ်လျှင် ၁၀၄,၅၀၀ MMK (launch offer ကာလအတွင်း ၇၃,၁၅၀ MMK၊ ၂၄ စက်တင်ဘာ ၂၀၂၆ အထိ) ဖြစ်သည်။ Amethyst မှာ အကန့်အသတ်မရှိပါ။",
    "30 manual scans per month on standard plans. Plus Tier Pass accounts get 50 per month; unused scans carry forward and the bank resets every 1 January. Fleet and Security Insights share the same quota.":
      "ပုံမှန်အစီအစဉ်များတွင် တစ်လလျှင် ကိုယ်တိုင်စကင်န် ၃၀ ကြိမ်။ Plus Tier Pass အကောင့်များတွင် တစ်လလျှင် ၅၀ ကြိမ် ရပြီး မသုံးရသေးသည်များ သယ်ယူနိုင်ကာ ဇန်နဝါရီ ၁ ရက်တွင် ပြန်စသည်။",
    "MikroTik Magic is installable. On iOS open it in Safari and tap Share → Add to Home Screen; on Android use Chrome menu → Install app. It then runs full-screen like a native app, with the same login. Profile has a shortcut card for this.":
      "MikroTik Magic ကို စက်တွင် ထည့်သွင်းနိုင်သည်။ iOS တွင် Safari ဖြင့်ဖွင့်၍ Share → Add to Home Screen ကို နှိပ်ပါ။ Android တွင် Chrome menu → Install app ကို သုံးပါ။ ထို့နောက် native အက်ပ်ကဲ့သို့ မျက်နှာပြင်အပြည့် အလုပ်လုပ်ပြီး login မှာ အတူတူပင် ဖြစ်သည်။ ကိုယ်ရေးအချက်အလက် စာမျက်နှာတွင် ဖြတ်လမ်း ကတ် ရှိသည်။",
    "RouterOS v7.1 or newer (the REST API does not exist before 7.1).":
      "RouterOS v7.1 သို့မဟုတ် အထက် (7.1 မတိုင်မီ REST API မရှိပါ)။",
    "A reachable public endpoint: static public IP, MikroTik Cloud DDNS, or a tunnel (Cloudflare Tunnel, Tailscale, ZeroTier).":
      "ပြင်ပမှ ရောက်နိုင်သော လိပ်စာ — ပုံသေ public IP၊ MikroTik Cloud DDNS သို့မဟုတ် tunnel (Cloudflare Tunnel၊ Tailscale၊ ZeroTier)။",
    "Admin access to the IP service, firewall, certificate and user menus.":
      "IP service၊ firewall၊ certificate နှင့် user menu များအတွက် အက်ဒမင် ခွင့်ပြုချက်။",
    "The IP addresses you want to allow — your MikroTik Magic egress IPs or your own admin IPs.":
      "ခွင့်ပြုလိုသော IP လိပ်စာများ — MikroTik Magic ၏ အထွက် IP များ သို့မဟုတ် သင့်ကိုယ်ပိုင် အက်ဒမင် IP များ။",
    "If you already have a static public IP or a tunnel hostname, skip DDNS and use that hostname instead.":
      "ပုံသေ public IP သို့မဟုတ် tunnel hostname ရှိပြီးသားဆိုပါက DDNS ကို ကျော်၍ ထို hostname ကိုသာ သုံးပါ။",
    "A real (non-self-signed) cert lets you keep 'Allow self-signed TLS' OFF for stronger security.":
      "တရားဝင် (self-signed မဟုတ်သော) လက်မှတ် သုံးပါက 'Allow self-signed TLS' ကို ပိတ်ထားနိုင်ပြီး ပိုမို လုံခြုံသည်။",
    "Disable plain www, api and api-ssl unless you actually use them — the REST endpoint is served by www-ssl.":
      "မလိုအပ်ပါက www၊ api နှင့် api-ssl တို့ကို ပိတ်ထားပါ — REST ကို www-ssl မှ ပေးသည်။",
    "Do not leave port 443 open to the whole internet for admin access. Restrict it to the Magic egress plus your own IPs.":
      "စီမံခန့်ခွဲမှုအတွက် port 443 ကို အင်တာနက်တစ်ခုလုံးသို့ ဖွင့်မထားပါနှင့်။ Magic ၏ အထွက် IP နှင့် သင့်ကိုယ်ပိုင် IP များကိုသာ ခွင့်ပြုပါ။",
    "Never reuse the built-in admin account. Use a strong, unique password — credentials are AES-256-GCM encrypted at rest, but least privilege still matters.":
      "built-in admin အကောင့်ကို ပြန်မသုံးပါနှင့်။ ခိုင်မာပြီး သီးသန့်ဖြစ်သော စကားဝှက် သုံးပါ — အချက်အလက်များကို AES-256-GCM ဖြင့် စာဝှက်သိမ်းသော်လည်း ခွင့်ပြုချက် အနည်းဆုံးပေးခြင်းက အရေးကြီးဆဲ ဖြစ်သည်။",
    "A green flashing dot on Overview means REST is reachable. Red means it was up but has been unreachable for under 5 minutes. Yellow means it has never connected yet.":
      "ခြုံငုံသုံးသပ်ချက်တွင် အစိမ်းရောင် မှိတ်တုတ်ပါက REST ရောက်နေသည်။ အနီရောင်မှာ ယခင်က ရခဲ့သော်လည်း ၅ မိနစ်အောက် ဆက်သွယ်၍ မရသေးခြင်း ဖြစ်သည်။ အဝါရောင်မှာ တစ်ခါမျှ မချိတ်ဆက်ရသေးခြင်း ဖြစ်သည်။",
    "If the site is behind CGNAT, a mobile SIM, or a locked-down ISP router, you do not need DDNS, TLS or firewall rules at all. Install the MikroTik Magic Connector agent on an always-on Windows or macOS machine inside the same LAN. The agent dials out over HTTPS, so nothing on the customer network is exposed to the internet. Everything else in the app — terminal, vouchers, portal deploy, telemetry — behaves exactly the same.":
      "နေရာသည် CGNAT၊ မိုဘိုင်း SIM သို့မဟုတ် ပိတ်ထားသော ISP router နောက်ကွယ်တွင် ရှိပါက DDNS၊ TLS သို့မဟုတ် firewall စည်းမျဉ်းများ လုံးဝ မလိုအပ်ပါ။ တူညီသော LAN အတွင်း အမြဲဖွင့်ထားသော Windows သို့မဟုတ် macOS ကွန်ပျူတာတွင် MikroTik Magic Connector agent ကို ထည့်သွင်းပါ။ Agent သည် HTTPS ဖြင့် အပြင်သို့ ချိတ်သဖြင့် ဖောက်သည်ကွန်ရက်မှ မည်သည့်အရာမျှ အင်တာနက်သို့ ဖွင့်ပြထားစရာ မလိုပါ။ terminal၊ voucher၊ Portal တင်ခြင်း၊ telemetry စသည့် ကျန်အင်္ဂါရပ်များမှာ အတူတူပင် ဖြစ်သည်။",
    "Use the site or shop name so you can tell bridges apart later. One connector can serve every router and AP on that LAN.":
      "နောင်တွင် ခွဲခြားလွယ်စေရန် နေရာ သို့မဟုတ် ဆိုင်အမည်ဖြင့် ပေးပါ။ Connector တစ်ခုသည် ထို LAN ရှိ Router နှင့် AP အားလုံးကို ဝန်ဆောင်ပေးနိုင်သည်။",
    "Shown once and valid for 30 minutes. The agent trades it for a permanent token on first contact; the plain code is never stored.":
      "တစ်ကြိမ်သာ ပြပြီး ၃၀ မိနစ် သက်တမ်းရှိသည်။ Agent သည် ပထမဆုံး ချိတ်ဆက်ချိန်တွင် ၎င်းကို အမြဲတမ်း token ဖြင့် လဲလှယ်သည်။ မူရင်းကုဒ်ကို သိမ်းမထားပါ။",
    "Windows installs a SYSTEM scheduled task; macOS loads a launchd daemon. Both start at boot, restart on crash and self-update from signed manifests.":
      "Windows တွင် SYSTEM scheduled task အဖြစ် ထည့်သွင်းပြီး macOS တွင် launchd daemon အဖြစ် လည်ပတ်သည်။ နှစ်မျိုးလုံး စက်ဖွင့်ချိန် အလိုအလျောက် စတင်၊ ရပ်သွားပါက ပြန်စပြီး လက်မှတ်ထိုးထားသော အပ်ဒိတ်များကို ကိုယ်တိုင် ရယူသည်။",
    "Heartbeat runs every 30 seconds. With Local Connector selected you enter the device's LAN IP (e.g. 192.168.88.1) and the agent reaches it locally. If the connector is offline or unpaired, calls fail fast with a clear error instead of silently falling back.":
      "Heartbeat ကို ၃၀ စက္ကန့်တစ်ကြိမ် ပို့သည်။ Local Connector ရွေးထားပါက စက်၏ LAN IP (ဥပမာ 192.168.88.1) ကို ထည့်ပြီး agent မှ ဒေသတွင်း ချိတ်ဆက်ပေးသည်။ Connector အော့ဖ်လိုင်း သို့မဟုတ် မတွဲရသေးပါက အမှားစာသား ရှင်းရှင်းလင်းလင်း ချက်ချင်း ပြသမည် ဖြစ်သည်။",
    "Outbound HTTPS 443 to mikromagic.app must be allowed on the site network — nothing inbound.":
      "နေရာကွန်ရက်တွင် mikromagic.app သို့ အထွက် HTTPS 443 ကို ခွင့်ပြုထားရမည် — အဝင် လုံးဝ မလိုပါ။",
    "Device credentials stay encrypted in the cloud; only the intended request payload crosses to the connector.":
      "စက်၏ အကောင့်အချက်အလက်များကို cloud တွင် စာဝှက်၍ သိမ်းထားပြီး လိုအပ်သော တောင်းဆိုမှု အချက်အလက်သာ connector သို့ ရောက်သည်။",
    "Routers and APs left on Cloud / Direct keep working exactly as before — the two methods can be mixed in one account.":
      "Cloud / Direct ဖြင့် ထားရှိသော Router နှင့် AP များ ယခင်အတိုင်း ဆက်လက် အလုပ်လုပ်သည် — အကောင့်တစ်ခုတည်းတွင် နည်းလမ်းနှစ်မျိုး ရောသုံးနိုင်သည်။",
    "Deleting or unpairing a connector leaves bound devices without transport until you change their connection method.":
      "Connector ကို ဖျက်လိုက်ခြင်း သို့မဟုတ် တွဲချိတ်မှု ဖြုတ်လိုက်ပါက ချိတ်ထားသော စက်များသည် ချိတ်ဆက်နည်း ပြောင်းပေးသည်အထိ ဆက်သွယ်၍ မရတော့ပါ။",
    "the router responded to the last poll.": "နောက်ဆုံး စစ်ဆေးမှုကို Router မှ တုံ့ပြန်ခဲ့သည်။",
    "it was online but has been unreachable for under 5 minutes. A toast appears on Overview.":
      "ယခင်က အွန်လိုင်း ဖြစ်ခဲ့သော်လည်း ၅ မိနစ်အောက် ဆက်သွယ်၍ မရပါ။ ခြုံငုံသုံးသပ်ချက်တွင် သတိပေးချက် ပေါ်လာမည်။",
    "no router registered, or it has never connected.":
      "Router မှတ်ပုံတင်ထားခြင်း မရှိပါ၊ သို့မဟုတ် တစ်ခါမျှ မချိတ်ဆက်ရသေးပါ။",
    "the ISP is blocking inbound 443, or a drop rule sits above the accept rule. Reorder the rules so the accept rule comes first.":
      "ISP မှ အဝင် 443 ကို ပိတ်ထားခြင်း၊ သို့မဟုတ် drop စည်းမျဉ်းသည် accept ၏ အပေါ်တွင် ရှိနေခြင်း ဖြစ်သည်။ accept ကို အပေါ်ဆုံးသို့ ရွှေ့ပါ။",
    "the user is missing the rest-api policy. Recreate the group with the policies shown above.":
      "ထို user တွင် rest-api ခွင့်ပြုချက် မပါပါ။ အထက်ပါ policy များဖြင့် group ကို ပြန်ဖန်တီးပါ။",
    "the certificate common-name does not match the DDNS host, or you are on a self-signed certificate. Tick 'Allow self-signed TLS' in the Add router form.":
      "လက်မှတ်၏ common-name သည် DDNS host နှင့် မကိုက်ညီခြင်း၊ သို့မဟုတ် self-signed လက်မှတ် သုံးနေခြင်း ဖြစ်သည်။ Add router ဖောင်တွင် 'Allow self-signed TLS' ကို အမှန်ခြစ်ပါ။",
    "the router's service address list does not include the Magic egress. Widen it, use the Local Connector, or use a tunnel.":
      "Router ၏ service address စာရင်းတွင် Magic ၏ အထွက် IP မပါဝင်ပါ။ စာရင်းကို ချဲ့ပါ၊ သို့မဟုတ် Local Connector သို့မဟုတ် tunnel ကို သုံးပါ။",
    "your plan allows one router, three sites and fifteen access points. Upgrade to Plus Tier Pass from the Pricing page to add more.":
      "သင့် plan သည် Router ၁ / site ၃ / AP ၁၅ ခု ခွင့်ပြုသည်။ ပိုမိုထည့်ရန် Pricing စာမျက်နှာမှ Plus Tier Pass သို့ တိုးမြှင့်ပါ။",
    "the agent machine is asleep or has lost outbound HTTPS. Wake it, then check the heartbeat on the Connectors page.":
      "Agent ကွန်ပျူတာ အိပ်နေခြင်း သို့မဟုတ် အထွက် HTTPS ပြတ်နေခြင်း ဖြစ်သည်။ ပြန်ဖွင့်ပြီး Connectors စာမျက်နှာတွင် heartbeat ကို စစ်ပါ။",
    "Run in an elevated PowerShell": "Administrator PowerShell တွင် ဤအမိန့်ကို ရိုက်ထည့်ပါ",
    "Run in Terminal": "Terminal တွင် ဤအမိန့်ကို ရိုက်ထည့်ပါ",
    Online: "အွန်လိုင်း",
    "Waiting for first heartbeat…": "ပထမဆုံး အချက်ပြမှုကို စောင့်ဆိုင်းနေသည်…",
    Never: "မရှိသေးပါ",
    "Loading devices…": "စက်ပစ္စည်းများ ဖွင့်နေသည်…",
    "No devices routed through this connector yet. Pick “Local Connector” on a router or access point controller to bind it here.":
      "ဤ connector မှတဆင့် ချိတ်ဆက်ထားသော စက်မရှိသေးပါ။ Router သို့မဟုတ် AP controller တွင် “Local Connector” ကို ရွေးပြီး ဤနေရာသို့ ချိတ်ဆက်ပါ။",
    "No connectors yet. Create one above, then run the pairing code on the on-site connector.":
      "Connector မရှိသေးပါ။ အပေါ်တွင် တစ်ခုဖန်တီးပြီး တွဲချိတ်ကုဒ်ကို နေရာတွင်းရှိ စက်ပေါ်တွင် အသုံးပြုပါ။",
    "No access point controllers yet.": "AP controller မရှိသေးပါ။",
    "Loading access points…": "AP များ ဖွင့်နေသည်…",
    "No access points reported.": "AP အချက်အလက် မရရှိပါ။",
    "No wireless clients connected.": "ချိတ်ဆက်ထားသော wireless သုံးစွဲသူ မရှိပါ။",
    "No SSIDs reported.": "SSID အချက်အလက် မရရှိပါ။",
    "No routers yet. Use Quick Setup to add your first one.":
      "Router မရှိသေးပါ။ Quick Setup ဖြင့် ပထမဆုံး Router ကို ထည့်ပါ။",
    "No routers yet. Add one with Magic Hub for Starlink or CGNAT, or Quick Setup if the WAN has a public IP.":
      "Router မရှိသေးပါ။ Starlink သို့မဟုတ် CGNAT အတွက် Magic Hub ဖြင့် ထည့်ပါ။ WAN တွင် အများသုံး IP ရှိလျှင် Quick Setup သုံးပါ။",
    "No routers yet. Add one with Magic Hub for Starlink or CGNAT.":
      "Router မရှိသေးပါ။ Starlink သို့မဟုတ် CGNAT အတွက် Magic Hub ဖြင့် ထည့်ပါ။",
    "Connecting…": "ချိတ်ဆက်နေသည်…",
    "No interfaces reported.": "အင်တာဖေ့စ် အချက်အလက် မရရှိပါ။",
    "CPU, temperature and live traffic from the selected RouterBoard.":
      "ရွေးထားသော RouterBoard မှ CPU၊ အပူချိန်နှင့် တိုက်ရိုက် ဒေတာစီးဆင်းမှု။",
    "Add a RouterBoard to see live CPU, traffic and interface stats.":
      "တိုက်ရိုက် CPU၊ ဒေတာစီးဆင်းမှုနှင့် interface အချက်အလက်ကြည့်ရန် RouterBoard ထည့်ပါ။",
    "Polling every {interval}s from the live board · rates between polls · last update {time}":
      "အွန်လိုင်းဘုတ်မှ {interval} စက္ကန့်တစ်ကြိမ် စစ်ဆေးသည် · နှုန်းထားမှာ စစ်ဆေးချက်နှစ်ခုကြား · နောက်ဆုံး အပ်ဒိတ် {time}",

    "Translation health for Chinese and Burmese, generated by the build-time audit that also gates CI.":
      "တရုတ်နှင့် မြန်မာဘာသာပြန်များ၏ အခြေအနေ — build အချိန် စစ်ဆေးမှုမှ ထုတ်ပေးပြီး CI တွင်လည်း အသုံးပြုသည်။",
    // Profile
    "Your account details, security and session.":
      "သင့်အကောင့်အချက်အလက်၊ လုံခြုံရေးနှင့် ဆက်သွယ်နေသော session အခြေအနေ။",
    "Choose the language used across MikroTik Magic. Buttons and feature names stay in English so the app stays consistent.":
      "MikroTik Magic တစ်ခုလုံးတွင် အသုံးပြုမည့် ဘာသာစကားကို ရွေးပါ။ ခလုတ်များနှင့် feature အမည်များကို အင်္ဂလိပ်လိုသာ ဆက်ထားပါသည်။",

    // Fleet / AI
    "Every router · live health · manual AI scans.":
      "router အားလုံး · တိုက်ရိုက်အခြေအနေ · ကိုယ်တိုင်စတင်သော AI စစ်ဆေးမှု။",
    "Health anomaly detected — run an AI scan to diagnose.":
      "အခြေအနေမမှန်မှု တွေ့ရှိသည် — အကြောင်းရင်းသိရန် AI scan ကို စတင်ပါ။",
    "No issues detected.": "ပြဿနာ မတွေ့ရှိပါ။",
    "No runs yet — start a scan when you want a diagnosis.":
      "စစ်ဆေးမှု မရှိသေးပါ — လိုအပ်သောအခါ ကိုယ်တိုင် စတင်ပါ။",

    // AI Insights
    "auto-check every 15 min": "၁၅ မိနစ်တစ်ကြိမ် အလိုအလျောက်စစ်ဆေးမှု",
    "scans left": "ကြိမ် ကျန်ရှိသည်",
    "The app checks your routers every 15 minutes and flags anomalies. Run an AI scan to get the RouterOS command that fixes each one.":
      "စနစ်သည် router များကို ၁၅ မိနစ်တစ်ကြိမ် စစ်ဆေးပြီး မမှန်မှုများကို အမှတ်အသားပြုပါသည်။ ပြင်ဆင်ရန် RouterOS command ရရှိရန် AI scan ကို ကိုယ်တိုင် စတင်ပါ။",
    "You have used all your AI scans for this month. Ask the app owner or developer to approve more — automatic anomaly flagging keeps running.":
      "ဤလအတွက် AI scan အားလုံး ကုန်သွားပါပြီ။ ထပ်မံခွင့်ပြုရန် app ပိုင်ရှင် သို့မဟုတ် developer ကို တောင်းဆိုပါ — အလိုအလျောက် အမှတ်အသားပြုမှုမှာ ဆက်လက်လုပ်ဆောင်နေပါသည်။",
    "Anomalies flagged by the automatic check. Run an AI scan to see the fix command for each one.":
      "အလိုအလျောက်စစ်ဆေးမှုက အမှတ်အသားပြုထားသော မမှန်မှုများ။ ပြင်ဆင်ရန် command များကို မြင်ရန် AI scan ကို စတင်ပါ။",
    "The automatic check pulls live CPU, memory, active sessions, blocked bindings and hotspot user counts from every router you own and flags anomalies. Run an AI scan for the RouterOS command to fix each one.":
      "အလိုအလျောက်စစ်ဆေးမှုသည် သင့် router အားလုံးမှ CPU၊ memory၊ session၊ ပိတ်ဆို့ထားသော binding နှင့် hotspot အသုံးပြုသူအရေအတွက်ကို တိုက်ရိုက်ယူပြီး မမှန်မှုများကို အမှတ်အသားပြုပါသည်။ ပြင်ဆင်ရန် RouterOS command အတွက် AI scan ကို စတင်ပါ။",

    // Sites map
    "Click the map to place": "နေရာချရန် မြေပုံပေါ်တွင် နှိပ်ပါ",
    "Green pins have at least one device online, red pins are offline, grey pins have no device linked. Click the map to set coordinates for a new site.":
      "အစိမ်းရောင် အမှတ်အသားများသည် စက်တစ်ခုအနည်းဆုံး online ရှိကြောင်း၊ အနီရောင်မှာ offline၊ မီးခိုးရောင်မှာ စက်မချိတ်ရသေးကြောင်း ဖော်ပြသည်။ site အသစ်အတွက် တည်နေရာသတ်မှတ်ရန် မြေပုံကို နှိပ်ပါ။",
    "Coordinates from map": "မြေပုံမှ တည်နေရာကိန်းဂဏန်းများ",
    "Optional: click the map above to attach coordinates.":
      "ရွေးချယ်နိုင်သည် — တည်နေရာထည့်ရန် အပေါ်ကမြေပုံကို နှိပ်ပါ။",
    "Not placed on the map yet": "မြေပုံပေါ်တွင် မသတ်မှတ်ရသေးပါ",
    "Platform · active router sites": "Platform · active router site များ",
    "Status-only monitor for Developers. Users, MikroMagic Agents, and Expired accounts never see this and their roles are not changed. Active = Magic Hub online or handshake/seen within 5 minutes.":
      "Developer များအတွက်သာ status စောင့်ကြည့်ခြင်း။ User၊ MikroMagic Agent၊ Expired အကောင့်များ မမြင်ရ၊ role များ မပြောင်းပါ။ Active = Magic Hub online သို့မဟုတ် ၅ မိနစ်အတွင်း handshake/seen။",
    "active site(s)": "အသက်ဝင်နေသော site(s)",
    "Could not load platform sites": "Platform site များ မတင်နိုင်ပါ",
    "No sites currently report an active router.": "Active router တင်ပြသော site မရှိသေးပါ။",
    active: "အသက်ဝင်",

    // Hotspot dashboard
    "Good morning": "မင်္ဂလာနံနက်ခင်းပါ",
    "Good afternoon": "မင်္ဂလာနေ့လည်ခင်းပါ",
    "Good evening": "မင်္ဂလာညနေခင်းပါ",
    "RouterBoard remote management · voucher income · live sessions.":
      "RouterBoard အဝေးမှ စီမံခန့်ခွဲမှု · voucher ဝင်ငွေ · live session များ။",
    Site: "နေရာ",
    "All sites": "Site အားလုံး",
    "MMK from hotspot voucher sales across your RouterBoard sites.":
      "RouterBoard site အားလုံးမှ hotspot voucher ရောင်းချမှုမှ MMK ဝင်ငွေ။",
    "Live on routers": "Router များတွင် live",
    "No uplink": "Uplink မရှိ",
    "Daily hotspot operator tasks": "နေ့စဉ် hotspot operator လုပ်ငန်းများ",
    "RouterBoard & voucher workspace": "RouterBoard နှင့် voucher workspace",

    // Shared states
    "Loading…": "ဖွင့်နေသည်…",

    // Routers / Access Points / Connectors
    "Four steps: name the connector, mint a one-time pairing code, install the agent on a machine inside the customer LAN, then confirm it is online and bind your devices.":
      "အဆင့်လေးဆင့် — connector အမည်ပေးခြင်း၊ တစ်ကြိမ်သုံး တွဲချိတ်ကုဒ်ထုတ်ခြင်း၊ ဖောက်သည်၏ LAN အတွင်းရှိ စက်တစ်လုံးတွင် agent ထည့်သွင်းခြင်း၊ ထို့နောက် online ဖြစ်မှုကို အတည်ပြု၍ စက်များချိတ်ဆက်ခြင်း။",
    "Use the site name so you can tell bridges apart later, for example “Main site bridge”.":
      "နောင်တွင် ခွဲခြားနိုင်ရန် site အမည်ကို အသုံးပြုပါ — ဥပမာ “Main site bridge”။",
    "The pairing code is shown once and expires in 30 minutes. The agent exchanges it for a permanent token on first contact.":
      "တွဲချိတ်ကုဒ်ကို တစ်ကြိမ်သာ ပြသပြီး ၃၀ မိနစ်အတွင်း သက်တမ်းကုန်ပါသည်။ Agent သည် ပထမဆုံးဆက်သွယ်ချိန်တွင် ၎င်းကို အမြဲတမ်း token ဖြင့် လဲလှယ်ပါသည်။",
    "Run the command on any always-on Windows or macOS machine in the same LAN as the routers and access points. It installs a background service that only makes outbound HTTPS calls — no port forwarding.":
      "Router များနှင့် access point များနှင့် တူညီသော LAN အတွင်းရှိ အမြဲဖွင့်ထားသည့် Windows သို့မဟုတ် macOS စက်တွင် ဤ command ကို run ပါ။ အထဲသို့ဝင်သော port မလိုဘဲ အပြင်သို့သာ HTTPS ခေါ်သည့် background service တစ်ခု ထည့်သွင်းပေးပါသည်။",
    "One-time pairing code (valid 30 minutes, shown once):":
      "တစ်ကြိမ်သုံး တွဲချိတ်ကုဒ် (၃၀ မိနစ် သက်တမ်း၊ တစ်ကြိမ်သာပြသည်) —",
    "The agent heartbeats every 30 seconds. Once it shows Online, open Routers or Access Points, pick “Local Connector” as the connection method and select this connector.":
      "Agent သည် ၃၀ စက္ကန့်တစ်ကြိမ် အချက်ပြပါသည်။ Online ပြသည်နှင့် Router သို့မဟုတ် AP စာမျက်နှာသို့သွား၍ ချိတ်ဆက်နည်းကို “Local Connector” ရွေးပြီး ဤ connector ကို ရွေးပါ။",
    "The agent heartbeats every 30 seconds. Once it shows Online, open Routers or Advanced → AP integrations, pick “Local Connector” as the connection method and select this connector.":
      "Agent သည် ၃၀ စက္ကန့်တစ်ကြိမ် အချက်ပြပါသည်။ Online ပြသည်နှင့် Routers သို့မဟုတ် Advanced → AP integrations ကိုဖွင့်ပြီး ချိတ်ဆက်နည်းအဖြစ် “Local Connector” ကိုရွေးကာ ဤ connector ကို ရွေးပါ။",
    "advanced controller links for verified platforms. They are not required when external APs run in bridge mode and are managed in their native app.":
      "စစ်ဆေးအတည်ပြုပြီးသော platform များအတွက် advanced controller ချိတ်ဆက်မှုများ ဖြစ်သည်။ ပြင်ပ AP များကို bridge mode ဖြင့်သုံးပြီး မူရင်း app မှ စီမံပါက ဤလုပ်ဆောင်ချက် မလိုအပ်ပါ။",
    "advanced controller links. Test each controller before use. They are not required when external APs run in bridge mode and are managed in their native app.":
      "Advanced controller ချိတ်ဆက်မှုများ ဖြစ်သည်။ မသုံးမီ controller တစ်ခုချင်းစီကို Test လုပ်ပါ။ ပြင်ပ AP များကို bridge mode ဖြင့်သုံးပြီး မူရင်း app မှ စီမံပါက ဤလုပ်ဆောင်ချက် မလိုအပ်ပါ။",
    "Advanced controller links for verified platforms. Connect only a controller you intend to manage from MikroTik Magic; native vendor apps remain the default for other access points.":
      "စစ်ဆေးအတည်ပြုပြီးသော platform များအတွက် advanced controller ချိတ်ဆက်မှုများ ဖြစ်သည်။ MikroTik Magic မှ အမှန်တကယ် စီမံလိုသော controller ကိုသာ ချိတ်ဆက်ပါ။ အခြား access point များအတွက် ထုတ်လုပ်သူ၏ မူရင်း app ကို ပုံမှန်အဖြစ် ဆက်သုံးပါ။",
    "Advanced controller links. Connect only a controller you intend to manage from MikroTik Magic; native vendor apps remain the default for other access points.":
      "Advanced controller ချိတ်ဆက်မှုများ ဖြစ်သည်။ MikroTik Magic မှ အမှန်တကယ် စီမံလိုသော controller ကိုသာ ချိတ်ဆက်ပါ။ အခြား access point များအတွက် ထုတ်လုပ်သူ၏ မူရင်း app ကို ပုံမှန်အဖြစ် ဆက်သုံးပါ။",
    "For most installations, configure each external AP in its native app as AP or bridge mode, turn off DHCP and NAT, and connect it to a Hotspot LAN port. MikroTik Magic manages the RouterOS gateway, DHCP, Hotspot, vouchers and captive portal.":
      "တပ်ဆင်မှုအများစုတွင် ပြင်ပ AP တစ်ခုချင်းစီကို မူရင်း app မှ AP သို့မဟုတ် bridge mode ထားပြီး DHCP နှင့် NAT ကိုပိတ်ကာ Hotspot LAN port သို့ ချိတ်ဆက်ပါ။ MikroTik Magic က RouterOS gateway၊ DHCP၊ Hotspot၊ voucher နှင့် captive portal ကို စီမံပါသည်။",
    "Ruijie/Reyee support here is for a reachable local EWEB gateway or AP master. Do not enter Ruijie Cloud account credentials.":
      "ဤနေရာရှိ Ruijie/Reyee အထောက်အပံ့သည် ချိတ်ဆက်ရောက်ရှိနိုင်သော local EWEB gateway သို့မဟုတ် AP master အတွက်သာ ဖြစ်သည်။ Ruijie Cloud account အချက်အလက်များ မထည့်ပါနှင့်။",
    "Run Test before using any write controls. MikroTik Magic exposes only the capabilities returned by that controller. Private-LAN controllers require a paired Local Connector.":
      "ပြောင်းလဲရေးသားသည့် control များ မသုံးမီ Test ကို run ပါ။ MikroTik Magic သည် controller က အမှန်တကယ် ပြန်ပေးသော လုပ်ဆောင်နိုင်စွမ်းများကိုသာ ပြပါသည်။ Private LAN အတွင်းရှိ controller များအတွက် တွဲချိတ်ထားသော Local Connector လိုအပ်ပါသည်။",
    "No controller integrations connected. This is normal when access points are managed in their native apps.":
      "Controller ချိတ်ဆက်မှု မရှိသေးပါ။ Access point များကို ၎င်းတို့၏ မူရင်း app မှ စီမံထားပါက ဤအခြေအနေသည် ပုံမှန်ဖြစ်သည်။",
    "Manage Wi-Fi across brands — Ubiquiti UniFi, MikroTik CAPsMAN, Ruijie/Reyee and other controllers — from the same console as your routers.":
      "Ubiquiti UniFi၊ MikroTik CAPsMAN၊ Ruijie/Reyee စသည့် အမျိုးအစားစုံ Wi-Fi ကို router များနှင့် တစ်နေရာတည်းမှ စီမံပါ။",
    "MikroTik access points are reached through a router you already added — no separate credentials needed. For other brands, use a read/write admin account on the controller. Controllers on a private LAN can be reached through a paired local Connector.":
      "MikroTik access point များကို ထည့်ပြီးသား router မှတဆင့် ချိတ်ဆက်သဖြင့် သီးသန့် အချက်အလက်မလိုပါ။ အခြားအမှတ်တံဆိပ်များအတွက် controller ၏ read/write admin အကောင့်ကို သုံးပါ။ LAN အတွင်းရှိ controller များကို local Connector မှတဆင့် ချိတ်ဆက်နိုင်ပါသည်။",
    "The agent pairs with a one-time code, heartbeats every 30 seconds and keeps itself up to date with Ed25519-signed, checksum-pinned updates. It only makes outbound HTTPS calls — no inbound ports.":
      "Agent သည် တစ်ကြိမ်သုံးကုဒ်ဖြင့် တွဲချိတ်ပြီး ၃၀ စက္ကန့်တစ်ကြိမ် အချက်ပြကာ Ed25519 လက်မှတ်ထိုးထားသော update များဖြင့် အလိုအလျောက် နောက်ဆုံးဗားရှင်းဖြစ်နေအောင် ထိန်းသိမ်းပါသည်။ အပြင်သို့သာ HTTPS ခေါ်ပြီး အထဲသို့ဝင်သော port မဖွင့်ပါ။",
    "Remove the cloud tunnel for {name}?": "{name} ၏ cloud ဥမင်လိုဏ်ခေါင်းကို ဖယ်ရှားမည်လား?",
    "Delete {name}?": "{name} ကို ဖျက်မည်လား?",
    "This device is already connected. Continue, then type the confirmation phrase. The live Magic Hub tunnel and its keys will be removed.":
      "ဤစက်သည် ချိတ်ဆက်ပြီးသားဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ လက်ရှိ Magic Hub ဥမင်လိုဏ်ခေါင်းနှင့် သော့များကို ဖယ်ရှားပါမည်။",
    "This device is already connected. Continue, then type the confirmation phrase. Stored credentials and tunnel keys will be removed.":
      "ဤစက်သည် ချိတ်ဆက်ပြီးသားဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ သိမ်းထားသော အထောက်အထားများနှင့် ဥမင်လိုဏ်ခေါင်း သော့များကို ဖယ်ရှားပါမည်။",
    "Type the English phrase below exactly to finish removing this device.":
      "ဤစက်ကို ဖယ်ရှားပြီးမြောက်ရန် အောက်ပါ အင်္ဂလိပ် စာသားကို တိကျစွာ ရိုက်ထည့်ပါ။",
    "Remove the voucher plans on {name}?": "{name} ပေါ်ရှိ voucher plan များကို ဖယ်ရှားမည်လား?",
    "This router already has voucher plans from the app. Continue, then type the confirmation phrase. Those profiles will be deleted on the device before the current plans are saved.":
      "ဤ router တွင် အက်ပ်က ထည့်ထားသော voucher plan များ ရှိပြီးသားဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ လက်ရှိ plan များကို မသိမ်းမီ စက်ပေါ်ရှိ ထို profile များကို ဖျက်ပါမည်။",
    "This router already has voucher plans from the app. Continue, then type the confirmation phrase. Only the profiles in the selected scope are deleted and re-saved; plans outside that scope stay on the device.":
      "ဤ router တွင် အက်ပ်က ထည့်ထားသော voucher plan များ ရှိပြီးသားဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ ရွေးထားသော scope အတွင်းရှိ profile များကိုသာ ဖျက်ပြီး ပြန်သိမ်းသည်၊ scope အပြင်ရှိ plan များ စက်ပေါ်တွင် ကျန်သည်။",
    "Delete the {name} plan?": "{name} plan ကို ဖျက်မည်လား?",
    "This plan is already in use. Continue, then type the confirmation phrase. Removing it from the catalog does not delete codes already on the router.":
      "ဤ plan ကို အသုံးပြုနေပြီးဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ စာရင်းမှ ဖယ်ရှားခြင်းသည် router ပေါ်ရှိ ကုဒ်များကို မဖျက်ပါ။",
    "Delete site {name}?": "{name} site ကို ဖျက်မည်လား?",
    "This site is already bound to {count} device(s). Continue, then type the confirmation phrase. Routers and devices will be unassigned.":
      "ဤ site တွင် စက် {count} လုံး ချိတ်ထားပြီးဖြစ်သည်။ Continue နှိပ်ပြီးနောက် အတည်ပြု စာသားကို ရိုက်ထည့်ပါ။ Router နှင့် စက်များကို ချိတ်ဖြုတ်ပါမည်။",
    "Type the English phrase below exactly to confirm.":
      "အတည်ပြုရန် အောက်ပါ အင်္ဂလိပ် စာသားကို တိကျစွာ ရိုက်ထည့်ပါ။",
    "Receive automatic notifications the exact moment a ticket is activated.":
      "လက်မှတ် အသုံးပြုသည်နှင့် တပြိုင်နက် အလိုအလျောက် အကြောင်းကြားချက် ရယူပါ။",
    "One device per code. Open a plan only when you need to change price or limits.":
      "ကုဒ် တစ်ခုကို စက် တစ်လုံးသာ သုံးနိုင်သည်။ စျေးနှုန်း သို့မဟုတ် ကန့်သတ်ချက် ပြင်မှသာ plan ကို ဖွင့်ပါ။",
  },
};
