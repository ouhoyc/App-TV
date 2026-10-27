import { newClient, newSubscription, validDate, type Client } from "./model";
export const csvFields = {
  name: "Nom",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  notes: "Notes client",
  provider: "Fournisseur",
  username: "Identifiant",
  password: "Mot de passe",
  server: "Serveur",
  m3u: "Lien M3U",
  mac: "Adresse MAC",
  start: "Début (AAAA-MM-JJ)",
  expires: "Expiration (AAAA-MM-JJ)",
  type: "Type (M3U / MAG / Autre)",
  sale: "Prix de vente",
  cost: "Prix d’achat",
};
export type CsvField = keyof typeof csvFields;
export function parseCsv(text: string): string[][] {
  if (text.length > 5_000_000)
    throw new Error("CSV trop volumineux (5 Mo maximum).");
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const separator =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let ended = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        ended = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || ended) throw new Error("Guillemets CSV invalides.");
      quoted = true;
    } else if (c === separator) {
      row.push(cell);
      cell = "";
      ended = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      ended = false;
    } else {
      if (ended && c.trim())
        throw new Error("CSV invalide après un champ entre guillemets.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Guillemets CSV non fermés.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2)
    throw new Error(
      "Le fichier doit contenir des en-têtes et au moins une ligne.",
    );
  if (rows.length > 10001) throw new Error("10 000 lignes maximum.");
  return rows;
}
export function mapCsv(
  rows: string[][],
  mapping: Partial<Record<CsvField, number>>,
) {
  const clients: Client[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, i) => {
    const get = (f: CsvField) =>
      mapping[f] === undefined ? "" : (row[mapping[f]!] || "").trim();
    const name = get("name");
    if (!name) {
      errors.push(`Ligne ${i + 2} : nom obligatoire.`);
      return;
    }
    if (row.length !== rows[0].length) {
      errors.push(`Ligne ${i + 2} : nombre de colonnes incorrect.`);
      return;
    }
    const c = newClient();
    Object.assign(c, {
      name,
      phone: get("phone"),
      whatsapp: get("whatsapp"),
      notes: get("notes"),
      subscriptions: [],
    });
    if (
      [
        "provider",
        "username",
        "password",
        "server",
        "m3u",
        "mac",
        "start",
        "expires",
        "type",
        "sale",
        "cost",
      ].some((f) => get(f as CsvField))
    ) {
      const s = newSubscription();
      for (const f of [
        "provider",
        "username",
        "password",
        "server",
        "m3u",
        "mac",
        "sale",
        "cost",
      ] as const)
        s[f] = get(f);
      s.start = get("start") || s.start;
      s.expires = get("expires");
      const type = get("type") || "M3U";
      if (
        !validDate(s.start) ||
        !validDate(s.expires) ||
        s.expires < s.start ||
        !["M3U", "MAG", "Autre"].includes(type)
      ) {
        errors.push(
          `Ligne ${i + 2} : type ou dates invalides, format AAAA-MM-JJ requis.`,
        );
        return;
      }
      s.type = type as typeof s.type;
      c.subscriptions = [s];
    }
    clients.push(c);
  });
  return { clients, errors };
}
