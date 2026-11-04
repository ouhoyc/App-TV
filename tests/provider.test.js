import { describe, it, expect, vi, afterEach } from "vitest";
import { testProviderAccount } from "../lib/provider.js";
import handler from "../api/provider.js";
import * as server from "../lib/server.js";
import { normalizeProviderKey, PROVIDER_URL } from "../lib/providerInput.js";

const key = "fixture-not-a-real-key&action=new";
const account = {
  status: "true",
  username: "fixture-account",
  credits: "20.5",
  enabled: "1",
};
function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("GOLD PANEL read-only boundary", () => {
  it("encodes keys, fixes the upstream URL/action, refuses redirects and returns only account fields", async () => {
    const fetcher = vi.fn(async () =>
      Response.json([{ ...account, api_key: key, password: "never-return" }]),
    );
    expect(
      await testProviderAccount(
        { action: "test", key, url: "http://localhost" },
        fetcher,
      ),
    ).toEqual({ name: "fixture-account", credits: 20.5, enabled: true });
    const [url, options] = fetcher.mock.calls[0];
    expect(url.origin + url.pathname).toBe(
      "https://8k.online-cms.ru/api/api.php",
    );
    expect([...url.searchParams.keys()]).toEqual(["action", "api_key"]);
    expect(url.searchParams.get("action")).toBe("reseller");
    expect(url.searchParams.get("api_key")).toBe(key);
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects every write action and malformed key before any request", async () => {
    const fetcher = vi.fn();
    for (const action of [
      "new",
      "renew",
      "device_status",
      "device_info",
      "bouquet",
    ])
      await expect(
        testProviderAccount({ action, key }, fetcher),
      ).rejects.toMatchObject({ status: 400 });
    for (const bad of ["", "has space", "a\nb", "x".repeat(513), null])
      await expect(
        testProviderAccount({ action: "test", key: bad }, fetcher),
      ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not reflect credential-bearing upstream failures", async () => {
    await expect(
      testProviderAccount({ action: "test", key }, async () =>
        Response.json([{ status: "false", message: key }]),
      ),
    ).rejects.toMatchObject({
      status: 422,
      providerCode: "UPSTREAM_REJECTED",
    });
    for (const fetcher of [
      async () => {
        throw new Error(key);
      },
      async () => new Response(key, { status: 500 }),
      async () => new Response("not json " + key),
      async () => new Response("x".repeat(65537)),
    ]) {
      await expect(
        testProviderAccount({ action: "test", key }, fetcher),
      ).rejects.toMatchObject({ status: 502 });
      try {
        await testProviderAccount({ action: "test", key }, fetcher);
      } catch (error) {
        expect(error.message).not.toContain(key);
      }
    }
  });
  it("accepts the account as a JSON object and normalizes documented flag variants", async () => {
    for (const status of [true, "true", 1, "1", "TRUE"]) {
      expect(
        await testProviderAccount({ action: "test", key }, async () =>
          Response.json({ ...account, status, enabled: true }),
        ),
      ).toEqual({ name: "fixture-account", credits: 20.5, enabled: true });
    }
    await expect(
      testProviderAccount({ action: "test", key }, async () =>
        Response.json({ unexpected: "shape" }),
      ),
    ).rejects.toMatchObject({ status: 502, providerCode: "UPSTREAM_FORMAT" });
    await expect(
      testProviderAccount({ action: "test", key }, async () =>
        Response.json([]),
      ),
    ).rejects.toMatchObject({ status: 502, providerCode: "UPSTREAM_FORMAT" });
  });
  it("extracts only the key from a pasted API URL and never executes its action", async () => {
    const url = new URL(PROVIDER_URL);
    url.search = new URLSearchParams({
      action: "new",
      api_key: key,
      type: "m3u",
      sub: "12",
    }).toString();
    expect(normalizeProviderKey(url.href)).toBe(key);
    const fetcher = vi.fn(async () => Response.json(account));
    await testProviderAccount({ action: "test", key: url.href }, fetcher);
    const upstream = fetcher.mock.calls[0][0];
    expect(upstream.searchParams.get("action")).toBe("reseller");
    expect(upstream.searchParams.get("api_key")).toBe(key);
    expect([...upstream.searchParams.keys()]).toEqual(["action", "api_key"]);
    for (const invalid of [
      "https://evil.invalid/api.php?api_key=secret",
      PROVIDER_URL,
      PROVIDER_URL + "?api_key=one&api_key=two",
      "https://user:password@8k.online-cms.ru/api/api.php?api_key=secret",
    ]) {
      expect(() => normalizeProviderKey(invalid)).toThrow();
    }
  });
  it("distinguishes explicit key/API/IP refusals without exposing upstream text", async () => {
    for (const [message, code] of [
      ["Invalid API key: " + key, "UPSTREAM_KEY_DENIED"],
      ["IP not allowed: 192.0.2.1 " + key, "UPSTREAM_IP_DENIED"],
      ["API disabled: " + key, "UPSTREAM_API_DISABLED"],
    ]) {
      let error;
      try {
        await testProviderAccount({ action: "test", key }, async () =>
          Response.json({ status: false, message }),
        );
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ status: 422, providerCode: code });
      expect(error.message).not.toContain(key);
      expect(error.message).not.toContain("192.0.2.1");
    }
    for (const [status, code] of [
      [403, "UPSTREAM_HTTP_DENIED"],
      [429, "UPSTREAM_RATE_LIMIT"],
    ])
      await expect(
        testProviderAccount(
          { action: "test", key },
          async () => new Response(key, { status }),
        ),
      ).rejects.toMatchObject({ status: 502, providerCode: code });
  });
  it("preserves upstream success when optional metadata is missing without fabricating balances or status", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const patch of [
      { credits: "NaN" },
      { username: null },
      { enabled: null },
      { credits: "" },
    ])
      expect(
        await testProviderAccount({ action: "test", key }, async () =>
          Response.json([{ ...account, ...patch }]),
        ),
      ).toMatchObject(
        Object.fromEntries(
          Object.keys(patch).map((field) => [
            field === "username" ? "name" : field,
            null,
          ]),
        ),
      );
    expect(
      await testProviderAccount({ action: "test", key }, async () =>
        Response.json({ status: "true" }),
      ),
    ).toEqual({ name: null, credits: null, enabled: null });
    for (const missing of [undefined, null, "", "   ", "NaN", {}, false])
      expect(
        (
          await testProviderAccount({ action: "test", key }, async () =>
            Response.json({ ...account, credits: missing }),
          )
        ).credits,
      ).toBeNull();
    for (const zero of [0, "0", "0.00"])
      expect(
        (
          await testProviderAccount({ action: "test", key }, async () =>
            Response.json({ ...account, credits: zero }),
          )
        ).credits,
      ).toBe(0);
    for (const data of [
      { username: "nested-account", credits: "12.5", enabled: "0" },
      [{ username: "nested-account", credits: "12.5", enabled: "0" }],
    ])
      expect(
        await testProviderAccount({ action: "test", key }, async () =>
          Response.json({ status: "true", data }),
        ),
      ).toEqual({ name: "nested-account", credits: 12.5, enabled: false });
    expect(JSON.stringify(info.mock.calls)).not.toContain(key);
    expect(JSON.stringify(info.mock.calls)).not.toContain("nested-account");
    expect(
      await testProviderAccount({ action: "test", key }, async () =>
        Response.json([{ ...account, enabled: "0" }]),
      ),
    ).toMatchObject({ enabled: false });
  });
  it("requires a same-origin JSON POST and an active authenticated session", async () => {
    vi.stubEnv("VERCEL", "1");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const headers = {
      host: "app-tv-alpha.vercel.app",
      origin: "https://app-tv-alpha.vercel.app",
      "content-type": "application/json",
    };
    for (const [req, code] of [
      [{ method: "GET", headers }, 405],
      [
        {
          method: "POST",
          headers: { ...headers, origin: "https://evil.invalid" },
        },
        403,
      ],
      [{ method: "POST", headers, body: { action: "test", key } }, 401],
    ]) {
      const res = response();
      await handler(req, res);
      expect(res.statusCode).toBe(code);
      expect(res.headers["Cache-Control"]).toContain("no-store");
    }
    expect(fetcher).not.toHaveBeenCalled();
    vi.spyOn(server, "sessionClient").mockRejectedValue(
      new server.ApiError("Compte suspendu.", 403),
    );
    const suspended = response();
    await handler(
      { method: "POST", headers, body: { action: "test", key } },
      suspended,
    );
    expect(suspended.statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    vi.spyOn(server, "sessionClient").mockResolvedValue({
      profile: { role: "reseller", active: true },
    });
    fetcher.mockResolvedValue(Response.json([account]));
    const success = response();
    await handler(
      { method: "POST", headers, body: { action: "test", key } },
      success,
    );
    expect(success.body).toEqual({
      name: "fixture-account",
      credits: 20.5,
      enabled: true,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    fetcher.mockImplementation(async () =>
      Response.json({ status: "true", credits: "20" }),
    );
    const oldClient = response();
    await handler(
      { method: "POST", headers, body: { action: "test", key } },
      oldClient,
    );
    expect(oldClient.statusCode).toBe(409);
    expect(oldClient.body.error).toContain("confirme la connexion");
    const newClient = response();
    await handler(
      {
        method: "POST",
        headers,
        body: { action: "test", key, acceptPartial: true },
      },
      newClient,
    );
    expect(newClient.statusCode).toBe(200);
    expect(newClient.body).toEqual({ name: null, credits: 20, enabled: null });
  });
  it("logs only a fixed diagnostic code and allowlisted schema, never secrets or arbitrary field names", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.spyOn(server, "sessionClient").mockResolvedValue({
      profile: { role: "admin", active: true },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ [key]: "secret-value", data: { api_key: key } }),
      ),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {
          host: "app-tv-alpha.vercel.app",
          origin: "https://app-tv-alpha.vercel.app",
          "content-type": "application/json",
        },
        body: { action: "test", key },
      },
      res,
    );
    expect(res.statusCode).toBe(502);
    expect(warning.mock.calls[0]).toEqual([
      "scdr-provider-test",
      { code: "UPSTREAM_FORMAT", shape: { kind: "object", fields: ["data"] } },
    ]);
    expect(JSON.stringify(warning.mock.calls)).not.toContain(key);
    expect(JSON.stringify(res.body)).not.toContain(key);
  });
});
