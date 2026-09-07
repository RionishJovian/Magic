/**
 * Recorded Lovable AI gateway responses for the "AI scan error" diagnosis path.
 *
 * These were captured from real gateway calls and are replayed through a mocked
 * `fetch` so the tests stay deterministic. Re-record by running the suite with
 * RUN_LIVE_AI=1 and copying the raw response content here.
 */

export type RecordedDiagnosis = {
  summary: string;
  steps: string[];
  command: string | null;
};

export const QUOTA_ROW = {
  action: "create",
  attempted_name: "Branch RB5009",
  attempted_host: "203.0.113.10",
  error_code: "DEVICE_QUOTA_EXCEEDED",
  error_message:
    'new row for relation "router_connections" violates device quota: plan allows 1 router, tenant already has 1 (DEVICE_QUOTA_EXCEEDED)',
};

export const CONNECTION_ROW = {
  action: "test",
  attempted_name: "Cafe CCR2116",
  attempted_host: "hotspot.example.ddns.net",
  error_code: "ECONNREFUSED",
  error_message:
    "Failed to reach RouterOS REST API at https://hotspot.example.ddns.net:443/rest/system/resource: connect ECONNREFUSED — connection refused by the router",
};

export const QUOTA_DIAGNOSIS: RecordedDiagnosis = {
  summary:
    "The tenant's plan allows only 1 router and that allowance is already used, so the insert was rejected by the device quota rule.",
  steps: [
    "Open the pricing page and upgrade the tenant to a Plus tier to raise the device allowance.",
    "Or delete an unused router from the Routers page before adding this one.",
    "Confirm the tenant's device_allowances row matches the purchased plan.",
  ],
  command: null,
};

export const CONNECTION_DIAGNOSIS: RecordedDiagnosis = {
  summary:
    "The router refused the TLS connection on port 443, which usually means the www-ssl service is disabled or firewalled.",
  steps: [
    "Enable the REST service on the router: the www-ssl service must be running with a valid certificate.",
    "Allow inbound TCP 443 from the app's address in the input firewall chain.",
    "Verify the DDNS hostname resolves to the router's current public address.",
    "Re-run the connection test from the Quick setup wizard.",
  ],
  command: "/ip service set www-ssl disabled=no certificate=hotspot-cert",
};

/** Builds a chat-completions style response body for a recorded diagnosis. */
export function gatewayResponse(diagnosis: RecordedDiagnosis): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(diagnosis) } }],
      usage: { prompt_tokens: 180, completion_tokens: 96, total_tokens: 276 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Picks the recorded reply that matches the prompt sent to the gateway. */
export function replayGateway(body: string): Response {
  return gatewayResponse(
    body.includes("DEVICE_QUOTA_EXCEEDED") ? QUOTA_DIAGNOSIS : CONNECTION_DIAGNOSIS,
  );
}
