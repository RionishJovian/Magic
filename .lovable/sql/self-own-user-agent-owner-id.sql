-- RETIRED: this historical account repair is incompatible with the current
-- direct-parent and tenant-isolation model.
--
-- Use a read-only inventory first. Any repair must identify affected accounts
-- by approved UUID, limit every mutation to one audited tenant, and run as a
-- reviewed transactional migration with row-count guards.

do $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'RETIRED: unsafe historical account repair is blocked; use an audited tenant-scoped migration';
end $$;
