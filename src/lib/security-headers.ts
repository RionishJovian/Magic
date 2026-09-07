/**
 * Browser isolation headers for every HTML/API response.
 * Local HTTP (Vite on :8080) must not receive HSTS or upgrade-insecure-requests.
 */

const BASE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // RootShell boot scripts and JSON-LD still require inline-script support;
  // inline event-handler attributes are disabled separately below.
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function securityHeadersFor(request: Request): Record<string, string> {
  let https = false;
  let local = false;
  try {
    const url = new URL(request.url);
    https = url.protocol === "https:";
    local = isLocalHostname(url.hostname);
  } catch {
    /* keep defaults */
  }

  const connect = local
    ? "connect-src 'self' https: wss: ws: http://localhost:* http://127.0.0.1:*"
    : "connect-src 'self' https: wss:";

  const csp = local
    ? `${BASE_CSP}; ${connect}`
    : `${BASE_CSP}; ${connect}; upgrade-insecure-requests`;

  const headers: Record<string, string> = {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "cross-origin-opener-policy": "same-origin",
    "x-permitted-cross-domain-policies": "none",
  };

  if (https && !local) {
    headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

/** Private app chrome — never index, never feed to AI trainers. */
export function isPrivateHtmlPath(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/dev" ||
    pathname.startsWith("/dev/")
  );
}

/** X-Robots-Tag for HTML. Marketing pages stay searchable; training bots are opted out. */
export function htmlRobotsTagFor(pathname: string): string {
  if (isPrivateHtmlPath(pathname)) {
    return "noindex, nofollow, noai, noimageai";
  }
  return "noai, noimageai";
}

export function withSecurityHeaders(request: Request, response: Response): Response {
  const extra = securityHeadersFor(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && !headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  if (contentType.includes("text/html") && !headers.has("x-robots-tag")) {
    let pathname = "/";
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      /* keep default */
    }
    headers.set("x-robots-tag", htmlRobotsTagFor(pathname));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
