import { request } from "./cloudStore";
import { normalizeProviderKey } from "./provider";
import { validDate, type Client, type Subscription } from "./model";
import type { CloudPayload } from "./cloudCrypto";
import { invoice } from "./commerce";

export interface ProviderDevice {
  type: "m3u" | "mag";
  username: string;
  password: string;
  mac: string;
  userId: string;
  expires: string | null;
  enabled: boolean | null;
  server: string;
  m3u: string;
  country: string;
  notes: string;
}
export interface ProviderReceipt {
  operationId?: string;
  action: "create" | "renew" | "status";
  confirmed: true;
  device: ProviderDevice | null;
  before: ProviderDevice | null;
  months: number | null;
  enabled: boolean | null;
  needsSync: boolean;
  completedAt: string;
}
export interface ProviderOperation {
  id: string;
  owner_id: string;
  client_id: string;
  action: "create" | "renew" | "status";
  state:
    "pending" | "succeeded" | "uncertain" | "failed" | "applied" | "resolved";
  context_box: CloudPayload;
  result_box: CloudPayload | null;
  error_code: string | null;
  created_at: string;
}
export interface ProviderContext {
  sale?: string;
  cost?: string;
  player?: "Tivimate" | "Smarters Player" | "IBO Player" | "";
  panelId: string;
  subscriptionId: string;
  mode: "inspect" | "create" | "renew" | "status";
  type: "m3u" | "mag";
  months: number;
  pack: string;
}
export function subscriptionIdentity(s: Subscription) {
  if (s.type === "MAG") return { type: "mag" as const, mac: s.mac };
  if (s.type !== "M3U")
    throw new Error("Seuls M3U et MAG sont pris en charge par ce panel.");
  let username = s.username,
    password = s.password;
  if ((!username || !password) && s.m3u) {
    try {
      const u = new URL(s.m3u);
      username ||= u.searchParams.get("username") || "";
      password ||= u.searchParams.get("password") || "";
    } catch {}
  }
  if (!username || !password)
    throw new Error(
      "Renseignez l’identifiant et le mot de passe ou le lien M3U complet dans la fiche.",
    );
  return { type: "m3u" as const, username, password };
}
export function providerRequest<T>(
  action: string,
  key: string,
  details: Record<string, unknown> = {},
) {
  return request<T>("provider", {
    ...details,
    action,
    key: normalizeProviderKey(key),
  });
}
export async function openProviderReceipt(
  box: CloudPayload,
  operationId: string,
  userId: string,
  privateKey: CryptoKey,
): Promise<ProviderReceipt> {
  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if (box?.version !== 1 || !box.recipients?.[userId])
    throw new Error("Ce reçu ne peut pas être ouvert avec votre compte.");
  const raw = await crypto.subtle.decrypt(
    "RSA-OAEP",
    privateKey,
    bytes(box.recipients[userId]),
  );
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes(box.iv),
      additionalData: new TextEncoder().encode("scdr-provider:" + operationId),
    },
    aes,
    bytes(box.ciphertext),
  );
  const value = JSON.parse(new TextDecoder().decode(plain));
  if (
    value.confirmed !== true ||
    !["create", "renew", "status"].includes(value.action)
  )
    throw new Error("Reçu fournisseur non reconnu.");
  return { ...value, operationId };
}
export function applyProviderDevice(
  client: Client,
  subscription: Subscription,
  device: ProviderDevice | null,
  panelId: string,
  dates: { start: string; expires: string },
  receipt?: ProviderReceipt,
): Client {
  if (
    receipt?.operationId &&
    subscription.sales?.some((v) => v.id === receipt.operationId)
  )
    return client;
  if (
    !validDate(dates.start) ||
    !validDate(dates.expires) ||
    dates.expires < dates.start
  )
    throw new Error(
      "Vérifiez les dates de début et d’expiration avant d’enregistrer la fiche.",
    );
  let updated: Subscription = {
    ...subscription,
    panelId,
    provider: subscription.provider || "Strong 8K",
    start: dates.start,
    expires: dates.expires,
    ...(device
      ? {
          username: device.username || subscription.username,
          password: device.password || subscription.password,
          mac: device.mac || subscription.mac,
          server: device.server || subscription.server,
          m3u: device.m3u || subscription.m3u,
          status:
            device.enabled === null
              ? subscription.status
              : device.enabled
                ? "enabled"
                : "disabled",
          providerUserId: device.userId || subscription.providerUserId || "",
          providerEnabled: device.enabled,
          syncedAt: new Date().toISOString(),
        }
      : {}),
    ...(receipt?.action === "status" &&
    receipt.enabled !== null &&
    device?.enabled === undefined
      ? {
          status: receipt.enabled
            ? ("enabled" as const)
            : ("disabled" as const),
        }
      : {}),
  };
  if (receipt?.action === "renew" && updated.expires !== subscription.expires)
    updated.renewals = [
      ...subscription.renewals,
      {
        at: receipt.completedAt,
        previous: subscription.expires,
        next: updated.expires,
      },
    ];
  if (receipt && (receipt.action === "create" || receipt.action === "renew")) {
    const months = receipt.months || 12;
    updated = {
      ...updated,
      plan:
        months === 12
          ? "year1"
          : months === 6
            ? "month6"
            : months === 3
              ? "month3"
              : "month1",
      paid: false,
      expiresAt: undefined,
      trialStartedAt: undefined,
    };
    if (receipt.action === "renew" && !updated.sales?.length)
      updated = {
        ...updated,
        sales: invoice(
          subscription,
          "legacy:" + subscription.id,
          subscription.start + "T12:00:00Z",
        ).sales,
      };
    updated = invoice(
      updated,
      receipt.operationId || crypto.randomUUID(),
      receipt.completedAt,
    );
  }
  if (updated.type === "M3U" && (!updated.username || !updated.password))
    throw new Error(
      "Les identifiants n’ont pas été communiqués. Relevez-les dans le panel avant d’enregistrer, sans relancer la création.",
    );
  return {
    ...client,
    subscriptions: client.subscriptions.some((s) => s.id === updated.id)
      ? client.subscriptions.map((s) => (s.id === updated.id ? updated : s))
      : [...client.subscriptions, updated],
  };
}
