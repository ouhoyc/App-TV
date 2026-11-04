import { describe, it, expect } from "vitest";
import {
  applyProviderDevice,
  subscriptionIdentity,
  type ProviderDevice,
  type ProviderReceipt,
} from "./providerWorkflow";
import { newClient, newSubscription, validateVault, emptyVault } from "./model";

describe("Fiches après résultat fournisseur", () => {
  const device: ProviderDevice = {
    type: "m3u",
    username: "real-user",
    password: "real-secret",
    mac: "",
    userId: "5000",
    expires: "2028-01-29",
    enabled: true,
    server: "http://fixture.invalid",
    m3u: "",
    country: "FR",
    notes: "",
  };
  it("met à jour uniquement l’abonnement ciblé avec la date reçue et garde un historique sans doublon", () => {
    const client = newClient();
    client.name = "Client de test";
    const sub = client.subscriptions[0];
    sub.expires = "2027-10-29";
    sub.panelId = "second";
    const untouched = {
      ...newSubscription(),
      expires: "2027-11-29",
      provider: "Autre fournisseur",
    };
    client.subscriptions.push(untouched);
    const receipt: ProviderReceipt = {
      action: "renew",
      confirmed: true,
      device,
      before: null,
      months: 3,
      enabled: null,
      needsSync: false,
      completedAt: "2026-10-29T12:00:00Z",
    };
    const next = applyProviderDevice(
      client,
      sub,
      device,
      "second",
      { start: sub.start, expires: device.expires! },
      receipt,
    );
    expect(next.subscriptions[1]).toEqual(untouched);
    expect(next.subscriptions[0]).toMatchObject({
      expires: "2028-01-29",
      panelId: "second",
      providerUserId: "5000",
      username: "real-user",
    });
    expect(next.subscriptions[0].renewals).toHaveLength(1);
    expect(client.subscriptions[0].expires).toBe("2027-10-29");
    const repeated = applyProviderDevice(
      next,
      next.subscriptions[0],
      device,
      "second",
      { start: sub.start, expires: device.expires! },
      receipt,
    );
    expect(repeated.subscriptions[0].renewals).toHaveLength(1);
    expect(() =>
      validateVault({ ...emptyVault(), clients: [next] }),
    ).not.toThrow();
  });
  it("ne fabrique pas de date, d’identifiants ou d’état actif", () => {
    const client = newClient();
    client.name = "Nouveau client";
    const sub = client.subscriptions[0];
    sub.status = "disabled";
    expect(() =>
      applyProviderDevice(client, sub, null, "first", {
        start: sub.start,
        expires: "",
      }),
    ).toThrow("dates");
    expect(() =>
      applyProviderDevice(client, sub, null, "first", {
        start: sub.start,
        expires: "2028-01-29",
      }),
    ).toThrow("identifiants");
    const next = applyProviderDevice(
      client,
      sub,
      { ...device, enabled: null },
      "first",
      { start: sub.start, expires: "2028-01-29" },
    );
    expect(next.subscriptions[0].status).toBe("disabled");
    expect(next.subscriptions[0].providerEnabled).toBeNull();
  });
  it("lit les identifiants d’un lien M3U sans confondre MAG et M3U", () => {
    const s = newSubscription();
    s.m3u = "http://fixture.invalid/get.php?username=alice&password=a%26b";
    expect(subscriptionIdentity(s)).toEqual({
      type: "m3u",
      username: "alice",
      password: "a&b",
    });
    s.type = "MAG";
    s.mac = "00:11:22:33:44:55";
    expect(subscriptionIdentity(s)).toEqual({ type: "mag", mac: s.mac });
  });
  it("privilégie l’état relu dans le panel à l’état demandé", () => {
    const client = newClient();
    client.name = "Client de test";
    const sub = client.subscriptions[0];
    sub.expires = "2028-01-29";
    const receipt: ProviderReceipt = {
      action: "status",
      confirmed: true,
      device: { ...device, enabled: false },
      before: null,
      months: null,
      enabled: true,
      needsSync: true,
      completedAt: new Date().toISOString(),
    };
    expect(
      applyProviderDevice(
        client,
        sub,
        receipt.device,
        "first",
        { start: sub.start, expires: sub.expires },
        receipt,
      ).subscriptions[0].status,
    ).toBe("disabled");
  });
});
