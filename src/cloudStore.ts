import {
  decryptCloud,
  encryptCloud,
  type CloudPayload,
  type SecretBox,
} from "./cloudCrypto";
import { emptyVault, validateVault, type Vault, type Client } from "./model";
import type { ProviderContext } from "./providerWorkflow";
import { remindersFor } from "./reminders";
export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "reseller";
  active: boolean;
  created_at?: string;
}
export interface Snapshot {
  profile: Profile;
  profiles: Profile[];
  keys: { user_id: string; public_jwk: JsonWebKey }[];
  keyring: {
    password_envelope: SecretBox;
    recovery_envelope: SecretBox;
  } | null;
  vaults: {
    owner_id: string;
    payload: CloudPayload;
    revision: number;
    updated_at: string;
  }[];
  invitations?: {
    id: string;
    email: string;
    display_name: string;
    role: string;
    expires_at: string;
    consumed_at: string | null;
  }[];
}
export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  options: { notifyExpiry?: boolean } = {},
): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      "Connexion indisponible. Rien n’a été enregistré sur le serveur ; gardez cette page ouverte et réessayez.",
    );
  }
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw new Error("Réponse du serveur indisponible. Réessayez.");
  }
  if (!r.ok) {
    if (
      options.notifyExpiry !== false &&
      (r.status === 401 || r.status === 403)
    )
      window.dispatchEvent(new Event("app-tv-session-expired"));
    throw new HttpError(data.error || "Opération refusée.", r.status);
  }
  return data;
}
export class CloudStore {
  readonly key = crypto.randomUUID();
  private owners = new Map<string, Vault>();
  private revisions = new Map<string, number>();
  private sourceOwners = new Map<string, string>();
  private writing = false;
  readonly defaultOwner: string;
  readonly scope: string;
  private readonly adminIds: Set<string>;
  vault: Vault = emptyVault();
  constructor(
    readonly snapshot: Snapshot,
    readonly privateKey: CryptoKey,
    requestedScope: string,
  ) {
    const admins = snapshot.profiles
      .filter((p) => p.role === "admin")
      .sort(
        (a, b) =>
          (a.created_at || "").localeCompare(b.created_at || "") ||
          a.id.localeCompare(b.id),
      );
    this.adminIds = new Set(admins.map((p) => p.id));
    // Both administrators open the same workspace. Legacy per-admin scopes are
    // normalized too, including password and Face ID entry points.
    this.scope =
      snapshot.profile.role !== "admin"
        ? snapshot.profile.id
        : requestedScope === "all"
          ? "all"
          : snapshot.profiles.some(
                (p) => p.role === "reseller" && p.id === requestedScope,
              )
            ? requestedScope
            : "shared";
    this.defaultOwner = ["all", "shared"].includes(this.scope)
      ? admins[0]?.id || snapshot.profile.id
      : this.scope;
  }
  get ready() {
    return (
      !(this.snapshot.invitations || []).some((x) => x.role === "admin") &&
      this.adminKeys.length >= 2 &&
      this.snapshot.profiles
        .filter((x) => x.role === "admin" && x.active)
        .every((p) => this.snapshot.keys.some((k) => k.user_id === p.id))
    );
  }
  get adminKeys() {
    if (this.snapshot.profile.role === "reseller")
      return this.snapshot.keys.filter(
        (k) => k.user_id !== this.snapshot.profile.id,
      );
    const ids = this.snapshot.profiles
      .filter((p) => p.role === "admin" && p.active)
      .map((p) => p.id);
    return this.snapshot.keys.filter((k) => ids.includes(k.user_id));
  }
  async open() {
    const rows = this.snapshot.vaults.filter(
      (row) =>
        this.scope === "all" ||
        (this.scope === "shared"
          ? this.adminIds.has(row.owner_id)
          : row.owner_id === this.scope),
    );
    const opened = await Promise.all(
      rows.map(async (row) => {
        const v = await decryptCloud(
          row.payload,
          row.owner_id,
          row.revision,
          this.snapshot.profile.id,
          this.privateKey,
        );
        return { row, vault: v };
      }),
    );
    for (const { row, vault } of opened.sort((a, b) =>
      a.row.owner_id.localeCompare(b.row.owner_id),
    )) {
      this.owners.set(row.owner_id, vault);
      this.revisions.set(row.owner_id, row.revision);
    }
    const own = this.owners.get(this.defaultOwner) || emptyVault();
    const sharedProvider = this.adminIds.has(this.defaultOwner)
      ? [
          own,
          ...Array.from(this.owners)
            .filter(([id]) => this.adminIds.has(id))
            .map(([, v]) => v),
        ].find((v) => v.provider.key || v.provider.panels?.some((p) => p.key))
          ?.provider
      : undefined;
    this.vault = {
      ...emptyVault(),
      ...own,
      provider: sharedProvider || own.provider,
      clients: [],
    };
    for (const [owner, v] of this.owners)
      for (const c of v.clients) {
        if (this.sourceOwners.has(c.id))
          throw new Error(
            "Identifiant client dupliqué entre deux clientèles. Contactez un administrateur.",
          );
        this.sourceOwners.set(c.id, owner);
        this.vault.clients.push(c);
      }
    validateVault(this.vault);
    return this;
  }
  ownerLabel(clientId: string) {
    const id = this.sourceOwners.get(clientId) || this.defaultOwner;
    if (this.adminIds.has(id)) return "Notre clientèle";
    return (
      this.snapshot.profiles.find((x) => x.id === id)?.display_name ||
      "Ma clientèle"
    );
  }
  ownerFor(clientId: string) {
    return this.sourceOwners.get(clientId) || this.defaultOwner;
  }
  async sealProviderContext(client: Client, meta: ProviderContext) {
    const owner = this.ownerFor(client.id);
    const ids = new Set([owner, ...this.adminKeys.map((k) => k.user_id)]);
    const value = { ...emptyVault(), clients: [client], providerContext: meta };
    return encryptCloud(
      value,
      owner,
      1,
      this.snapshot.keys.filter((k) => ids.has(k.user_id)),
    );
  }
  get viewOwners() {
    return this.scope === "all"
      ? this.snapshot.profiles.map((p) => p.id)
      : this.scope === "shared"
        ? [...this.adminIds]
        : [this.scope];
  }
  async reminderSchedules() {
    return Promise.all(
      [...this.owners].map(async ([owner, v]) => ({
        owner_id: owner,
        items: await remindersFor(v.clients),
      })),
    );
  }
  async syncReminders() {
    return request("notifications", {
      action: "sync",
      schedules: await this.reminderSchedules(),
    });
  }
  async sealMedia(asset: unknown) {
    const owner = this.defaultOwner,
      ids = new Set([owner, ...this.adminKeys.map((k) => k.user_id)]);
    const value = { ...emptyVault(), mediaAsset: asset };
    return encryptCloud(
      value,
      owner,
      1,
      this.snapshot.keys.filter((k) => ids.has(k.user_id)),
    );
  }
  providerFor(clientId: string) {
    const owner = this.sourceOwners.get(clientId) || this.defaultOwner;
    if (this.adminIds.has(owner)) {
      // Shared connections for both admins, while preserving any legacy panel
      // references on old records until explicitly reassociated.
      const common = this.vault.provider;
      const previous = this.owners.get(owner)?.provider;
      const panels = [...(common.panels || []), ...(previous?.panels || [])];
      return panels.length
        ? {
            ...common,
            panels: panels.filter(
              (p, i) => panels.findIndex((x) => x.id === p.id) === i,
            ),
          }
        : common;
    }
    return (
      this.owners.get(this.sourceOwners.get(clientId) || this.defaultOwner)
        ?.provider || this.vault.provider
    );
  }
  async save(next: Vault) {
    validateVault(next);
    if (this.writing) throw new Error("Une sauvegarde est déjà en cours.");
    if (!this.ready)
      throw new Error(
        "Les deux associés doivent activer leur compte avant le premier enregistrement chiffré.",
      );
    this.writing = true;
    try {
      const grouped = new Map<string, Vault>();
      for (const [id, v] of this.owners) grouped.set(id, { ...v, clients: [] });
      if (!grouped.has(this.defaultOwner))
        grouped.set(this.defaultOwner, emptyVault());
      for (const c of next.clients) {
        const id = this.sourceOwners.get(c.id) || this.defaultOwner;
        const v = grouped.get(id) || emptyVault();
        v.clients.push(c);
        grouped.set(id, v);
      }
      const target = grouped.get(this.defaultOwner)!;
      target.provider = next.provider;
      target.lastBackup = next.lastBackup;
      const changes = [];
      for (const [owner, v] of grouped) {
        if (JSON.stringify(v) === JSON.stringify(this.owners.get(owner)))
          continue;
        const adminIds = this.adminKeys.map((k) => k.user_id);
        const keys = this.snapshot.keys.filter(
          (k) => k.user_id === owner || adminIds.includes(k.user_id),
        );
        const previous = this.revisions.get(owner) || 0;
        changes.push({
          owner_id: owner,
          expected_revision: previous,
          payload: await encryptCloud(v, owner, previous + 1, keys),
        });
      }
      if (changes.length) {
        const result = await request<{
          revisions: { owner_id: string; revision: number }[];
        }>("workspace", {
          action: "save",
          changes,
          reminders: await Promise.all(
            [...grouped].map(async ([owner, v]) => ({
              owner_id: owner,
              items: await remindersFor(v.clients),
            })),
          ),
        });
        for (const row of result.revisions)
          this.revisions.set(row.owner_id, row.revision);
      }
      this.owners = grouped;
      this.vault = next;
      this.sourceOwners.clear();
      for (const [owner, v] of grouped)
        for (const c of v.clients) this.sourceOwners.set(c.id, owner);
    } finally {
      this.writing = false;
    }
  }
}
