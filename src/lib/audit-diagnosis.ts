/**
 * Shared AI diagnosis for a failed router audit entry.
 *
 * Kept in its own module (no server-fn wrapper, no Supabase import) so the
 * same code path used by the "AI scan error" button can be exercised directly
 * by automated tests.
 */

export type AuditDiagnosisInput = {
  action: string;
  attempted_name?: string | null;
  attempted_host?: string | null;
  error_code?: string | null;
  error_message: string;
};

export type AuditDiagnosis = {
  summary: string;
  steps: string[];
  command: string | null;
};

export const AUDIT_DIAGNOSIS_SYSTEM_PROMPT =
  'You diagnose MikroTik RouterOS REST API and device-quota failures for a hotspot management app. Reply as strict JSON: {"summary": string, "steps": string[], "command": string|null}. summary is one short sentence naming the likely cause. steps are 2-4 concrete fixes. command is a single RouterOS CLI line (it must start with "/") that fixes it on the router, or null when the fix is purely inside the web app (for example plan/quota limits).';

export function buildAuditDiagnosisPrompt(row: AuditDiagnosisInput): string {
  return [
    `Action: ${row.action}`,
    `Router: ${row.attempted_name ?? "?"} (${row.attempted_host ?? "?"})`,
    `Error code: ${row.error_code ?? "none"}`,
    `Error message: ${row.error_message}`,
  ].join("\n");
}

/** Calls the Lovable AI gateway and returns a normalized diagnosis. */
export async function diagnoseAuditError(
  row: AuditDiagnosisInput,
  apiKey: string,
): Promise<AuditDiagnosis> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: AUDIT_DIAGNOSIS_SYSTEM_PROMPT },
        { role: "user", content: buildAuditDiagnosisPrompt(row) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached — try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: { summary?: string; steps?: string[]; command?: string | null } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { summary: text };
  }
  const command =
    typeof parsed.command === "string" && parsed.command.trim() ? parsed.command.trim() : null;
  return {
    summary: parsed.summary ?? "No explanation returned.",
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.filter((s) => typeof s === "string").slice(0, 5)
      : [],
    command,
  };
}
