import { describe, it, expect, vi, beforeAll } from "vitest";
import { createIdentity } from "../src/cloudCrypto.ts";
import { openProviderReceipt } from "../src/providerWorkflow.ts";
import {
  providerOperation,
  encryptProviderReceipt,
} from "../lib/providerOperations.js";
import {
  providerDevice,
  providerPackages,
  mutationParameters,
} from "../lib/provider.js";

const owner = "10000000-0000-4000-8000-000000000001",
  admin = "10000000-0000-4000-8000-000000000002",
  reseller = "10000000-0000-4000-8000-000000000003";
let identity, foreign;
beforeAll(async () => {
  [identity, foreign] = await Promise.all([
    createIdentity("provider-operation-test"),
    createIdentity("provider-operation-foreign"),
  ]);
});
function setup() {
  const rows = new Map(),
    calls = [],
    writes = [];
  const profile = { id: owner, role: "admin", active: true };
  const profiles = [
    profile,
    { id: admin, role: "admin", active: true },
    { id: reseller, role: "reseller", active: true },
  ];
  const keys = profiles.map((p) => ({
    user_id: p.id,
    public_jwk: identity.jwk,
  }));
  let loseResponse = false,
    failSave = false,
    disabled = false,
    expiry = "2027-10-29",
    refuse = false;
  const db = {
    from(table) {
      const filters = [];
      let update = null,
        single = false;
      const query = {
        select() {
          return query;
        },
        eq(k, v) {
          filters.push([k, v]);
          return query;
        },
        in(k, v) {
          filters.push([k, v]);
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        update(value) {
          update = value;
          return query;
        },
        then(resolve, reject) {
          try {
            let data =
              table === "app_tv_profiles"
                ? profiles
                : table === "app_tv_public_keys"
                  ? keys
                  : [...rows.values()];
            data = data.filter((row) =>
              filters.every(([k, v]) =>
                Array.isArray(v) ? v.includes(row[k]) : row[k] === v,
              ),
            );
            if (update) {
              if (failSave && update.state === "succeeded")
                return Promise.resolve({ error: { code: "unavailable" } }).then(
                  resolve,
                  reject,
                );
              for (const row of data) Object.assign(row, update);
            }
            return Promise.resolve({
              data: single ? data[0] || null : structuredClone(data),
              error: null,
            }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return query;
    },
    async rpc(name, { entry }) {
      expect(name).toBe("app_tv_claim_provider_operation");
      if (rows.has(entry.id))
        return {
          data: { claimed: false, operation: rows.get(entry.id) },
          error: null,
        };
      if (
        [...rows.values()].some(
          (r) =>
            r.resource_hash === entry.resource_hash &&
            ["pending", "uncertain", "succeeded"].includes(r.state),
        )
      )
        return { error: { code: "40001" } };
      const row = {
        ...entry,
        state: "pending",
        actor_id: owner,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result_box: null,
        error_code: null,
      };
      rows.set(entry.id, row);
      return {
        data: { claimed: true, operation: structuredClone(row) },
        error: null,
      };
    },
  };
  const fetcher = vi.fn(async (url) => {
    const p = Object.fromEntries(url.searchParams);
    calls.push(p);
    expect(url.origin + url.pathname).toBe(
      "https://8k.online-cms.ru/api/api.php",
    );
    if (p.action === "bouquet")
      return Response.json([{ id: "132", name: "Bouquet de test" }]);
    if (p.action === "device_info")
      return Response.json([
        {
          status: "true",
          username: p.username || "",
          password: p.password || "",
          user_id: "5000",
          expire: expiry,
          enabled: disabled ? "0" : "1",
          url: "http://fixture.invalid",
        },
      ]);
    writes.push(p);
    if (refuse)
      return Response.json([{ status: "false", message: "Invalid API key" }]);
    if (p.action === "renew") expiry = "2028-10-29";
    if (p.action === "device_status") disabled = p.status === "disable";
    if (loseResponse) throw new Error("Ambiguous network failure");
    if (p.action === "new")
      return Response.json([
        {
          status: "true",
          user_id: "5000",
          ...(p.type === "mag"
            ? { mac: p.user, url: "http://fixture.invalid/c/" }
            : {
                url: "http://fixture.invalid/get.php?username=created-user&password=created-secret&type=m3u_plus",
              }),
        },
      ]);
    return Response.json([{ status: "true" }]);
  });
  const body = (action = "renew", extra = {}) => ({
    action,
    operationId: crypto.randomUUID(),
    ownerId: owner,
    clientId: "20000000-0000-4000-8000-000000000001",
    subscriptionId: "20000000-0000-4000-8000-000000000002",
    key: "fixture-panel-one-key",
    type: "m3u",
    username: "existing-user",
    password: "existing-secret",
    months: 12,
    confirmed: true,
    contextBox: {
      version: 1,
      iv: "A".repeat(16),
      ciphertext: "A".repeat(32),
      recipients: { [owner]: "wrapped", [admin]: "wrapped" },
    },
    ...extra,
  });
  return {
    db,
    profile,
    rows,
    calls,
    writes,
    fetcher,
    body,
    loseResponse: () => {
      loseResponse = true;
    },
    failSave: () => {
      failSave = true;
    },
    refuse: () => {
      refuse = true;
    },
  };
}
describe("Provider remote actions and durable receipts", () => {
  it("requires explicit confirmation and owner authorization before provider traffic", async () => {
    const f = setup();
    await expect(
      providerOperation(f.body("renew", { confirmed: false }), f, f.fetcher),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      providerOperation(
        f.body(),
        { db: f.db, profile: { id: reseller, role: "reseller" } },
        f.fetcher,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.calls).toHaveLength(0);
    for (const months of [0, 2, 24, "12"])
      expect(() => mutationParameters(f.body("renew", { months }))).toThrow();
  });
  it("renews once, reads the confirmed expiration and encrypts the durable receipt for both associates", async () => {
    const f = setup(),
      body = f.body();
    const first = await providerOperation(body, f, f.fetcher);
    expect(first.operation.state).toBe("succeeded");
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({
      action: "renew",
      type: "m3u",
      sub: "12",
      username: "existing-user",
      api_key: "fixture-panel-one-key",
    });
    const raw = JSON.stringify([...f.rows.values()]);
    expect(raw).not.toContain("existing-secret");
    expect(raw).not.toContain(body.key);
    const receipt = await openProviderReceipt(
      first.operation.result_box,
      body.operationId,
      admin,
      identity.privateKey,
    );
    expect(receipt.device.expires).toBe("2028-10-29");
    expect(receipt.before.expires).toBe("2027-10-29");
    expect(first.operation.result_box.recipients[reseller]).toBeUndefined();
    await expect(
      openProviderReceipt(
        first.operation.result_box,
        body.operationId,
        owner,
        foreign.privateKey,
      ),
    ).rejects.toThrow();
    const repeated = await providerOperation(body, f, f.fetcher);
    expect(repeated.operation.state).toBe("succeeded");
    expect(f.writes).toHaveLength(1);
    await expect(
      providerOperation({ ...body, months: 6 }, f, f.fetcher),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("records an uncertain outcome and blocks repeat writes after a lost response", async () => {
    const f = setup(),
      body = f.body();
    f.loseResponse();
    const response = await providerOperation(body, f, f.fetcher);
    expect(response.operation.state).toBe("uncertain");
    expect((await providerOperation(body, f, f.fetcher)).operation.state).toBe(
      "uncertain",
    );
    expect(f.writes).toHaveLength(1);
    await expect(
      providerOperation(
        { ...body, operationId: crypto.randomUUID() },
        f,
        f.fetcher,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.writes).toHaveLength(1);
  });
  it("creates M3U with the selected package/panel and recovers generated credentials", async () => {
    const f = setup(),
      body = f.body("create", {
        key: "fixture-panel-two-key",
        pack: "132",
        country: "fr",
      });
    const response = await providerOperation(body, f, f.fetcher);
    const receipt = await openProviderReceipt(
      response.operation.result_box,
      body.operationId,
      owner,
      identity.privateKey,
    );
    expect(f.writes[0]).toMatchObject({
      action: "new",
      type: "m3u",
      pack: "132",
      country: "FR",
      sub: "12",
      api_key: "fixture-panel-two-key",
    });
    expect(f.writes[0]).not.toHaveProperty("username");
    expect(receipt.device).toMatchObject({
      username: "created-user",
      password: "created-secret",
    });
    expect(receipt.device.m3u).toContain("get.php");
    expect(JSON.stringify([...f.rows.values()])).not.toContain(
      "created-secret",
    );
    await providerOperation(body, f, f.fetcher);
    expect(f.writes).toHaveLength(1);
  });
  it("creates MAG with user=MAC and resolves status user_id through a fresh device read", async () => {
    const f = setup(),
      create = f.body("create", {
        type: "mag",
        mac: "001122334455",
        pack: "132",
      });
    await providerOperation(create, f, f.fetcher);
    expect(f.writes[0]).toMatchObject({
      action: "new",
      type: "mag",
      user: "00:11:22:33:44:55",
    });
    const status = f.body("status", {
      type: "mag",
      mac: "00:11:22:33:44:55",
      enabled: false,
      userId: "spoofed-id",
    });
    const r = await providerOperation(status, f, f.fetcher);
    expect(f.writes[1]).toMatchObject({
      action: "device_status",
      status: "disable",
      id: "5000",
    });
    const receipt = await openProviderReceipt(
      r.operation.result_box,
      status.operationId,
      owner,
      identity.privateKey,
    );
    expect(receipt.device.enabled).toBe(false);
  });
  it("keeps the encrypted result in the response if saving the receipt fails, without repeating the provider mutation", async () => {
    const f = setup();
    f.failSave();
    const body = f.body();
    const r = await providerOperation(body, f, f.fetcher);
    expect(r.persisted).toBe(false);
    expect(r.operation.state).toBe("succeeded");
    expect(
      (
        await openProviderReceipt(
          r.operation.result_box,
          body.operationId,
          owner,
          identity.privateKey,
        )
      ).confirmed,
    ).toBe(true);
    expect(f.writes).toHaveLength(1);
    expect((await providerOperation(body, f, f.fetcher)).operation.state).toBe(
      "pending",
    );
    expect(f.writes).toHaveLength(1);
  });
  it("records an explicit refusal, preserves history access and requires confirmation to close receipts", async () => {
    const f = setup();
    f.refuse();
    const body = f.body();
    expect((await providerOperation(body, f, f.fetcher)).operation.state).toBe(
      "failed",
    );
    expect(
      (await providerOperation({ action: "history" }, f)).operations,
    ).toHaveLength(1);
    await expect(
      providerOperation(
        { action: "resolve", operationId: body.operationId },
        f,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await providerOperation(
      { action: "resolve", operationId: body.operationId, confirmed: true },
      f,
    );
    expect(f.rows.get(body.operationId).state).toBe("resolved");
  });
  it("does not guess dates or account state and rejects mismatched device identities", async () => {
    const body = {
      key: "fixture-key",
      type: "m3u",
      username: "expected",
      password: "secret",
    };
    const response = await providerDevice(body, async () =>
      Response.json({ status: "true", username: "expected" }),
    );
    expect(response.expires).toBeNull();
    expect(response.enabled).toBeNull();
    await expect(
      providerDevice(body, async () =>
        Response.json({ status: "true", username: "other" }),
      ),
    ).rejects.toMatchObject({ providerCode: "DEVICE_MISMATCH" });
    await expect(
      providerPackages(body, async () => Response.json({ status: "false" })),
    ).rejects.toThrow();
  });
});
