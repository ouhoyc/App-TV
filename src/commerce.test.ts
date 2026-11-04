import { describe, it, expect } from "vitest";
import { newClient, newSubscription, type Client } from "./model";
import {
  applyPlan,
  prepareClient,
  paidSubscription,
  financialSummary,
  panelCost,
  invoice,
} from "./commerce";
import { remindersFor } from "./reminders";
function annual() {
  const c = newClient();
  c.subscriptions = [
    {
      ...applyPlan({ ...newSubscription(), start: "2026-10-29" }, "year1"),
      sale: "80",
      cost: "20",
      panelId: "one",
    },
  ];
  return prepareClient(undefined, c);
}
describe("Ventes et règlements", () => {
  it("démarre impayé, enregistre le règlement sans doubler la vente", () => {
    const c = annual();
    expect(c.subscriptions[0].paid).toBe(false);
    expect(financialSummary([c])).toMatchObject({
      collected: 0,
      purchases: 20,
      outstanding: 80,
      profit: -20,
    });
    c.subscriptions[0] = paidSubscription(c.subscriptions[0], true);
    expect(financialSummary([c])).toMatchObject({
      collected: 80,
      purchases: 20,
      outstanding: 0,
      profit: 60,
      monthly: 5,
    });
    expect(c.subscriptions[0].sales).toHaveLength(1);
    c.subscriptions[0] = paidSubscription(c.subscriptions[0], false);
    expect(financialSummary([c]).outstanding).toBe(80);
  });
  it("conserve les prix passés et compte chaque renouvellement une seule fois", () => {
    const c = annual();
    c.subscriptions[0] = paidSubscription(c.subscriptions[0], true);
    const draft = structuredClone(c),
      s = draft.subscriptions[0];
    s.cost = "25";
    s.sale = "90";
    s.renewals.push({
      at: "2027-10-29",
      previous: s.expires,
      next: "2028-10-29",
    });
    s.expires = "2028-10-29";
    const next = prepareClient(c, draft);
    expect(
      next.subscriptions[0].sales?.map((x) => [x.sale, x.cost, x.paid]),
    ).toEqual([
      ["80", "20", true],
      ["90", "25", false],
    ]);
    expect(
      prepareClient(next, structuredClone(next)).subscriptions[0].sales,
    ).toHaveLength(2);
    next.subscriptions[0] = paidSubscription(next.subscriptions[0], true);
    expect(financialSummary([next]).profit).toBe(125);
    expect(
      panelCost({ id: "one", name: "Panel", key: "", annualCost: "25" }, 3),
    ).toBe("6.25");
    expect(next.subscriptions[0].sales?.[0].cost).toBe("20");
  });
  it("rejouer un reçu stable ne crée pas deux ventes", () => {
    const s = invoice(
      { ...newSubscription(), sale: "80", cost: "20" },
      "receipt-one",
    );
    expect(invoice(s, "receipt-one").sales).toHaveLength(1);
  });
  it("signale les prix manquants plutôt que promettre un bénéfice exact", () => {
    const c = annual();
    c.subscriptions[0].sales![0].cost = "";
    expect(financialSummary([c])).toMatchObject({
      incomplete: 1,
      annualIncomplete: true,
    });
  });
});
describe("Rappels réels", () => {
  it("respecte exactement 24 heures même au changement d’heure et exclut les identifiants des métadonnées", async () => {
    const c = newClient();
    c.name = "Personne confidentielle";
    c.subscriptions = [
      applyPlan(
        {
          ...newSubscription(),
          username: "secret-login",
          password: "secret-password",
        },
        "trial24",
        new Date("2026-10-24T22:30:00Z"),
      ),
    ];
    const s = c.subscriptions[0];
    expect(Date.parse(s.expiresAt!) - Date.parse(s.trialStartedAt!)).toBe(
      86400000,
    );
    const reminders = await remindersFor([c], Date.parse("2026-10-25T00:00Z"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      kind: "trial24",
      due_at: "2026-10-25T22:30:00.000Z",
    });
    expect(JSON.stringify(reminders)).not.toMatch(/confidentielle|secret/);
    expect(await remindersFor([c], Date.parse("2026-10-25T00:00Z"))).toEqual(
      reminders,
    );
  });
  it("programme les annuels à J-14, supprime les archivés/suspendus et change de rappel après renouvellement", async () => {
    const c = annual();
    const now = Date.parse("2026-10-29Z");
    const [r] = await remindersFor([c], now);
    expect(Date.parse(r.expires_at) - Date.parse(r.due_at)).toBe(14 * 86400000);
    expect(r.kind).toBe("annual");
    const later: Client = structuredClone(c);
    later.subscriptions[0].expires = "2028-10-29";
    expect((await remindersFor([later], now))[0].id).not.toBe(r.id);
    c.archived = true;
    expect(await remindersFor([c], now)).toEqual([]);
    c.archived = false;
    c.subscriptions[0].status = "disabled";
    expect(await remindersFor([c], now)).toEqual([]);
  });
});

describe("Présentation des fiches simplifiées", () => {
  it("trie les abonnements par expiration décroissante, y compris plusieurs abonnements par client", async () => {
    const { customerRows } = await import("./commerce");
    const a = annual(),
      b = annual(),
      empty = annual();
    a.name = "Ancien";
    b.name = "Récent";
    empty.subscriptions = [];
    a.subscriptions[0].expires = "2025-01-01";
    b.subscriptions[0].expires = "2028-01-01";
    a.subscriptions.push({
      ...a.subscriptions[0],
      id: crypto.randomUUID(),
      expires: "2027-01-01",
    });
    expect(
      customerRows([a, empty, b]).map(
        (r) => r.subscription?.expires || "empty",
      ),
    ).toEqual(["2028-01-01", "2027-01-01", "2025-01-01", "empty"]);
  });
  it("récupère le pseudo et le serveur des anciennes fiches sans perdre les notes", async () => {
    const { clientPseudo, serverAddress, clientNotes } =
      await import("./commerce");
    const c = annual();
    c.name = "Ancien nom";
    c.notes = "Contact du client";
    c.subscriptions[0].m3u =
      "https://server.invalid/get.php?username=pseudo-reel&password=secret";
    c.subscriptions[0].notes = "Conserver cette note d’abonnement";
    expect(clientPseudo(c)).toBe("pseudo-reel");
    expect(serverAddress(c.subscriptions[0])).toBe("https://server.invalid");
    expect(clientNotes(c)).toBe(
      "Contact du client\n\nConserver cette note d’abonnement",
    );
  });
});
