import { describe, it, expect, vi, afterEach } from "vitest";
import { presenceFromRecord, providerPresence } from "../lib/provider.js";
import handler from "../api/provider.js";
import * as server from "../lib/server.js";
afterEach(() => vi.restoreAllMocks());
describe("Connexions distinctes de la validité d’abonnement", () => {
  it("ne confond jamais activation, date future et réponse réussie avec une connexion en ligne", () => {
    expect(
      presenceFromRecord({
        status: "true",
        enabled: "1",
        expire: "2028-01-01",
      }),
    ).toEqual({ online: null, connections: null, watching: [] });
    expect(
      presenceFromRecord({ status: true, enabled: "0" }).online,
    ).toBeNull();
  });
  it("lit uniquement les champs de connexion explicites et n’affiche pas une ancienne chaîne hors ligne", () => {
    expect(
      presenceFromRecord({ active_cons: "2", channel_name: "Une chaîne" }),
    ).toEqual({ online: true, connections: 2, watching: ["Une chaîne"] });
    expect(
      presenceFromRecord({ online: "0", channel_name: "Ancienne chaîne" }),
    ).toEqual({ online: false, connections: null, watching: [] });
    expect(
      presenceFromRecord({
        active_connections: [],
        current_channel: "Ancienne",
      }).online,
    ).toBe(false);
  });
  it("filtre les URL et secrets au lieu de les présenter comme titres de chaîne", () => {
    expect(
      presenceFromRecord({
        online: true,
        stream_name: "https://host.invalid/live/password=secret",
        current_channel: "Documentaire",
      }).watching,
    ).toEqual(["Documentaire"]);
  });
  it("effectue uniquement des lectures device_info au fournisseur fixe, sans création ni paramètres arbitraires", async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        {
          status: "true",
          username: "fixture-user",
          active_cons: 1,
          stream_name: "Sport",
        },
      ]),
    );
    const result = await providerPresence(
      {
        key: "fixture-key",
        items: [
          {
            id: "fixture-id",
            type: "m3u",
            username: "fixture-user",
            password: "fixture-secret",
          },
        ],
      },
      fetcher,
    );
    expect(result.items).toEqual([
      { id: "fixture-id", online: true, connections: 1, watching: ["Sport"] },
    ]);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.hostname).toBe("8k.online-cms.ru");
    expect(url.searchParams.get("action")).toBe("device_info");
    expect(url.searchParams.has("sub")).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/fixture-key|fixture-secret/);
  });
  it("refuse un lot trop grand et la clientèle d’un autre revendeur avant toute lecture fournisseur", async () => {
    const fetcher = vi.fn();
    await expect(
      providerPresence(
        { key: "fixture-key", items: Array.from({ length: 7 }, () => ({})) },
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    vi.spyOn(server, "sessionClient").mockResolvedValue({
      profile: { id: "reseller-a", role: "reseller", active: true },
    });
    const res = {
      statusCode: 200,
      setHeader() {},
      status(n) {
        this.statusCode = n;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await handler(
      {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: {
          action: "presence",
          ownerId: "reseller-b",
          key: "fixture-key",
          items: [],
        },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});
