import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("createAppUser write safety", () => {
  const source = readFileSync("src/lib/users.functions.ts", "utf8");
  const block = source.slice(
    source.indexOf("export const createAppUser"),
    source.indexOf("export const setAppUserRole"),
  );

  it("keeps the existing server-side owner/platform-admin authorization gate", () => {
    expect(block).toContain("const scope = await assertOwner(context);");
    expect(block).toContain("data.role === TENANT_PRIMARY_ROLE && !scope.isPlatformAdmin");
  });

  it("checks every application record write after Auth creation", () => {
    expect(block).toContain('createAccountError(profileError, username, "saving the profile")');
    expect(block).toContain(
      'createAccountError(roleDeleteError, username, "preparing the account role")',
    );
    expect(block).toContain(
      'createAccountError(roleInsertError, username, "saving the account role")',
    );
    expect(block).toContain(
      'createAccountError(ownerAccountError, username, "saving the username mapping")',
    );
  });

  it("rolls back only the newly created Auth user when setup fails", () => {
    expect(block).toContain("await supabaseAdmin.auth.admin.deleteUser(userId);");
    expect(block).toContain(
      "throw error instanceof Error ? error : createAccountError(error, username);",
    );
  });

  it("prevents duplicate and orphaned Auth accounts from becoming opaque failures", () => {
    expect(source).toContain('.from("owner_accounts")');
    expect(block).toContain('.from("profiles")');
    expect(block).toContain("auth.admin.listUsers({ page: 1, perPage: 1000 })");
    expect(block).toContain("An incomplete account");
    expect(source).toContain("already in use");
  });

  it("uses the canonical lowercase internal Auth email domain", () => {
    expect(block).toContain("const email = `${username.toLowerCase()}@mikromagic`;");
    expect(block).not.toContain("@MikroMagic");
  });
});
