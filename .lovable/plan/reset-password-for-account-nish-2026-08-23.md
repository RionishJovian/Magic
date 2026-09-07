# Reset password for account "nish"

## Goal

Set the password of the app account with username `nish` to `112211@`.

## Current state (verified)

- Two accounts match "nish":
  - `nish` — id `4c5f9e3b-4e7d-4746-9b16-dcdfc4ca42f9`, role **primary** (the owner account) ← target
  - `nish@dev` — id `7987488d-f0e1-4e0a-9514-fe3aa00d9e16`, role **client** ← left untouched
- Passwords live in the auth system, not in app tables, so this cannot be done with SQL — it needs the backend admin API.
- The required backend credentials are already available in the sandbox, so no new secrets are needed.
- The app enforces a minimum password length of 6 — `112211@` qualifies.

## Steps

1. Call the backend admin API (`PUT /auth/v1/admin/users/{id}`) with the service credential to set the password for user `4c5f9e3b-...` to `112211@`.
2. Verify by performing a real sign-in with username `nish` + new password against the auth token endpoint and confirming a session is issued.

## Notes

- No code changes, no migrations, no publish required — this is a direct account operation.
- All existing sessions for the `nish` account will be invalidated; sign in again with the new password.
- The new password was shared in chat; if that concerns you, change it again afterwards from Profile → Change password.
