import { describe, it, expect, vi, afterEach } from "vitest";
import { validPushSubscription, sendNativePush } from "../lib/push.js";
import notifications from "../api/notifications.js";
import media from "../api/media.js";
import worker from "../api/push-worker.js";
const sub = {
  endpoint: "https://web.push.apple.com/test",
  keys: {
    p256dh: Buffer.alloc(65, 4).toString("base64url"),
    auth: Buffer.alloc(16, 1).toString("base64url"),
  },
};
const response = () => ({
  statusCode: 200,
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(n) {
    this.statusCode = n;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});
afterEach(() => vi.unstubAllEnvs());
describe("Notifications et images protégées", () => {
  it("refuse les endpoints arbitraires, locaux et clés malformées", () => {
    expect(validPushSubscription(sub)).toEqual(sub);
    for (const endpoint of [
      "http://web.push.apple.com/test",
      "https://127.0.0.1/test",
      "https://web.push.apple.com.attacker.test/p",
      "https://user:password@web.push.apple.com/test",
      "https://web.push.apple.com:1234/test",
    ]) {
      expect(() => validPushSubscription({ ...sub, endpoint })).toThrow();
    }
    expect(() =>
      validPushSubscription({
        ...sub,
        keys: { p256dh: "broken", auth: "bad" },
      }),
    ).toThrow();
  });
  it("utilise le vrai format Web Push et distingue acceptation et endpoint expiré", async () => {
    vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "public-test-key");
    vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "private-test-key");
    const sender = vi.fn(async () => ({ statusCode: 201 }));
    expect(
      await sendNativePush(sub, { title: "SCDR TV", body: "Rappel" }, sender),
    ).toBe(201);
    expect(sender.mock.calls[0][2]).toMatchObject({
      vapidDetails: {
        publicKey: "public-test-key",
        privateKey: "private-test-key",
      },
      urgency: "high",
      TTL: 3600,
    });
    expect(
      await sendNativePush(sub, {}, async () => {
        throw { statusCode: 410 };
      }),
    ).toBe(410);
    expect(
      await sendNativePush(sub, {}, async () => {
        throw new Error("network");
      }),
    ).toBe(0);
  });
  it("refuse images et réglages sans session et le worker sans capacité", async () => {
    for (const handler of [media, notifications]) {
      const res = response();
      await handler({ method: "GET", headers: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(res.headers["Cache-Control"]).toContain("no-store");
    }
    const res = response();
    await worker(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { ticket: "not-a-ticket" },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});
