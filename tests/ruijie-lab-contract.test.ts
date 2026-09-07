import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fake = readFileSync("tools/ruijie-lab/fake-gateway.mjs", "utf8");
const compose = readFileSync("docker-compose.ruijie-lab.yml", "utf8");

describe("local Ruijie lab isolation", () => {
  it("uses a generic fake gateway and rejects production credential variables", () => {
    expect(fake).toContain("Generic local gateway double");
    expect(fake).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fake).toContain("RUIJIE_API_KEY");
    expect(fake).toContain("process.exit(78)");
    expect(fake).not.toContain("fetch(");
  });

  it("binds the fake service to loopback and isolates its network", () => {
    expect(compose).toContain('"127.0.0.1:18080:18080"');
    expect(compose).toContain("internal: true");
    expect(compose).toContain("cap_drop: [\"ALL\"]");
    expect(compose).toContain("read_only: true");
    expect(compose).not.toContain("SUPABASE_URL");
    expect(compose).not.toContain("VPS_ROUTER_API_URL");
  });

  it("models idempotent authorization and disconnect states", () => {
    for (const marker of ["/v1/authorize", "/v1/disconnect", "requests.has", "state: \"DISCONNECTED\""]) {
      expect(fake).toContain(marker);
    }
  });
});
