import {
  createHash, createHmac, randomBytes, scrypt, timingSafeEqual,
} from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_LENGTH = 32;

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < 14) return "Password minimal 14 karakter.";
  if (password.length > 128) return "Password maksimal 128 karakter.";
  const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(pattern => pattern.test(password)).length;
  return categories < 3 ? "Gunakan sedikitnya tiga jenis karakter: huruf kecil, huruf besar, angka, atau simbol." : null;
}

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  const policyError = passwordPolicyError(password);
  if (policyError) throw new Error(policyError);
  const key = await scryptKey(password, salt);
  return ["scrypt", "v1", String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P), salt.toString("base64url"), key.toString("base64url")].join("$");
}

const dummyHashPromise = hashPassword("Ruwang-Control-Dummy-Password-2026!", Buffer.from("control-dummy-salt"));

export async function verifyPassword(password: string, encodedHash: string | null): Promise<boolean> {
  const candidateHash = encodedHash ?? await dummyHashPromise;
  const parts = candidateHash.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1" ||
      Number(parts[2]) !== SCRYPT_N || Number(parts[3]) !== SCRYPT_R || Number(parts[4]) !== SCRYPT_P) {
    await scryptKey(password.slice(0, 128), Buffer.from("control-dummy-salt"));
    return false;
  }
  try {
    const salt = Buffer.from(parts[5]!, "base64url");
    const expected = Buffer.from(parts[6]!, "base64url");
    if (salt.length < 16 || expected.length !== SCRYPT_LENGTH || password.length > 128) return false;
    const actual = await scryptKey(password, salt);
    return timingSafeEqual(actual, expected) && encodedHash !== null;
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function privacyHash(value: string, base64Key: string): string {
  return createHmac("sha256", Buffer.from(base64Key, "base64")).update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
