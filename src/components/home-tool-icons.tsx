/** Networking-themed glyphs for Home dashboard tool cards. */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const HomeToolIcons = {
  router: (
    <svg {...svgProps}>
      <rect x="3" y="12" width="18" height="8" rx="1.8" />
      <path d="M7 12V8.5M12 12V7M17 12V8.5" />
      <path d="M6.5 7.2l.8-1.6M12 5.6l0-1.8M17.5 7.2l-.8-1.6" />
      <path d="M6.2 16h.01M8.6 16h.01M11 16h.01M13.4 16h.01M15.8 16h.01M18.2 16h.01" />
    </svg>
  ),
  live: (
    <svg {...svgProps}>
      <circle cx="12" cy="15.2" r="2.2" />
      <path d="M8.2 12.2a5.2 5.2 0 0 1 7.6 0" />
      <path d="M5.6 9.6a9 9 0 0 1 12.8 0" />
      <path d="M3.4 7.2a12.4 12.4 0 0 1 17.2 0" />
    </svg>
  ),
  vouchers: (
    <svg {...svgProps}>
      <path d="M3.5 8.2a1.7 1.7 0 0 1 1.7-1.7h13.6a1.7 1.7 0 0 1 1.7 1.7v2a1.6 1.6 0 0 0 0 3.2v2a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-2a1.6 1.6 0 0 0 0-3.2v-2z" />
      <path d="M14.2 6.5v11" strokeDasharray="2 2.2" />
      <path d="M7.4 10.2a2.4 2.4 0 0 1 3.2 0" />
      <path d="M6.4 8.8a4.1 4.1 0 0 1 5.2 0" />
      <circle cx="9" cy="12.6" r=".7" fill="currentColor" stroke="none" />
    </svg>
  ),
  portal: (
    <svg {...svgProps}>
      <rect x="4" y="4" width="16" height="16" rx="2.4" />
      <path d="M4 9h16" />
      <path d="M9.2 13.2a3.6 3.6 0 0 1 5.6 0" />
      <path d="M7.6 11.4a6.2 6.2 0 0 1 8.8 0" />
      <circle cx="12" cy="16" r=".85" fill="currentColor" stroke="none" />
    </svg>
  ),
  scripts: (
    <svg {...svgProps}>
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <path d="M7 13v-2.4M12 13V9.2M17 13v-2.4" />
      <path d="M8.2 7.2 6 9.2l2.2 2M15.8 7.2 18 9.2l-2.2 2" />
    </svg>
  ),
  users: (
    <svg {...svgProps}>
      <circle cx="8.5" cy="9.2" r="2.6" />
      <path d="M3.6 18.2a5.2 5.2 0 0 1 9.8 0" />
      <circle cx="16.4" cy="9.6" r="2.1" />
      <path d="M13.8 18.2a4.4 4.4 0 0 1 6.6-3.4" />
    </svg>
  ),
  lock: (
    <svg {...svgProps} strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  wand: (
    <svg {...svgProps}>
      <rect x="5" y="13.2" width="14" height="6.4" rx="1.5" />
      <path d="M8 13.2V10.6M12 13.2V9.4M16 13.2V10.6" />
      <path d="M8.4 16.4h.01M11.2 16.4h.01M14 16.4h.01M16.8 16.4h.01" />
      <path d="M16.6 5.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6z" />
    </svg>
  ),
  fleet: (
    <svg {...svgProps}>
      <circle cx="12" cy="6.4" r="2.2" />
      <circle cx="5.4" cy="17.4" r="2" />
      <circle cx="12" cy="17.8" r="2" />
      <circle cx="18.6" cy="17.4" r="2" />
      <path d="M10.4 7.8 6.8 15.6M12 8.6v7.2M13.6 7.8l3.6 7.8" />
    </svg>
  ),
  sites: (
    <svg {...svgProps}>
      <path d="M12 21s-6.2-5.4-6.2-10.2a6.2 6.2 0 1 1 12.4 0C18.2 15.6 12 21 12 21z" />
      <path d="M9.4 10.2a3.4 3.4 0 0 1 5.2 0" />
      <circle cx="12" cy="12.2" r=".8" fill="currentColor" stroke="none" />
    </svg>
  ),
  unifi: (
    <svg {...svgProps}>
      <ellipse cx="12" cy="16.4" rx="7.2" ry="2.3" />
      <circle cx="12" cy="15.6" r="1.3" fill="currentColor" stroke="none" />
      <path d="M8.2 11.4a5.4 5.4 0 0 1 7.6 0" />
      <path d="M5.6 8.6a9.2 9.2 0 0 1 12.8 0" />
    </svg>
  ),
  revenue: (
    <svg {...svgProps}>
      <path d="M4.2 18.6h15.6" />
      <path d="M7.2 18.6V12M12 18.6V8.2M16.8 18.6v-6.2" />
      <path d="M9.4 7.2a3.6 3.6 0 0 1 5.2 0" />
      <circle cx="12" cy="5.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  ),
  terminal: (
    <svg {...svgProps}>
      <rect x="3" y="4.2" width="18" height="15.6" rx="2.2" />
      <path d="M7 9.2 10 12l-3 2.8M12.4 15h4.4" />
    </svg>
  ),
  syslog: (
    <svg {...svgProps}>
      <rect x="4" y="4" width="16" height="16" rx="2.2" />
      <path d="M7.4 9h9.2M7.4 12.2h6.8M7.4 15.4h4.6" />
      <path d="M16.4 14.6a2.4 2.4 0 0 1 2.2 0" />
      <circle cx="17.5" cy="16.8" r=".55" fill="currentColor" stroke="none" />
    </svg>
  ),
  profile: (
    <svg {...svgProps}>
      <circle cx="12" cy="8.4" r="3.2" />
      <path d="M5.2 19.4a7 7 0 0 1 13.6 0" />
    </svg>
  ),
  usage: (
    <svg {...svgProps}>
      <path d="M5.2 16.4a8.2 8.2 0 1 1 13.6 0" />
      <path d="M12 13.2 8.8 9.4" />
      <circle cx="12" cy="13.4" r="1.1" fill="currentColor" stroke="none" />
      <path d="M4.4 18.4h15.2" />
    </svg>
  ),
  incidents: (
    <svg {...svgProps}>
      <circle cx="6.2" cy="12" r="2.3" />
      <circle cx="17.8" cy="12" r="2.3" />
      <path d="M8.6 12h2.1M15.4 12h-1.4" />
      <path d="M12.6 8.8 11.4 15.2" />
      <path d="M19.6 6.4 21 5" />
      <path d="M20.4 8.2h.01" />
    </svg>
  ),
  connectors: (
    <svg {...svgProps}>
      <path d="M8 4.4h8v7.2H8z" />
      <path d="M9.4 11.6v3.2h5.2v-3.2" />
      <path d="M9.2 7h5.6M9.2 9h5.6" />
      <path d="M12 14.8v4.8" />
    </svg>
  ),
  payments: (
    <svg {...svgProps}>
      <rect x="3.2" y="6.2" width="17.6" height="11.6" rx="2" />
      <path d="M3.2 10h17.6" />
      <path d="M7 14.6h3.4" />
    </svg>
  ),
};
