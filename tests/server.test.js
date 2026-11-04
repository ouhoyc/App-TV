import { describe, it, expect, vi, afterEach } from "vitest";
import { prepare, cookie, ApiError } from "../lib/server.js";
import handler from "../api/account.js";
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
afterEach(() => vi.unstubAllEnvs());
describe("Frontière serveur des comptes", () => {
  it("refuse une écriture provenant d’une autre origine et les données de formulaire", () => {
    const r = response();
    expect(() =>
      prepare(
        {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "https://evil.example",
            "content-type": "application/json",
          },
        },
        r,
      ),
    ).toThrow(ApiError);
    expect(() =>
      prepare(
        {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "content-type": "application/x-www-form-urlencoded",
          },
        },
        r,
      ),
    ).toThrow(ApiError);
  });
  it("protège le cookie de session contre JavaScript et les envois intersites", () => {
    vi.stubEnv("VERCEL", "1");
    const r = response();
    cookie(r, { access_token: "access", refresh_token: "refresh" });
    expect(r.headers["Set-Cookie"]).toContain("HttpOnly; SameSite=Lax");
    expect(r.headers["Set-Cookie"]).toContain("; Secure");
    expect(r.headers["Set-Cookie"]).not.toContain("Domain=");
    cookie(r, null);
    expect(r.headers["Set-Cookie"]).toContain("Max-Age=0");
  });
  it("renvoie une absence de connexion sans exposer de jeton ou appeler la base", async () => {
    const r = response();
    await handler({ method: "GET", headers: {} }, r);
    expect(r.statusCode).toBe(401);
    expect(r.headers["Cache-Control"]).toContain("no-store");
    expect(JSON.stringify(r.body)).not.toContain("refresh_token");
  });
  it("répond au réveil HEAD sans lire de session ni de données", async () => {
    const r = response();
    let ended = false;
    r.end = () => {
      ended = true;
      return r;
    };
    await handler({ method: "HEAD", headers: {} }, r);
    expect(r.statusCode).toBe(204);
    expect(ended).toBe(true);
    expect(r.body).toBeUndefined();
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
});
