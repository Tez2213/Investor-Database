import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSWORD_LENGTH = 8;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key)
    );
  });
}

/** Hash format: scrypt$<salt base64>$<key base64>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64");
  const actual = await derive(password, Buffer.from(saltText, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used when the email doesn't exist so failed logins take the same time either way.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(KEY_LENGTH).toString("base64");
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > 200) return "Password is too long";
  return null;
}
