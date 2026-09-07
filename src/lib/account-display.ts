/** Preferred label for the signed-in account in chrome and greetings. */
export function accountDisplayName(input: {
  profile?: { display_name?: string | null } | null;
  email?: string | null;
}): string {
  const fromProfile = input.profile?.display_name?.trim();
  if (fromProfile) return fromProfile;
  const email = input.email?.trim();
  if (email) return email.split("@")[0] ?? email;
  return "Account";
}
