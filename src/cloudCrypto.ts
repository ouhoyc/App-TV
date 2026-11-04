import { derive } from "./crypto";
import { validateVault, type Vault } from "./model";
export interface SecretBox {
  version: 1;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}
export interface CloudPayload {
  version: 1;
  iv: string;
  ciphertext: string;
  recipients: Record<string, string>;
}
const encoder = new TextEncoder();
const secretAAD = encoder.encode("app-tv:private-key:v1");
function bytes64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function from64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function randomCode() {
  return bytes64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
// Separate authentication credential from the password protecting the private key.
// The original password and recovery code never cross the API boundary.
export async function loginCredential(email: string, password: string) {
  return hash("app-tv:auth:v1:" + email.trim().toLowerCase() + ":" + password);
}
export async function recoveryProof(code: string) {
  return hash("app-tv:recovery:v1:" + code.trim());
}
export async function sealSecret(
  data: Uint8Array,
  password: string,
): Promise<SecretBox> {
  const s = await derive(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: secretAAD },
    s.key,
    data as Uint8Array<ArrayBuffer>,
  );
  return {
    version: 1,
    salt: s.salt,
    iterations: s.iterations,
    iv: bytes64(iv),
    ciphertext: bytes64(new Uint8Array(encrypted)),
  };
}
export async function openSecret(box: SecretBox, password: string) {
  if (
    box?.version !== 1 ||
    box.iterations !== 600000 ||
    typeof box.ciphertext !== "string" ||
    box.ciphertext.length > 30000 ||
    typeof box.salt !== "string" ||
    typeof box.iv !== "string" ||
    from64(box.salt).length !== 16 ||
    from64(box.iv).length !== 12
  )
    throw new Error("Protection du compte non reconnue.");
  try {
    const s = await derive(password, box.salt, box.iterations);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: from64(box.iv), additionalData: secretAAD },
        s.key,
        from64(box.ciphertext),
      ),
    );
  } catch {
    throw new Error("Mot de passe ou clé de récupération incorrect.");
  }
}
export async function importIdentity(raw: Uint8Array) {
  return crypto.subtle.importKey(
    "pkcs8",
    raw as Uint8Array<ArrayBuffer>,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}
export async function createIdentity(password: string) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const code = randomCode();
  const [passwordBox, recoveryBox, proof] = await Promise.all([
    sealSecret(raw, password),
    sealSecret(raw, code),
    recoveryProof(code),
  ]);
  return {
    privateKey: await importIdentity(raw),
    jwk,
    passwordBox,
    recoveryBox,
    recoveryHash: await hash(proof),
    code,
  };
}
function aad(ownerId: string, revision: number) {
  return encoder.encode("app-tv:v1:" + ownerId + ":" + revision);
}
export async function encryptCloud(
  vault: Vault,
  ownerId: string,
  revision: number,
  keys: { user_id: string; public_jwk: JsonWebKey }[],
): Promise<CloudPayload> {
  validateVault(vault);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(ownerId, revision) },
    key,
    encoder.encode(JSON.stringify(vault)),
  );
  const recipients: Record<string, string> = {};
  await Promise.all(
    keys.map(async (recipient) => {
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        recipient.public_jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
      recipients[recipient.user_id] = bytes64(
        new Uint8Array(
          await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw),
        ),
      );
    }),
  );
  if (!recipients[ownerId])
    throw new Error(
      "Le propriétaire doit activer son compte avant le premier enregistrement.",
    );
  return {
    version: 1,
    iv: bytes64(iv),
    ciphertext: bytes64(new Uint8Array(ciphertext)),
    recipients,
  };
}
export async function decryptCloud(
  payload: CloudPayload,
  ownerId: string,
  revision: number,
  userId: string,
  privateKey: CryptoKey,
): Promise<Vault> {
  if (
    payload?.version !== 1 ||
    typeof payload.iv !== "string" ||
    from64(payload.iv).length !== 12 ||
    typeof payload.ciphertext !== "string" ||
    payload.ciphertext.length > 4000000 ||
    !payload.recipients?.[userId]
  )
    throw new Error("Cette clientèle ne peut pas être ouverte avec vos clés.");
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      from64(payload.recipients[userId]),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: from64(payload.iv),
        additionalData: aad(ownerId, revision),
      },
      key,
      from64(payload.ciphertext),
    );
    const vault: unknown = JSON.parse(new TextDecoder().decode(plain));
    validateVault(vault);
    return vault;
  } catch {
    throw new Error(
      "Déchiffrement impossible. Vos données n’ont pas été modifiées.",
    );
  }
}
