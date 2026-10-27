export type Connection = "M3U" | "MAG" | "Autre";
export interface Renewal {
  at: string;
  previous: string;
  next: string;
}
export interface Subscription {
  id: string;
  provider: string;
  type: Connection;
  username: string;
  password: string;
  server: string;
  m3u: string;
  mac: string;
  start: string;
  expires: string;
  sale: string;
  cost: string;
  status: "enabled" | "disabled";
  notes: string;
  renewals: Renewal[];
}
export interface Client {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  subscriptions: Subscription[];
}
export interface Vault {
  version: 1;
  clients: Client[];
  provider: { url: string; key: string };
  lastBackup: string | null;
}
export const emptyVault = (): Vault => ({
  version: 1,
  clients: [],
  provider: { url: "", key: "" },
  lastBackup: null,
});
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
}
export function daysLeft(date: string, now = today()) {
  return Math.round(
    (Date.parse(date + "T12:00:00Z") - Date.parse(now + "T12:00:00Z")) /
      86400000,
  );
}
export function addMonths(start: string, months: number) {
  if (
    !validDate(start) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  )
    throw new Error("Durée ou date invalide.");
  const [y, m, d] = start.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last), 12))
    .toISOString()
    .slice(0, 10);
}
export function state(s: Subscription) {
  if (s.status === "disabled") return "Suspendu";
  const n = daysLeft(s.expires);
  return n < 0 ? "Expiré" : n <= 7 ? "À renouveler" : "Actif";
}
export function newSubscription(): Subscription {
  return {
    id: crypto.randomUUID(),
    provider: "",
    type: "M3U",
    username: "",
    password: "",
    server: "",
    m3u: "",
    mac: "",
    start: today(),
    expires: "",
    sale: "",
    cost: "",
    status: "enabled",
    notes: "",
    renewals: [],
  };
}
export function newClient(): Client {
  return {
    id: crypto.randomUUID(),
    name: "",
    phone: "",
    whatsapp: "",
    notes: "",
    archived: false,
    createdAt: new Date().toISOString(),
    subscriptions: [newSubscription()],
  };
}
export function renew(s: Subscription, next: string): Subscription {
  if (!validDate(next) || next <= s.expires || next < today())
    throw new Error("Choisissez une date future, après l’expiration actuelle.");
  return {
    ...s,
    expires: next,
    renewals: [
      ...s.renewals,
      { at: new Date().toISOString(), previous: s.expires, next },
    ],
  };
}
export function searchClients(clients: Client[], query: string) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const q = normalize(query.trim());
  return clients.filter((c) =>
    normalize(
      [
        c.name,
        c.phone,
        c.whatsapp,
        ...c.subscriptions.flatMap((s) => [s.provider, s.username]),
      ].join(" "),
    ).includes(q),
  );
}
export const phoneIdentity = (s: string) => s.replace(/[^\d+]/g, "");
export function duplicate(a: Client, b: Client) {
  return (
    a.id === b.id ||
    !!(
      phoneIdentity(a.phone) &&
      phoneIdentity(a.phone) === phoneIdentity(b.phone)
    ) ||
    a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase()
  );
}
export function mergeClients(
  existing: Client[],
  incoming: Client[],
  replace: boolean,
) {
  const result = [...existing];
  for (const c of incoming) {
    const matches = result
      .map((item, i) => (duplicate(item, c) ? i : -1))
      .filter((i) => i >= 0);
    if (matches.length > 1)
      throw new Error(
        "Plusieurs fiches correspondent au même client. Corrigez les doublons avant de restaurer.",
      );
    const i = matches[0];
    if (i === undefined) result.push(c);
    else if (replace) result[i] = c;
  }
  return result;
}
export function validateVault(value: unknown): asserts value is Vault {
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const strings = (v: Record<string, unknown>, fields: string[]) =>
    fields.every(
      (f) => typeof v[f] === "string" && (v[f] as string).length <= 100000,
    );
  if (
    !obj(value) ||
    value.version !== 1 ||
    !Array.isArray(value.clients) ||
    value.clients.length > 10000 ||
    !obj(value.provider) ||
    !strings(value.provider, ["url", "key"]) ||
    !(value.lastBackup === null || typeof value.lastBackup === "string")
  )
    throw new Error("Format du coffre non reconnu.");
  const ids = new Set<string>();
  for (const c of value.clients) {
    if (
      !obj(c) ||
      !strings(c, ["id", "name", "phone", "whatsapp", "notes", "createdAt"]) ||
      !(c.name as string).trim() ||
      typeof c.archived !== "boolean" ||
      !Array.isArray(c.subscriptions) ||
      c.subscriptions.length > 100 ||
      ids.has(c.id as string)
    )
      throw new Error("Fiche client invalide ou identifiant dupliqué.");
    ids.add(c.id as string);
    for (const s of c.subscriptions) {
      if (
        !obj(s) ||
        !strings(s, [
          "id",
          "provider",
          "type",
          "username",
          "password",
          "server",
          "m3u",
          "mac",
          "start",
          "expires",
          "sale",
          "cost",
          "status",
          "notes",
        ]) ||
        !["M3U", "MAG", "Autre"].includes(s.type as string) ||
        !["enabled", "disabled"].includes(s.status as string) ||
        !validDate(s.start as string) ||
        !validDate(s.expires as string) ||
        (s.expires as string) < (s.start as string) ||
        !Array.isArray(s.renewals) ||
        ids.has(s.id as string)
      )
        throw new Error("Abonnement ou dates invalides.");
      ids.add(s.id as string);
      for (const r of s.renewals)
        if (
          !obj(r) ||
          !strings(r, ["at", "previous", "next"]) ||
          !validDate(r.previous as string) ||
          !validDate(r.next as string)
        )
          throw new Error("Historique invalide.");
    }
  }
}
