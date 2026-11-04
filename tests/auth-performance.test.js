import { describe, it, expect, vi, afterEach } from "vitest";
import { sessionClient } from "../lib/server.js";
const uid = "90000000-0000-4000-8000-000000000001";
const jwt = (expiry) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: uid,
        exp: expiry,
        role: "authenticated",
        aud: "authenticated",
      }),
    ).toString("base64url"),
    Buffer.alloc(32, 1).toString("base64url"),
  ].join(".");
const user = {
  id: uid,
  email: "test@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const response = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup({ active = true, refuse = false, expired = false } = {}) {
  vi.stubEnv("SUPABASE_URL", "https://auth-fixture.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "fixture-publishable-key");
  const urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      urls.push(url.pathname);
      if (url.pathname === "/auth/v1/user")
        return new Response(
          JSON.stringify(refuse ? { message: "Invalid token" } : user),
          {
            status: refuse ? 401 : 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      if (url.pathname === "/auth/v1/token")
        return new Response(
          JSON.stringify({
            access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
            refresh_token: "refreshed-test-token",
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      if (url.pathname === "/rest/v1/app_tv_profiles")
        return new Response(
          JSON.stringify([{ id: uid, active, role: "admin" }]),
          { headers: { "Content-Type": "application/json" } },
        );
      throw new Error("Unexpected auth fixture path");
    }),
  );
  const req = {
    headers: {
      cookie:
        "app_tv_session=" +
        Buffer.from(
          JSON.stringify({
            access_token: jwt(
              Math.floor(Date.now() / 1000) + (expired ? -100 : 3600),
            ),
            refresh_token: "test-refresh-token",
          }),
        ).toString("base64url"),
    },
  };
  return { req, urls };
}
describe("Connexion rapide avec vérification serveur", () => {
  it("vérifie un JWT auprès du serveur Auth une seule fois puis vérifie le profil actif", async () => {
    const { req, urls } = setup();
    const result = await sessionClient(req, response());
    expect(result.user.id).toBe(uid);
    expect(urls.filter((u) => u === "/auth/v1/user")).toHaveLength(1);
    expect(urls.filter((u) => u === "/rest/v1/app_tv_profiles")).toHaveLength(
      1,
    );
  });
  it("refuse un jeton non accepté par Auth sans lire le profil", async () => {
    const { req, urls } = setup({ refuse: true });
    await expect(sessionClient(req, response())).rejects.toMatchObject({
      status: 401,
    });
    expect(urls).not.toContain("/rest/v1/app_tv_profiles");
  });
  it("revérifie la suspension en base malgré un JWT valide", async () => {
    const { req } = setup({ active: false });
    await expect(sessionClient(req, response())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rafraîchit un JWT expiré via Auth et utilise le nouveau cookie", async () => {
    const { req, urls } = setup({ expired: true }),
      res = response();
    await sessionClient(req, res);
    expect(urls.filter((u) => u === "/auth/v1/token")).toHaveLength(1);
    expect(urls.filter((u) => u === "/auth/v1/user")).toHaveLength(0);
    expect(res.headers["Set-Cookie"]).toContain("HttpOnly");
  });
});
