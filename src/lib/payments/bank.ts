// Bank-transfer payment information boxes.
//
// Pure helpers only: masking, ordering and the amount the guest owes. Nothing
// here reads the database, so the display rules are directly testable.

export interface BankAccount {
  id: string;
  slot: number;
  holder_name: string;
  bank_name: string;
  account_number: string;
  enabled: boolean;
  sort: number;
}

/** What a guest needs in order to make the transfer. */
export interface BankAccountPublic {
  slot: number;
  holder_name: string;
  bank_name: string;
  account_number: string;
}

/** What anyone who is not the owner (staff lists, notifications, audit) sees. */
export interface BankAccountMasked {
  slot: number;
  holder_name: string;
  bank_name: string;
  account_number_masked: string;
}

/**
 * Keeps only the last 4 characters. Short numbers are fully masked rather
 * than partially leaked.
 */
export function maskAccountNumber(value: string): string {
  const clean = (value ?? "").replace(/\s+/g, "");
  if (!clean) return "";
  if (clean.length <= 4) return "•".repeat(clean.length);
  return `${"•".repeat(Math.min(clean.length - 4, 8))}${clean.slice(-4)}`;
}

function complete(a: BankAccount): boolean {
  return Boolean(a.holder_name.trim() && a.bank_name.trim() && a.account_number.trim());
}

/** Enabled + fully filled in, in display order (sort, then slot). */
export function displayableBanks(accounts: BankAccount[]): BankAccount[] {
  return accounts
    .filter((a) => a.enabled && complete(a))
    .sort((a, b) => a.sort - b.sort || a.slot - b.slot);
}

export function toPublicBanks(accounts: BankAccount[]): BankAccountPublic[] {
  return displayableBanks(accounts).map((a) => ({
    slot: a.slot,
    holder_name: a.holder_name,
    bank_name: a.bank_name,
    account_number: a.account_number,
  }));
}

export function toMaskedBanks(accounts: BankAccount[]): BankAccountMasked[] {
  return displayableBanks(accounts).map((a) => ({
    slot: a.slot,
    holder_name: a.holder_name,
    bank_name: a.bank_name,
    account_number_masked: maskAccountNumber(a.account_number),
  }));
}

/**
 * The amount due always comes from the stored plan price, never from the
 * client. Returns minor units plus a display string.
 */
export function amountDue(plan: { price_mmk: number | null }, currency = "MMK") {
  const minor = Math.max(0, Math.round(plan.price_mmk ?? 0));
  return { amount_minor: minor, currency, display: `${minor.toLocaleString("en-US")} ${currency}` };
}
