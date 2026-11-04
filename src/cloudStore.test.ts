import { describe, it, expect, vi, afterEach } from "vitest";
import { CloudStore, type Snapshot } from "./cloudStore";
import { createIdentity, encryptCloud, decryptCloud } from "./cloudCrypto";
import { emptyVault, newClient } from "./model";

afterEach(() => vi.unstubAllGlobals());
describe("Clientèle commune aux deux associés", () => {
  it("partage clients, panels et nouvelles fiches entre associés en conservant les revendeurs séparés", async () => {
    const identity = await createIdentity("Shared-workspace-test-password");
    const profiles = [
      {
        id: "admin-a",
        email: "first@example.invalid",
        display_name: "Premier associé",
        role: "admin" as const,
        active: true,
        created_at: "2026-01-01",
      },
      {
        id: "admin-b",
        email: "second@example.invalid",
        display_name: "Second associé",
        role: "admin" as const,
        active: true,
        created_at: "2026-01-02",
      },
      {
        id: "reseller",
        email: "reseller@example.invalid",
        display_name: "Sous-revendeur",
        role: "reseller" as const,
        active: true,
        created_at: "2026-01-03",
      },
    ];
    const keys = profiles.map((p) => ({
      user_id: p.id,
      public_jwk: identity.jwk,
    }));
    const vaults = await Promise.all(
      profiles.map(async (p, i) => {
        const vault = emptyVault();
        const c = newClient();
        c.name = `Client ${i}`;
        c.subscriptions = [];
        vault.clients = [c];
        if (i === 1)
          vault.provider = {
            url: "https://8k.online-cms.ru/api/api.php",
            key: "shared-key-one",
            panels: [
              { id: "panel-a", name: "Fournisseur A", key: "shared-key-one" },
              { id: "panel-b", name: "Fournisseur B", key: "shared-key-two" },
            ],
          };
        return {
          owner_id: p.id,
          payload: await encryptCloud(
            vault,
            p.id,
            1,
            keys.filter(
              (k) => k.user_id !== "reseller" || p.role === "reseller",
            ),
          ),
          revision: 1,
          updated_at: "2026-10-29",
        };
      }),
    );
    const snapshot: Snapshot = {
      profile: profiles[0],
      profiles,
      keys,
      vaults,
      keyring: null,
      invitations: [],
    };
    const first = await new CloudStore(
      snapshot,
      identity.privateKey,
      "admin-a",
    ).open();
    const second = await new CloudStore(
      { ...snapshot, profile: profiles[1], profiles: [...profiles].reverse() },
      identity.privateKey,
      "admin-b",
    ).open();
    expect(first.scope).toBe("shared");
    expect(second.scope).toBe("shared");
    expect(first.defaultOwner).toBe(second.defaultOwner);
    expect(first.vault.clients.map((c) => c.name)).toEqual([
      "Client 0",
      "Client 1",
    ]);
    expect(second.vault).toEqual(first.vault);
    expect(second.vault.provider.panels?.map((p) => p.key)).toEqual([
      "shared-key-one",
      "shared-key-two",
    ]);
    expect(first.ownerLabel(first.vault.clients[1].id)).toBe("Notre clientèle");
    const all = await new CloudStore(
      snapshot,
      identity.privateKey,
      "all",
    ).open();
    expect(all.vault.clients).toHaveLength(3);
    const selected = await new CloudStore(
      snapshot,
      identity.privateKey,
      "reseller",
    ).open();
    expect(selected.vault.clients.map((c) => c.name)).toEqual(["Client 2"]);
    const restricted = await new CloudStore(
      { ...snapshot, profile: profiles[2] },
      identity.privateKey,
      "all",
    ).open();
    expect(restricted.scope).toBe("reseller");
    expect(restricted.vault.clients.map((c) => c.name)).toEqual(["Client 2"]);
    const resellerBefore = JSON.stringify(vaults[2]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.action).toBe("save");
        expect(JSON.stringify(body)).not.toContain("shared-key-");
        const revisions = [];
        for (const change of body.changes) {
          expect(change.owner_id).not.toBe("reseller");
          const row = vaults.find((v) => v.owner_id === change.owner_id)!;
          expect(row.revision).toBe(change.expected_revision);
          row.payload = change.payload;
          row.revision++;
          revisions.push({ owner_id: row.owner_id, revision: row.revision });
        }
        return Response.json({ revisions });
      }),
    );
    const client = newClient();
    client.name = "Nouveau client commun";
    client.subscriptions = [];
    await second.save({
      ...second.vault,
      clients: [...second.vault.clients, client],
    });
    const reopened = await new CloudStore(
      snapshot,
      identity.privateKey,
      "shared",
    ).open();
    expect(reopened.vault.clients.map((c) => c.name)).toEqual([
      "Client 0",
      "Nouveau client commun",
      "Client 1",
    ]);
    expect(reopened.vault.provider).toEqual(second.vault.provider);
    expect(JSON.stringify(vaults[2])).toBe(resellerBefore);
    const primary = vaults[0];
    const decoded = await decryptCloud(
      primary.payload,
      primary.owner_id,
      primary.revision,
      "admin-a",
      identity.privateKey,
    );
    expect(decoded.clients.some((c) => c.id === client.id)).toBe(true);
  });
});
