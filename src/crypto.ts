import { validateVault, type Vault } from "./model";
export interface Envelope {
  format: "prive-vault";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}
const ITERATIONS = 600000;
const aad = new TextEncoder().encode("prive-vault:v1");
function b64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
function unb64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function parseEnvelope(raw: string): Envelope {
  if (raw.length > 20_000_000)
    throw new Error("Fichier trop volumineux (20 Mo maximum).");
  const e = JSON.parse(raw);
  if (
    e?.format !== "prive-vault" ||
    e.version !== 1 ||
    e.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(e.iterations) ||
    e.iterations < 600000 ||
    e.iterations > 2000000 ||
    typeof e.salt !== "string" ||
    typeof e.iv !== "string" ||
    typeof e.ciphertext !== "string" ||
    unb64(e.salt).length !== 16 ||
    unb64(e.iv).length !== 12 ||
    unb64(e.ciphertext).length < 16
  )
    throw new Error("Sauvegarde invalide ou version non prise en charge.");
  return e;
}
export async function derive(
  password: string,
  salt = b64(crypto.getRandomValues(new Uint8Array(16))),
  iterations = ITERATIONS,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt, iterations };
}
export type Session = Awaited<ReturnType<typeof derive>>;
export async function encrypt(
  vault: Vault,
  session: Session,
): Promise<Envelope> {
  validateVault(vault);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    session.key,
    new TextEncoder().encode(JSON.stringify(vault)),
  );
  return {
    format: "prive-vault",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: session.iterations,
    salt: session.salt,
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(ciphertext)),
  };
}
export async function decrypt(e: Envelope, password: string) {
  const checked = parseEnvelope(JSON.stringify(e));
  const session = await derive(password, checked.salt, checked.iterations);
  let data: ArrayBuffer;
  try {
    data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(checked.iv), additionalData: aad },
      session.key,
      unb64(checked.ciphertext),
    );
  } catch {
    throw new Error(
      "Mot de passe incorrect ou fichier endommagé. Aucune donnée n’a été modifiée.",
    );
  }
  const vault: unknown = JSON.parse(new TextDecoder().decode(data));
  validateVault(vault);
  return { vault, session };
}
export async function exportBackup(vault: Vault, password: string) {
  if (password.length < 12)
    throw new Error("Utilisez au moins 12 caractères pour la sauvegarde.");
  return JSON.stringify(await encrypt(vault, await derive(password)));
}
