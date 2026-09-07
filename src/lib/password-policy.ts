import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 6 characters and include at least one letter and one number.";

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

export function passwordSchema(maxLength = 120) {
  return z
    .string()
    .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
    .max(maxLength)
    .refine(isValidPassword, PASSWORD_POLICY_MESSAGE);
}
