/**
 * Long-lived Cache-Control for fingerprinted Vite build assets.
 * Matches Nitro's default for `/${assetsDir}/**` so Cloudflare / custom
 * server entries keep the same CDN behaviour.
 */
export const STATIC_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Vite's default hashed-asset directory (`build.assetsDir`). */
const ASSETS_PREFIX = "/assets/";

/**
 * True for hashed client bundles under `/assets/…` (js/css/fonts/images).
 * Skips HTML documents, API routes, and unhashed `public/` files.
 */
export function isFingerprintedAssetPath(pathname: string): boolean {
  if (!pathname.startsWith(ASSETS_PREFIX)) return false;
  const rest = pathname.slice(ASSETS_PREFIX.length);
  if (!rest || rest.endsWith("/")) return false;
  // Avoid treating the directory itself or HTML fallbacks as immutable.
  if (rest.endsWith(".html") || rest.endsWith(".htm")) return false;
  return true;
}

/**
 * Attach a 1-year immutable Cache-Control when the response is a successful
 * fingerprinted asset and no Cache-Control is already present.
 */
export function withStaticAssetCacheControl(request: Request, response: Response): Response {
  if (response.status < 200 || response.status >= 400) return response;
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return response;
  }
  if (!isFingerprintedAssetPath(pathname)) return response;
  if (response.headers.has("cache-control")) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", STATIC_ASSET_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
