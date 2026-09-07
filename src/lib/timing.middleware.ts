// Server-side timing middleware for every createServerFn call.
// Logs one structured line per call:
//   {"tag":"serverfn","fn":"/_serverFn/...","ms":123,"ok":true,"userId":"..."}
// Slow calls (>= SLOW_MS) are logged at console.warn so they surface in
// server-function-logs when filtering by "serverfn.slow".
import { createMiddleware } from "@tanstack/react-start";

const SLOW_MS = 750;

export const timingMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const started = performance.now();
  let url = "";
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    url = new URL(getRequest().url).pathname;
  } catch {
    // outside request scope — ignore
  }
  let ok = true;
  let errMsg: string | undefined;
  try {
    const result = await next();
    return result;
  } catch (e) {
    ok = false;
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const ms = Math.round(performance.now() - started);
    const line = JSON.stringify({
      tag: ms >= SLOW_MS ? "serverfn.slow" : "serverfn",
      fn: url,
      ms,
      ok,
      ...(errMsg ? { error: errMsg.slice(0, 200) } : {}),
    });
    if (!ok) console.error(line);
    else if (ms >= SLOW_MS) console.warn(line);
    else console.log(line);
  }
});

/** Wrap a server-route handler body with the same timing/log format. */
export async function withRouteTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let ok = true;
  let errMsg: string | undefined;
  try {
    return await fn();
  } catch (e) {
    ok = false;
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const ms = Math.round(performance.now() - started);
    const line = JSON.stringify({
      tag: ms >= SLOW_MS ? "route.slow" : "route",
      fn: name,
      ms,
      ok,
      ...(errMsg ? { error: errMsg.slice(0, 200) } : {}),
    });
    if (!ok) console.error(line);
    else if (ms >= SLOW_MS) console.warn(line);
    else console.log(line);
  }
}
