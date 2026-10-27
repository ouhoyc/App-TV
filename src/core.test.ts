import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  decrypt,
  derive,
  encrypt,
  exportBackup,
  parseEnvelope,
} from "./crypto";
import {
  addMonths,
  duplicate,
  emptyVault,
  mergeClients,
  newClient,
  renew,
  searchClients,
  state,
  validDate,
  validateVault,
  today,
} from "./model";
import { loadEnvelope, saveEnvelope } from "./storage";
import { mapCsv, parseCsv } from "./csv";

function fixture() {
  const v = emptyVault();
  const c = newClient();
  c.name = "Émilie Martin";
  c.phone = "+33612345678";
  const s = c.subscriptions[0];
  s.provider = "Mon fournisseur";
  s.username = "emilie-42";
  s.password = "secret-sensitive";
  s.start = "2025-01-01";
  s.expires = "2027-12-31";
  v.clients = [c];
  return v;
}
describe("Coffre et sauvegardes chiffrées", () => {
  it("ne conserve aucune donnée client en clair et utilise une clé non exportable", async () => {
    const session = await derive("mot-de-passe-de-test");
    const v = fixture();
    const e = await encrypt(v, session);
    expect(session.key.extractable).toBe(false);
    expect(JSON.stringify(e)).not.toContain("Émilie");
    expect(JSON.stringify(e)).not.toContain("secret-sensitive");
    const opened = await decrypt(e, "mot-de-passe-de-test");
    expect(opened.vault).toEqual(v);
  });
  it("refuse un mot de passe incorrect", async () => {
    const e = await encrypt(fixture(), await derive("mot-de-passe-de-test"));
    await expect(decrypt(e, "incorrect")).rejects.toThrow(
      "Mot de passe incorrect",
    );
  });
  it("détecte une altération du contenu authentifié", async () => {
    const e = await encrypt(fixture(), await derive("mot-de-passe-de-test"));
    const chars = e.ciphertext.split("");
    chars[40] = chars[40] === "A" ? "B" : "A";
    await expect(
      decrypt({ ...e, ciphertext: chars.join("") }, "mot-de-passe-de-test"),
    ).rejects.toThrow();
  });
  it("utilise un IV différent à chaque enregistrement", async () => {
    const s = await derive("mot-de-passe-de-test");
    const a = await encrypt(fixture(), s),
      b = await encrypt(fixture(), s);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("restaure tous les champs avec un mot de passe indépendant", async () => {
    const v = fixture();
    v.provider = { url: "https://example.com", key: "private-api" };
    const raw = await exportBackup(v, "sauvegarde-distincte");
    expect(raw).not.toContain("private-api");
    expect(
      (await decrypt(parseEnvelope(raw), "sauvegarde-distincte")).vault,
    ).toEqual(v);
  });
  it("refuse un mot de passe de sauvegarde trop court", async () => {
    await expect(exportBackup(fixture(), "court")).rejects.toThrow(
      "12 caractères",
    );
  });
  it("refuse les versions et paramètres de dérivation non pris en charge", () => {
    expect(() => parseEnvelope('{"version":2}')).toThrow();
    expect(() =>
      parseEnvelope(
        JSON.stringify({
          format: "prive-vault",
          version: 1,
          kdf: "PBKDF2-SHA256",
          iterations: 999999999,
        }),
      ),
    ).toThrow();
  });
});
describe("Fiches, recherche et renouvellements", () => {
  it("calcule les durées en mois sans dépasser le dernier jour du mois", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-10-27", 12)).toBe("2027-10-27");
  });
  it("valide un client avec plusieurs abonnements", () => {
    const v = fixture();
    v.clients[0].subscriptions.push({
      ...v.clients[0].subscriptions[0],
      id: crypto.randomUUID(),
    });
    expect(() => validateVault(v)).not.toThrow();
  });
  it("refuse une date impossible ou inversée", () => {
    expect(validDate("2026-02-30")).toBe(false);
    const v = fixture();
    v.clients[0].subscriptions[0].expires = "2024-12-01";
    expect(() => validateVault(v)).toThrow();
  });
  it("recherche sans accents par nom, téléphone, fournisseur et identifiant", () => {
    const { clients } = fixture();
    for (const q of ["emilie", "612345", "fournisseur", "emilie-42"])
      expect(searchClients(clients, q)).toHaveLength(1);
    expect(searchClients(clients, "absent")).toHaveLength(0);
  });
  it("masque les mots de passe du moteur de recherche", () => {
    expect(searchClients(fixture().clients, "secret-sensitive")).toHaveLength(
      0,
    );
  });
  it("garde un historique immuable des renouvellements", () => {
    const old = fixture().clients[0].subscriptions[0];
    const next = renew(old, "2028-12-31");
    expect(next.renewals[0]).toMatchObject({
      previous: "2027-12-31",
      next: "2028-12-31",
    });
    expect(old.expires).toBe("2027-12-31");
    expect(old.renewals).toHaveLength(0);
  });
  it("refuse de raccourcir un abonnement", () => {
    expect(() =>
      renew(fixture().clients[0].subscriptions[0], "2026-12-31"),
    ).toThrow();
  });
  it("compte le jour d’expiration comme encore valide et respecte les suspensions", () => {
    const s = { ...fixture().clients[0].subscriptions[0], expires: today() };
    expect(state(s)).toBe("À renouveler");
    expect(state({ ...s, status: "disabled" })).toBe("Suspendu");
    expect(state({ ...s, expires: "2000-01-01" })).toBe("Expiré");
  });
  it("détecte les doublons et ne remplace rien sans choix explicite", () => {
    const old = fixture().clients[0],
      incoming = { ...old, id: crypto.randomUUID(), notes: "Importé" };
    expect(duplicate(old, incoming)).toBe(true);
    expect(mergeClients([old], [incoming], false)).toEqual([old]);
    expect(mergeClients([old], [incoming], true)).toEqual([incoming]);
  });
  it("refuse une correspondance ambiguë plutôt que de perdre une fiche", () => {
    const a = fixture().clients[0],
      b = { ...a, id: crypto.randomUUID(), name: "Autre", phone: "999" },
      c = { ...a, name: "Autre" };
    expect(() => mergeClients([a, b], [c], true)).toThrow("Plusieurs fiches");
  });
});
describe("CSV sensible en mémoire", () => {
  it("lit points-virgules, accents, guillemets échappés et retours à la ligne", () => {
    const rows = parseCsv(
      '\uFEFFnom;notes\r\nAlice;"Texte ""cité""\nDeux lignes"',
    );
    expect(rows[1]).toEqual(["Alice", 'Texte "cité"\nDeux lignes']);
  });
  it("signale les dates invalides et ne prépare pas la fiche fautive", () => {
    const rows = parseCsv("name,expires\nAlice,2026-02-30");
    const r = mapCsv(rows, { name: 0, expires: 1 });
    expect(r.errors).toHaveLength(1);
    expect(r.clients).toHaveLength(0);
  });
  it("importe les clients sans abonnement et détecte les CSV mal formés", () => {
    const r = mapCsv(parseCsv("name,phone\nAlice,123"), { name: 0, phone: 1 });
    expect(r.clients[0].subscriptions).toEqual([]);
    expect(() => parseCsv('name,notes\nAlice,"ouvert')).toThrow();
  });
});
describe("Transactions de stockage", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase("prive-encrypted");
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  it("retrouve le coffre après réouverture et ne stocke que l’enveloppe chiffrée", async () => {
    expect(await loadEnvelope()).toBe(null);
    const v = fixture(),
      e = await encrypt(v, await derive("mot-de-passe-de-test"));
    await saveEnvelope(e, null);
    expect(await loadEnvelope()).toEqual(e);
    expect(
      (await decrypt((await loadEnvelope())!, "mot-de-passe-de-test")).vault,
    ).toEqual(v);
  });
  it("refuse les écritures concurrentes périmées et préserve le coffre", async () => {
    const session = await derive("mot-de-passe-de-test");
    const e = await encrypt(fixture(), session);
    await saveEnvelope(e, null);
    const next = await encrypt(emptyVault(), session);
    await expect(saveEnvelope(next, "valeur-perimee")).rejects.toThrow(
      "autre fenêtre",
    );
    expect(await loadEnvelope()).toEqual(e);
    await saveEnvelope(next, e.ciphertext);
    expect(await loadEnvelope()).toEqual(next);
  });
});
