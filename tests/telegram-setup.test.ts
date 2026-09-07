import { describe, it, expect } from "vitest";
import {
  maskChatId,
  callbackUrlFor,
  validatePublicBaseUrl,
  isTestRateLimited,
  redactSecrets,
  TELEGRAM_CALLBACK_PATH,
} from "@/lib/notify/setup";

describe("telegram setup: safe display", () => {
  it("masks the owner chat id to the last four digits", () => {
    expect(maskChatId("-1001234567890")).toBe("-••••7890");
    expect(maskChatId("123")).toBe("••••");
    expect(maskChatId("")).toBe("");
    expect(maskChatId("-1001234567890")).not.toContain("100123");
  });

  it("builds the callback URL from an origin", () => {
    expect(callbackUrlFor("https://mikromagic.app/")).toBe(
      `https://mikromagic.app${TELEGRAM_CALLBACK_PATH}`,
    );
  });
});

describe("telegram setup: canonical public URL", () => {
  it("reports missing configuration instead of guessing", () => {
    expect(validatePublicBaseUrl(undefined)).toMatchObject({ ok: false, reason: "missing" });
    expect(validatePublicBaseUrl("  ")).toMatchObject({ ok: false, reason: "missing" });
  });

  it("refuses preview, local and non-https origins", () => {
    expect(validatePublicBaseUrl("http://mikromagic.app").reason).toBe("not_https");
    expect(validatePublicBaseUrl("https://localhost:8080").reason).toBe("not_public");
    expect(validatePublicBaseUrl("https://id-preview--01520fe2.lovable.app").reason).toBe(
      "not_public",
    );
    expect(validatePublicBaseUrl("https://project--abc-dev.lovable.app").reason).toBe("not_public");
    expect(validatePublicBaseUrl("not a url").reason).toBe("malformed");
  });

  it("accepts a canonical production origin", () => {
    const v = validatePublicBaseUrl("https://mikromagic.app");
    expect(v.ok).toBe(true);
    expect(v.url).toBe(`https://mikromagic.app${TELEGRAM_CALLBACK_PATH}`);
  });
});

describe("telegram setup: test notification rate limit", () => {
  const at = (minsAgo: number) => ({
    created_at: new Date(Date.now() - minsAgo * 60_000).toISOString(),
  });

  it("allows the first few and blocks the fourth within an hour", () => {
    expect(isTestRateLimited([])).toBe(false);
    expect(isTestRateLimited([at(1), at(2)])).toBe(false);
    expect(isTestRateLimited([at(1), at(2), at(3)])).toBe(true);
  });

  it("ignores attempts outside the window", () => {
    expect(isTestRateLimited([at(70), at(80), at(90)])).toBe(false);
  });
});

describe("telegram setup: secret redaction", () => {
  const token = "123456789:AAExampleBotTokenValueThatIsLong";

  it("removes the bot token from URLs and error strings", () => {
    const out = redactSecrets(
      {
        url: `https://api.telegram.org/bot${token}/setWebhook`,
        last_error_message: `bad ${token}`,
      },
      [token],
    ) as Record<string, string>;
    expect(JSON.stringify(out)).not.toContain("AAExampleBotTokenValue");
    expect(out["url"]).toContain("[redacted]");
  });

  it("drops token/secret shaped keys entirely", () => {
    const out = redactSecrets({
      secret_token: "abc",
      api_key: "k",
      url: "https://x.test",
    }) as Record<string, unknown>;
    expect(out).not.toHaveProperty("secret_token");
    expect(out).not.toHaveProperty("api_key");
    expect(out["url"]).toBe("https://x.test");
  });

  it("redacts token-shaped values even when the secret is unknown", () => {
    expect(redactSecrets(`leak ${token} here`)).toBe("leak [redacted] here");
  });
});
