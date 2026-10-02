import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Passwort-Hashing mit scrypt (node:crypto, keine native Abhängigkeit).
 * Format: scrypt$N$r$p$salt$hash – die Parameter stehen im Hash, damit sie
 * später angehoben werden können, ohne bestehende Hashes zu brechen.
 */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const; // OWASP-Empfehlung für scrypt
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, params: ScryptOptions, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    // scrypt braucht 128 * N * r Bytes – das Standardlimit (32 MB) reicht dafür nicht.
    const maxmem = 256 * (params.N ?? PARAMS.N) * (params.r ?? PARAMS.r);
    scrypt(password.normalize("NFKC"), salt, length, { ...params, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, PARAMS, KEY_LENGTH);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;

  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }

  const expected = Buffer.from(hashB64, "base64url");
  try {
    const actual = await derive(password, Buffer.from(saltB64, "base64url"), params, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Muss ein Hash nach erfolgreichem Login mit aktuellen Parametern neu erzeugt werden? */
export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split("$");
  return (
    scheme !== "scrypt" ||
    Number(n) !== PARAMS.N ||
    Number(r) !== PARAMS.r ||
    Number(p) !== PARAMS.p
  );
}

/** Gut lesbares Zufallspasswort für Initial- und Reset-Passwörter. */
export function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // Verwerfen statt Modulo, damit alle Zeichen gleich wahrscheinlich bleiben.
    if (bytes[i] < 256 - (256 % alphabet.length)) out += alphabet[bytes[i] % alphabet.length];
  }
  return out.length === length ? out : generatePassword(length);
}
