-- RETIRED: this historical consolidation violated tenant isolation by moving
-- unrelated accounts and resources under one Primary account.
--
-- Do not replace this guard with account-specific repair SQL. Start with a
-- read-only inventory, select canonical account UUIDs explicitly, and create a
-- reviewed transactional migration for only the affected tenant.

do $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'RETIRED: global tenant consolidation is blocked; use an audited tenant-scoped repair';
end $$;
