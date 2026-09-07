import { describe, expect, it } from "vitest";
import { stripCommentParamsFromCli } from "@/lib/mikrotik.server";

describe("stripCommentParamsFromCli", () => {
  it("removes quoted comment tokens", () => {
    const cli =
      '/interface wifi configuration add name=mm-hs-cfg-guest ssid="Mikro Magic" comment="mm-hotspot-ssid"';
    expect(stripCommentParamsFromCli(cli)).not.toContain("comment=");
    expect(stripCommentParamsFromCli(cli)).toContain('ssid="Mikro Magic"');
  });

  it("removes unquoted comment tokens", () => {
    const cli = "/ip hotspot user add name=ABC password=ABC profile=mm-500mb comment=mm-plan:500mb";
    expect(stripCommentParamsFromCli(cli)).toBe(
      "/ip hotspot user add name=ABC password=ABC profile=mm-500mb",
    );
  });

  it("leaves scripts without comment unchanged", () => {
    const cli = "/interface wifi cap set enabled=no";
    expect(stripCommentParamsFromCli(cli)).toBe(cli);
  });
});
