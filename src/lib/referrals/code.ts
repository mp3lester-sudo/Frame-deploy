import { randomBytes } from "crypto";

// No ambiguous chars (0/O, 1/I/l) -- these get typed/read back by hand when
// someone shares a code verbally or copies it off a screenshot.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 7;

export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
