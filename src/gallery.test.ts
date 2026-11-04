import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { normalizeWebAddress, externalBrowserHref } from "./externalBrowser";
import { newClient, newSubscription } from "./model";
import {
  applyPlan,
  customerRows,
  financialSummary,
  prepareClient,
  panelAccent,
} from "./commerce";
import { cacheMedia, cachedMedia } from "./mediaCache";
describe("Galerie, dates et raccourcis", () => {
  it("normalise les serveurs saisis sans protocole et rejette les schémas exécutables", () => {
    expect(normalizeWebAddress("  demo.invalid:8080/path  ")).toBe(
      "https://demo.invalid:8080/path",
    );
    expect(normalizeWebAddress("http://demo.invalid:8080")).toBe(
      "http://demo.invalid:8080/",
    );
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "ftp://demo.invalid",
      "https://user:password@demo.invalid",
    ]) {
      expect(() => normalizeWebAddress(value)).toThrow();
    }
  });
  it("utilise le protocole Safari sur iPhone installé et garde le navigateur normal ailleurs", () => {
    const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)";
    expect(externalBrowserHref("https://panel.invalid/", ios, true)).toBe(
      "x-safari-https://panel.invalid/",
    );
    expect(externalBrowserHref("https://panel.invalid/", "Android", true)).toBe(
      "https://panel.invalid/",
    );
    expect(externalBrowserHref("http://panel.invalid/", ios, true)).toContain(
      "/open-browser.html#http%3A%2F%2Fpanel.invalid%2F",
    );
  });
  it("place les tests 24 h avant les annuels, puis les échéances les plus récentes", () => {
    const c = newClient();
    c.subscriptions = [
      { ...newSubscription(), expires: "2029-01-01" },
      applyPlan(newSubscription(), "trial24", new Date("2025-01-01Z")),
    ];
    expect(customerRows([c])[0].subscription?.plan).toBe("trial24");
    expect(panelAccent("Panel DIOGO")).toBe("panel-diogo");
    expect(panelAccent("Poyeland 8K")).toBe("panel-poyeland");
  });
  it("affiche la date historique de vente sans remplacer les dates des renouvellements", () => {
    const c = newClient(),
      s = applyPlan(
        { ...newSubscription(), start: "2024-01-10", sale: "80", cost: "20" },
        "year1",
      );
    c.subscriptions = [s];
    const created = prepareClient(undefined, c);
    expect(financialSummary([created]).records[0].at).toBe(
      "2024-01-10T12:00:00Z",
    );
    created.subscriptions[0].sales![0].at = "2026-10-30T14:00:00Z";
    created.subscriptions[0].sales!.push({
      ...created.subscriptions[0].sales![0],
      id: "renew",
      at: "2025-01-09T14:00:00Z",
    });
    expect(financialSummary([created]).records.map((x) => x.at)).toEqual([
      "2024-01-10T12:00:00Z",
      "2025-01-09T14:00:00Z",
    ]);
  });
  it("conserve uniquement des enveloppes chiffrées et isole les caches de deux comptes", async () => {
    const payload = {
      version: 1 as const,
      iv: "encrypted-iv",
      ciphertext: "encrypted-photo",
      recipients: { admin: "wrapped-key" },
    };
    await cacheMedia("admin:owner:image", payload);
    expect(await cachedMedia("admin:owner:image")).toEqual(payload);
    expect(await cachedMedia("reseller:owner:image")).toBeNull();
  });
});
