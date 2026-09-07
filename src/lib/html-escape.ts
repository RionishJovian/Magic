/** Escape text for HTML element / attribute context. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Operator colour fields used in generated CSS — reject anything that is not `#RRGGBB`. */
export function safeCssHex(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return HEX6.test(v) ? v : fallback;
}

/** Safe `url("…")` for inline CSS so a crafted path cannot break out of the function. */
export function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}
