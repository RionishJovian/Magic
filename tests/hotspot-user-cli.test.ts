import { describe, expect, it } from "vitest";
import { hotspotUserCreateBody, planProfileBody } from "@/lib/portal/plan-profile";
import {
  hotspotUserToCli,
  userProfilePatchToCli,
  userProfileToCli,
  userProfileUpsertCli,
} from "@/lib/mikrotik.server";

describe("hotspotUserToCli", () => {
  it("builds voucher user add with quoted fields, plan comment, and byte cap", () => {
    const body = hotspotUserCreateBody({
      name: "ABC12345",
      password: "ABC12345",
      profile: "mm-500mb",
      comment: "mm-plan:500mb",
      dataQuotaMb: 500,
    });
    const cli = hotspotUserToCli(body);
    expect(cli).toContain("/ip hotspot user add");
    expect(cli).toContain('name="ABC12345"');
    expect(cli).toContain('password="ABC12345"');
    expect(cli).toContain('comment="mm-plan:500mb"');
    expect(cli).toContain("limit-bytes-total=524288000");
    expect(cli).toContain("profile=mm-500mb");
  });
});

describe("userProfileToCli", () => {
  it("omits comment on hAP ax² CLI fallback", () => {
    const body = planProfileBody({
      plan_key: "500mb",
      duration_minutes: 1440,
      data_quota_mb: 500,
    });
    const cli = userProfileToCli(body);
    expect(cli).toContain("/ip hotspot user profile add");
    expect(cli).toContain("name=mm-500mb");
    expect(cli).not.toContain("comment=");
  });

  it("quotes on-login scripts", () => {
    const body = planProfileBody({
      plan_key: "500mb",
      data_quota_mb: 500,
    });
    const cli = userProfileToCli(body);
    expect(cli).toContain("on-login=");
    expect(cli).not.toContain("comment=");
  });

  it("quotes rate-limit values with slashes", () => {
    const body = planProfileBody({
      plan_key: "1d",
      duration_minutes: 1440,
      rate_limit: "5M/5M",
    });
    const cli = userProfileToCli(body);
    expect(cli).toContain('rate-limit="5M/5M"');
  });
});

describe("userProfileUpsertCli", () => {
  it("uses find-then-set-or-add by profile name", () => {
    const body = planProfileBody({
      plan_key: "1d",
      duration_minutes: 1440,
      rate_limit: "5M/5M",
    });
    const cli = userProfileUpsertCli(body);
    expect(cli).toContain(
      ':if ([:len [/ip hotspot user profile find where name="mm-1d"]] > 0) do={',
    );
    expect(cli).toContain("/ip hotspot user profile set [find where name=");
    expect(cli).toContain("/ip hotspot user profile add name=");
    expect(cli).toContain('rate-limit="5M/5M"');
  });
});

describe("userProfilePatchToCli", () => {
  it("builds profile set with quoted on-login for data plans", () => {
    const body = planProfileBody({
      plan_key: "500mb",
      data_quota_mb: 500,
      rate_limit: "5M/5M",
    });
    const { name: _n, ...patch } = body;
    const cli = userProfilePatchToCli("*1", patch);
    expect(cli).toContain("/ip hotspot user profile set .id=*1");
    expect(cli).toContain("on-login=");
    expect(cli).not.toContain("comment=");
  });
});
