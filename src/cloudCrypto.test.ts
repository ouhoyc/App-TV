import { describe, it, expect } from "vitest";
import {
  createIdentity,
  encryptCloud,
  decryptCloud,
  openSecret,
  importIdentity,
  loginCredential,
  recoveryProof,
  hash,
} from "./cloudCrypto";
import { emptyVault, newClient } from "./model";
describe("Chiffrement des clientèles par destinataire", () => {
  it("autorise les deux associés et le propriétaire, exclut un autre revendeur et protège attribution/révision", async () => {
    const [a, b, owner, other] = await Promise.all(
      [
        "admin-one-strong",
        "admin-two-strong",
        "owner-password-strong",
        "other-password-strong",
      ].map(createIdentity),
    );
    const vault = emptyVault();
    const client = newClient();
    client.name = "Client confidentiel";
    client.subscriptions = [];
    vault.clients = [client];
    const payload = await encryptCloud(vault, "owner", 1, [
      { user_id: "owner", public_jwk: owner.jwk },
      { user_id: "admin-a", public_jwk: a.jwk },
      { user_id: "admin-b", public_jwk: b.jwk },
    ]);
    expect(JSON.stringify(payload)).not.toContain("confidentiel");
    for (const [id, key] of [
      ["owner", owner.privateKey],
      ["admin-a", a.privateKey],
      ["admin-b", b.privateKey],
    ] as const)
      expect(await decryptCloud(payload, "owner", 1, id, key)).toEqual(vault);
    await expect(
      decryptCloud(payload, "owner", 1, "other", other.privateKey),
    ).rejects.toThrow();
    await expect(
      decryptCloud(payload, "owner", 1, "owner", other.privateKey),
    ).rejects.toThrow();
    await expect(
      decryptCloud(payload, "another-owner", 1, "owner", owner.privateKey),
    ).rejects.toThrow();
    await expect(
      decryptCloud(payload, "owner", 2, "owner", owner.privateKey),
    ).rejects.toThrow();
    const raw = await openSecret(owner.recoveryBox, owner.code);
    const restored = await importIdentity(raw);
    expect(restored.extractable).toBe(false);
    expect(await decryptCloud(payload, "owner", 1, "owner", restored)).toEqual(
      vault,
    );
    await expect(openSecret(owner.passwordBox, "wrong")).rejects.toThrow();
    expect(await loginCredential("test@example.com", "password")).not.toBe(
      "password",
    );
    expect(await loginCredential("TEST@example.com", "password")).toBe(
      await loginCredential("test@example.com", "password"),
    );
    expect(await hash(await recoveryProof(owner.code))).toBe(
      owner.recoveryHash,
    );
  }, 30000);
});
