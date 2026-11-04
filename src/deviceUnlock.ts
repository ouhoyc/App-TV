import { importIdentity } from "./cloudCrypto";

// PRF protects both the local private key and a password-derived login
// credential. Reconnection still uses normal server authentication and RLS.
interface DeviceBox {
  version: 1 | 2;
  email?: string;
  userId: string;
  credentialId: string;
  salt: string;
  iv: string;
  ciphertext: string;
}
const prefix = "app-tv:device-unlock:v1:";
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const aad = (box: DeviceBox) =>
  new TextEncoder().encode(
    `app-tv:device-unlock:v${box.version}:${location.origin}:${box.userId}:${box.credentialId}${box.version === 2 ? ":" + box.email : ""}`,
  );

export async function deviceUnlockAvailable() {
  try {
    return !!(
      window.isSecureContext &&
      window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}
function read(userId: string): DeviceBox | null {
  try {
    const box = JSON.parse(localStorage.getItem(prefix + userId) || "null");
    if (
      (box?.version === 1 ||
        (box?.version === 2 &&
          typeof box.email === "string" &&
          box.email.length <= 254)) &&
      box.userId === userId &&
      typeof box.credentialId === "string" &&
      box.credentialId.length < 2048 &&
      typeof box.ciphertext === "string" &&
      box.ciphertext.length < 10000 &&
      decode(box.salt).length === 32 &&
      decode(box.iv).length === 12
    )
      return box;
  } catch {
    /* Missing, blocked or damaged browser storage. */
  }
  return null;
}
export const hasDeviceUnlock = (userId: string) => !!read(userId);
export function rememberedDevices(): { id: string; email: string }[] {
  const devices: { id: string; email: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const box = read(key.slice(prefix.length));
      if (box?.version === 2 && box.email)
        devices.push({ id: box.userId, email: box.email });
    }
  } catch {
    /* Browser storage may be disabled. */
  }
  return devices;
}
export const hasDeviceLogin = (userId: string) => read(userId)?.version === 2;
export function forgetDeviceUnlock(userId: string) {
  localStorage.removeItem(prefix + userId);
}
const unsupported = () =>
  new Error(
    "Ce navigateur ou ce fournisseur de clés ne permet pas le déverrouillage chiffré. Sur iPhone, essayez Safari à jour et les clés d’accès Apple. Votre mot de passe reste utilisable.",
  );
function output(credential: PublicKeyCredential | null) {
  const first = credential?.getClientExtensionResults().prf?.results?.first;
  if (!first || first.byteLength !== 32) throw unsupported();
  return first;
}
async function deviceKey(box: DeviceBox) {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: decode(box.credentialId) }],
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: decode(box.salt) } } },
    },
  })) as PublicKeyCredential | null;
  if (
    !credential ||
    encode(new Uint8Array(credential.rawId)) !== box.credentialId
  )
    throw new Error("La clé d’accès ne correspond pas à ce compte.");
  return crypto.subtle.importKey("raw", output(credential), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export interface DeviceEnrollment {
  begin(): Promise<"complete" | "confirm">;
  finish(): Promise<void>;
  destroy(): void;
}
export function prepareDeviceEnrollment(
  user: { id: string; email: string },
  raw: Uint8Array<ArrayBuffer>,
  loginCredential: string,
): DeviceEnrollment {
  if (!window.PublicKeyCredential || !navigator.credentials?.create)
    throw unsupported();
  if (!/^[0-9a-f]{64}$/.test(loginCredential))
    throw new Error("Protection de connexion invalide.");
  const probe = prefix + "storage-check";
  localStorage.setItem(probe, "1");
  localStorage.removeItem(probe);
  const previous = read(user.id);
  const salt = previous ? decode(previous.salt) : random(32);
  const box: DeviceBox = {
    version: 2,
    email: user.email,
    userId: user.id,
    credentialId: previous?.credentialId || "",
    salt: encode(salt),
    iv: encode(random(12)),
    ciphertext: "",
  };
  const plain = new TextEncoder().encode(
    JSON.stringify({
      privateKey: encode(raw),
      credential: loginCredential,
      email: user.email,
    }),
  );
  let destroyed = false;
  const destroy = () => {
    plain.fill(0);
    destroyed = true;
  };
  const check = () => {
    if (destroyed)
      throw new Error(
        "L’activation a expiré. Recommencez avec votre mot de passe.",
      );
  };
  const persist = async (key: CryptoKey) => {
    check();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: decode(box.iv), additionalData: aad(box) },
      key,
      plain,
    );
    check();
    box.ciphertext = encode(new Uint8Array(ciphertext));
    localStorage.setItem(prefix + user.id, JSON.stringify(box));
    if (read(user.id)?.ciphertext !== box.ciphertext)
      throw new Error("L’appareil n’a pas conservé l’activation Face ID.");
    destroy();
  };
  const finish = async () => {
    check();
    if (!box.credentialId) throw new Error("Créez d’abord votre clé d’accès.");
    // Must be the first asynchronous operation in its own click handler.
    const key = await deviceKey(box);
    await persist(key);
  };
  return {
    destroy,
    finish,
    async begin() {
      check();
      if (previous) {
        await finish();
        return "complete";
      }
      // Password derivation is complete before this separate, explicit click.
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: random(32),
          rp: { name: "SCDR TV", id: location.hostname },
          user: {
            id: new TextEncoder().encode(user.id),
            name: user.email,
            displayName: user.email,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
          },
          attestation: "none",
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } },
        },
      })) as PublicKeyCredential | null;
      check();
      if (!credential) throw new Error("Création de la clé annulée.");
      box.credentialId = encode(new Uint8Array(credential.rawId));
      const first = credential.getClientExtensionResults().prf?.results?.first;
      if (!first || first.byteLength !== 32) return "confirm";
      const key = await crypto.subtle.importKey(
        "raw",
        first,
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      );
      await persist(key);
      return "complete";
    },
  };
}
export async function unlockDevice(userId: string) {
  const box = read(userId);
  if (!box)
    throw new Error("Activez Face ID depuis votre espace sur cet appareil.");
  const key = await deviceKey(box);
  let raw: Uint8Array<ArrayBuffer> | undefined;
  try {
    raw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(box.iv), additionalData: aad(box) },
        key,
        decode(box.ciphertext),
      ),
    );
    if (box.version === 1) return { privateKey: await importIdentity(raw) };
    const plain = JSON.parse(new TextDecoder().decode(raw));
    if (plain.email !== box.email || !/^[0-9a-f]{64}$/.test(plain.credential))
      throw new Error("Protection de connexion invalide.");
    const pkcs8 = decode(plain.privateKey);
    try {
      return {
        privateKey: await importIdentity(pkcs8),
        email: plain.email as string,
        credential: plain.credential as string,
      };
    } finally {
      pkcs8.fill(0);
    }
  } catch {
    throw new Error(
      "Cette protection locale ne peut plus être ouverte. Utilisez votre mot de passe puis réactivez Face ID.",
    );
  } finally {
    raw?.fill(0);
  }
}
export function deviceUnlockError(error: unknown) {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "AbortError"].includes(error.name)
  )
    return new Error(
      "Validation annulée ou expirée. Réessayez Face ID ou utilisez votre mot de passe.",
    );
  return error;
}
