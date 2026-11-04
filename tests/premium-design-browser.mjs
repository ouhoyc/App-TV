import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { encryptProviderReceipt } from "../lib/providerOperations.js";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
async function actor(role) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.setItem("app-tv-theme-v1", "light");
    Object.defineProperty(navigator, "standalone", { value: true });
    const sub = {
      endpoint: "https://web.push.apple.com/test",
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "mock-key", auth: "mock-auth" },
        };
      },
      async unsubscribe() {
        return true;
      },
    };
    class MockNotification {
      static permission = "default";
      static async requestPermission() {
        this.permission = "granted";
        return "granted";
      }
    }
    Object.defineProperty(window, "Notification", {
      value: MockNotification,
      configurable: true,
    });
    window.PushManager = class {};
    let active = false;
    const registration = {
      pushManager: {
        async getSubscription() {
          return active ? sub : null;
        },
        async subscribe() {
          active = true;
          return sub;
        },
      },
    };
    const worker = new EventTarget();
    worker.ready = Promise.resolve(registration);
    worker.getRegistration = async () => registration;
    Object.defineProperty(navigator, "serviceWorker", {
      value: worker,
      configurable: true,
    });
    navigator.canShare = () => true;
    navigator.share = async (value) => {
      window.__sharedFiles = value.files.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
      }));
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 59, bottom: 34 },
  });
  let fixture,
    signedIn = true;
  const providerCalls = [],
    pushCalls = [],
    mediaRows = [];
  let mediaFullReads = 0;
  const mutationCalls = [],
    operations = [];
  let vendorExpiry = "2027-10-29",
    vendorEnabled = true,
    unknownNext = false;
  await page.route("**/api/**", async (route) => {
    if (!fixture || !signedIn)
      return route.fulfill({
        status: 401,
        json: { error: "Connexion requise." },
      });
    const body =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : null;
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/api/notifications") {
      pushCalls.push(body || { action: "config" });
      return route.fulfill({
        json:
          body?.action === "subscribe"
            ? { id: "mock-push" }
            : body
              ? { ok: true, sent: true }
              : {
                  configured: true,
                  publicKey: Buffer.alloc(65, 4).toString("base64url"),
                },
      });
    }
    if (requestUrl.pathname === "/api/media") {
      if (body?.action === "upload") {
        assert(!JSON.stringify(body.payload).includes("publicite-test"));
        const row = {
          id: crypto.randomUUID(),
          owner_id: body.ownerId,
          created_at: new Date().toISOString(),
          payload: body.payload,
          thumbnail: body.thumbnail,
          category: body.category || "ads",
        };
        mediaRows.push(row);
        return route.fulfill({ json: row });
      }
      if (["thumbnail", "category"].includes(body?.action)) {
        const row = mediaRows.find((r) => r.id === body.id);
        if (body.action === "thumbnail") row.thumbnail = body.thumbnail;
        else row.category = body.category;
        return route.fulfill({ json: row });
      }
      if (body?.action === "delete") {
        mediaRows.splice(
          mediaRows.findIndex((r) => r.id === body.id),
          1,
        );
        return route.fulfill({ json: { ok: true } });
      }
      const id = requestUrl.searchParams.get("id");
      if (id) mediaFullReads++;
      return route.fulfill({
        json: id
          ? mediaRows.find((r) => r.id === id)
          : {
              images: mediaRows
                .filter(
                  (r) =>
                    !requestUrl.searchParams.get("category") ||
                    (r.category || "ads") ===
                      requestUrl.searchParams.get("category"),
                )
                .map(({ payload, ...r }) => r),
            },
      });
    }
    if (requestUrl.pathname === "/api/provider") {
      assert.equal(route.request().method(), "POST");
      assert.equal(new URL(route.request().url()).search, "");
      if (body.action === "presence")
        return route.fulfill({
          json: {
            items: body.items.map((item) => ({
              id: item.id,
              online: item.username === "fixture-existing",
              connections: item.username === "fixture-existing" ? 1 : 0,
              watching:
                item.username === "fixture-existing" ? ["Chaîne de test"] : [],
            })),
            checkedAt: new Date().toISOString(),
          },
        });
      if (body.action === "packages")
        return route.fulfill({
          json: { packages: [{ id: "132", name: "Bouquet de test" }] },
        });
      if (body.action === "device")
        return route.fulfill({
          json: {
            device: {
              type: body.type,
              username: body.username || "",
              password: body.password || "",
              mac: body.mac || "",
              userId: "5000",
              expires: vendorExpiry,
              enabled: vendorEnabled,
              server: "http://fixture.invalid",
              m3u: "",
              country: "FR",
              notes: "",
            },
          },
        });
      if (body.action === "history")
        return route.fulfill({
          json: {
            operations: operations.filter(
              (op) => !["applied", "resolved"].includes(op.state),
            ),
          },
        });
      if (body.action === "receipt")
        return route.fulfill({
          json: {
            operation: operations.find((op) => op.id === body.operationId),
          },
        });
      if (["ack", "resolve"].includes(body.action)) {
        assert.equal(body.confirmed, true);
        operations.find((op) => op.id === body.operationId).state =
          body.action === "ack" ? "applied" : "resolved";
        return route.fulfill({ json: { ok: true } });
      }
      if (["create", "renew", "status"].includes(body.action)) {
        assert.equal(body.confirmed, true);
        assert(!JSON.stringify(body.contextBox).includes("Léa Martin"));
        mutationCalls.push(body);
        if (body.action === "renew") vendorExpiry = "2028-01-29";
        if (body.action === "status") vendorEnabled = body.enabled;
        const device = {
          type: body.type,
          username:
            body.action === "create"
              ? "fixture-created-user"
              : body.username || "",
          password:
            body.action === "create"
              ? "fixture-created-secret"
              : body.password || "",
          mac: body.mac || "",
          userId: "5000",
          expires: body.action === "create" ? "2027-10-29" : vendorExpiry,
          enabled: vendorEnabled,
          server: "http://fixture.invalid",
          m3u:
            body.action === "create"
              ? "http://fixture.invalid/get.php?username=fixture-created-user&password=fixture-created-secret"
              : "",
          country: "FR",
          notes: "",
        };
        const receipt = {
          action: body.action,
          confirmed: true,
          device,
          before: null,
          months: body.months || null,
          enabled: body.action === "status" ? body.enabled : null,
          needsSync: false,
          completedAt: new Date().toISOString(),
        };
        const op = {
          id: body.operationId,
          owner_id: body.ownerId,
          client_id: body.clientId,
          action: body.action,
          state: unknownNext ? "uncertain" : "succeeded",
          context_box: body.contextBox,
          result_box: unknownNext
            ? null
            : await encryptProviderReceipt(
                receipt,
                body.operationId,
                fixture.keys.filter((k) => k.user_id !== "reseller-test"),
              ),
          error_code: unknownNext ? "OUTCOME_UNKNOWN" : null,
          created_at: new Date().toISOString(),
        };
        unknownNext = false;
        operations.push(op);
        return route.fulfill({ json: { operation: op } });
      }
      assert.equal(body.action, "test");
      providerCalls.push(body);
      return route.fulfill(
        [
          "fixture-valid-key",
          "fixture-second-key",
          "fixture-partial-key",
        ].includes(body.key)
          ? {
              json: {
                name:
                  body.key === "fixture-partial-key"
                    ? null
                    : "Compte de démonstration",
                credits:
                  body.key === "fixture-partial-key"
                    ? null
                    : body.key === "fixture-second-key"
                      ? 7
                      : 20.5,
                enabled: body.key === "fixture-partial-key" ? null : true,
              },
            }
          : {
              status: 422,
              json: {
                error:
                  "Le fournisseur a refusé la connexion. Vérifiez votre clé API.",
              },
            },
      );
    }
    if (body?.action === "invite") {
      assert.equal(role, "admin");
      fixture.invitations.push({
        id: "new-invite",
        role: "reseller",
        email: body.email,
        display_name: body.name,
      });
      return route.fulfill({
        json: { invitation: "a".repeat(64), email: body.email },
      });
    }
    if (body?.action === "save") {
      assert(!JSON.stringify(body).includes("fixture-valid-key"));
      assert(!JSON.stringify(body).includes("fixture-second-key"));
      for (const change of body.changes) {
        const row = fixture.vaults.find((v) => v.owner_id === change.owner_id);
        assert.equal(row.revision, change.expected_revision);
        row.payload = change.payload;
        row.revision++;
      }
      return route.fulfill({
        json: {
          revisions: fixture.vaults.map((v) => ({
            owner_id: v.owner_id,
            revision: v.revision,
          })),
        },
      });
    }
    if (body?.action === "set-active") {
      assert.equal(role, "admin");
      fixture.profiles.find((p) => p.id === body.user_id).active = body.active;
      return route.fulfill({ json: { ok: true } });
    }
    if (body?.action === "logout") {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith("/account")
        ? { profile: fixture.profile }
        : fixture,
    });
  });
  await page.goto("http://localhost:5173");
  fixture = await page.evaluate(async (role) => {
    const crypto = await import("/src/cloudCrypto.ts");
    const model = await import("/src/model.ts");
    const identity = await crypto.createIdentity("Design-test-password!");
    const profile = {
      id: role + "-test",
      email: role + "@exemple.invalid",
      display_name: "Alex Martin",
      active: true,
      role,
    };
    const admin = { ...profile, id: "admin-test", role: "admin" };
    const partner = { ...admin, id: "partner-test", display_name: "Associé" };
    const reseller = {
      ...profile,
      id: "reseller-test",
      role: "reseller",
      email: "reseller@exemple.invalid",
      display_name: "Camille",
    };
    const profiles =
      role === "admin" ? [profile, partner, reseller] : [profile];
    const keys = ["admin-test", "partner-test", "reseller-test"].map(
      (user_id) => ({ user_id, public_jwk: identity.jwk }),
    );
    const vault = model.emptyVault();
    vault.provider = {
      url: "https://8k.online-cms.ru/api/api.php",
      key: "fixture-valid-key",
    };
    vault.clients = ["Léa Martin", "Marc Dubois", "Sami Karim"].map(
      (name, i) => {
        const client = model.newClient();
        client.name = name;
        if (i === 0) {
          client.notes = "Note client historique";
          client.subscriptions[0].notes = "Note abonnement historique";
        }
        client.subscriptions[0].provider = i === 1 ? "Standard" : "Premium";
        client.subscriptions[0].expires =
          i === 2 ? model.addMonths(model.today(), 1) : model.today();
        return client;
      },
    );
    return {
      profile,
      profiles,
      keys,
      invitations: [],
      keyring: {
        password_envelope: identity.passwordBox,
        recovery_envelope: identity.recoveryBox,
      },
      vaults: [
        {
          owner_id: profile.id,
          revision: 1,
          updated_at: new Date().toISOString(),
          payload: await crypto.encryptCloud(vault, profile.id, 1, keys),
        },
      ],
    };
  }, role);
  await page.reload();
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(
    await page.getByRole("button", { name: /mode (jour|nuit)/i }).count(),
    0,
  );
  await page
    .getByLabel("Mot de passe de déverrouillage")
    .fill("Design-test-password!");
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("heading", { name: "Accueil" }).waitFor();
  return {
    page,
    context,
    providerCalls,
    pushCalls,
    mediaRows,
    mediaFullReads: () => mediaFullReads,
    mutationCalls,
    failNext: () => {
      unknownNext = true;
    },
  };
}
try {
  const {
    page,
    context,
    providerCalls,
    pushCalls,
    mediaRows,
    mediaFullReads,
    mutationCalls,
    failNext,
  } = await actor("admin");
  const tabs = page.getByRole("navigation", { name: "Navigation principale" });
  const clientele = page.getByLabel("Clientèle affichée");
  assert.equal(await clientele.inputValue(), "shared");
  const choices = await clientele.locator("option").allTextContents();
  assert(choices.includes("Notre clientèle"));
  assert(!choices.includes("Associé"));
  assert(!choices.includes("Ma clientèle"));
  assert(choices.includes("Camille"));
  await clientele.focus();
  assert.equal(
    await clientele.evaluate((el) => getComputedStyle(el).outlineStyle),
    "none",
  );
  assert.equal(await clientele.evaluate((el) => el.tagName), "SELECT");
  assert.deepEqual(await tabs.getByRole("button").allTextContents(), [
    "Accueil",
    "Clients",
    "Revendeurs",
    "Expirations",
    "Bilan",
    "Médias",
  ]);
  assert.equal(
    await page.getByText("admin@exemple.invalid", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("button", { name: /^Face ID/ }).count(), 0);
  assert.equal(await page.locator(".activity-number").textContent(), "3");
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/app-tv-aura-carbon-home.png",
  });
  await page
    .getByRole("button", { name: "Voir les clients", exact: true })
    .click();
  await page.getByRole("heading", { name: "Clients", exact: true }).waitFor();
  await tabs.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .getByRole("heading", { name: "Paramètres", exact: true })
    .waitFor();
  await page.getByText("admin@exemple.invalid", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Face ID/ }).waitFor();
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .waitFor();
  assert.equal(await page.getByText("Apparence", { exact: true }).count(), 0);
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/app-tv-aura-carbon-settings.png",
  });
  await page
    .getByLabel("Lien du site du panel")
    .fill("https://panel.example.invalid/");
  await page
    .getByRole("button", { name: "Enregistrer le lien", exact: true })
    .click();
  await page.getByText("Lien enregistré.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Ouvrir le site du panel", exact: true })
      .getAttribute("href"),
    "https://panel.example.invalid/",
  );
  await page.getByRole("button", { name: /Connexion fournisseur/ }).click();
  const provider = page.getByRole("dialog");
  assert.equal(
    await provider.getByLabel("Adresse HTTPS de l’API").inputValue(),
    "https://8k.online-cms.ru/api/api.php",
  );
  assert.equal(
    await provider.getByLabel("Clé API personnelle").inputValue(),
    "fixture-valid-key",
  );
  await provider
    .getByLabel("Clé API personnelle")
    .fill(
      "https://8k.online-cms.ru/api/api.php?action=new&api_key=fixture-valid-key",
    );
  await provider
    .getByRole("button", { name: "Tester la connexion", exact: true })
    .click();
  await provider.getByText("Connexion réussie", { exact: true }).waitFor();
  await provider.getByText(/Crédits : 20,5/).waitFor();
  assert.equal(providerCalls.at(-1).key, "fixture-valid-key");
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/scdr-provider-test.png",
  });
  await provider.getByLabel("Clé API personnelle").fill("fixture-wrong-key");
  assert.equal(
    await provider.getByText("Connexion réussie", { exact: true }).count(),
    0,
  );
  await provider
    .getByRole("button", { name: "Tester la connexion", exact: true })
    .click();
  await provider
    .getByRole("alert")
    .filter({ hasText: "Le fournisseur a refusé" })
    .waitFor();
  assert.equal(providerCalls.length, 2);
  await provider.getByLabel("Clé API personnelle").fill("fixture-partial-key");
  await provider
    .getByRole("button", { name: "Tester la connexion", exact: true })
    .click();
  await provider.getByText("Connexion réussie", { exact: true }).waitFor();
  await provider.getByText(/Crédits : Non communiqués/).waitFor();
  await provider.getByText(/État du compte : non communiqué/).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/scdr-provider-partial.png",
  });
  await provider.getByLabel("Clé API personnelle").fill("fixture-valid-key");
  await provider.getByLabel("Nom du panel").fill("Diogo");
  await provider.getByLabel("Prix d’achat annuel (€)").fill("20");
  await provider.getByLabel("Panel à configurer").selectOption("1");
  assert.equal(
    await provider.getByLabel("Clé API personnelle").inputValue(),
    "",
  );
  assert.equal(
    await provider.getByText("Connexion réussie", { exact: true }).count(),
    0,
  );
  await provider.getByLabel("Nom du panel").fill("Poyeland");
  await provider.getByLabel("Prix d’achat annuel (€)").fill("25");
  await provider.getByLabel("Clé API personnelle").fill("fixture-second-key");
  await provider
    .getByRole("button", { name: "Tester la connexion", exact: true })
    .click();
  await provider.getByText(/Crédits : 7/).waitFor();
  assert.equal(providerCalls.at(-1).key, "fixture-second-key");
  await provider.getByLabel("Panel à configurer").selectOption("0");
  assert.equal(
    await provider.getByLabel("Clé API personnelle").inputValue(),
    "fixture-valid-key",
  );
  await provider
    .getByRole("button", { name: "Tester la connexion", exact: true })
    .click();
  await provider.getByText(/Crédits : 20,5/).waitFor();
  await provider.getByLabel("Panel à configurer").selectOption("1");
  await provider.getByText(/Crédits : 7/).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/scdr-two-panels.png",
  });
  await provider
    .getByRole("button", { name: "Enregistrer les deux panels" })
    .click();
  await provider.waitFor({ state: "hidden" });
  await page.reload();
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await page
    .getByLabel("Mot de passe de déverrouillage")
    .fill("Design-test-password!");
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("heading", { name: "Accueil" }).waitFor();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByRole("button", { name: /Connexion fournisseur/ }).click();
  assert.equal(
    await provider.getByLabel("Clé API personnelle").inputValue(),
    "fixture-valid-key",
  );
  await provider.getByLabel("Panel à configurer").selectOption("1");
  assert.equal(
    await provider.getByLabel("Clé API personnelle").inputValue(),
    "fixture-second-key",
  );
  assert.equal(
    await provider.getByLabel("Nom du panel").inputValue(),
    "Poyeland",
  );
  await provider.getByRole("button", { name: /Fermer/ }).click();
  await tabs.getByRole("button", { name: "Revendeurs", exact: true }).click();
  await page.getByRole("heading", { name: "Revendeurs" }).waitFor();
  await page.getByLabel("Nom du sous-revendeur").fill("Nouveau partenaire");
  await page.getByLabel("Email du sous-revendeur").fill("new@exemple.invalid");
  await page.getByRole("button", { name: "Créer son invitation" }).click();
  await page.getByLabel("Lien d’invitation").waitFor();
  assert(
    (await page.getByLabel("Lien d’invitation").inputValue()).includes(
      "#invitation=",
    ),
  );
  await page.getByRole("heading", { name: "Revendeurs" }).waitFor();
  await page.getByRole("button", { name: "Suspendre", exact: true }).click();
  await page.getByRole("button", { name: "Réactiver", exact: true }).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/app-tv-aura-carbon-resellers.png",
  });
  await tabs.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByText("Léa Martin", { exact: true }).waitFor();
  const leaCard = page
    .locator(".customer-card")
    .filter({ hasText: "Léa Martin" });
  await leaCard
    .getByRole("button", { name: "Copier le mot de passe de Léa Martin" })
    .waitFor();
  await leaCard
    .getByRole("button", { name: "Copier le lien de Léa Martin" })
    .waitFor();
  assert.equal(await leaCard.locator(".customer-line").count(), 0);
  await leaCard
    .getByRole("button", { name: "Copier les accès de Léa Martin" })
    .waitFor();
  assert.equal(await page.locator(".customer-card .avatar").count(), 0);
  await page
    .getByRole("button", {
      name: "Non réglé : Léa Martin. Marquer comme réglé",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Non réglé : Léa Martin. Marquer comme réglé",
      exact: true,
    })
    .waitFor({ state: "hidden" });
  await page.screenshot({
    path: "/tmp/scdr-customer-table.png",
    animations: "disabled",
  });
  await page.getByText("Léa Martin", { exact: true }).click();
  await page
    .getByRole("button", { name: "Modifier le client", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  assert.equal(await editor.getByLabel("Panel Strong 8K").inputValue(), "");
  await editor
    .getByLabel("Panel Strong 8K")
    .selectOption({ label: "Poyeland" });
  await editor.getByLabel("Pseudo", { exact: false }).fill("fixture-existing");
  assert.equal(
    await editor.getByLabel("Prix d’achat (€)", { exact: true }).inputValue(),
    "25.00",
  );
  assert(
    await editor
      .getByLabel("Prix d’achat (€)", { exact: true })
      .evaluate((el) => el.readOnly),
  );
  assert.equal(await editor.getByLabel("Type de connexion").count(), 0);
  assert.equal(await editor.getByLabel("Lien M3U complet").count(), 0);
  assert.equal(
    await editor.getByLabel("Identifiant", { exact: true }).count(),
    0,
  );
  assert.equal(await editor.locator("textarea").count(), 1);
  assert.equal(
    await editor
      .getByRole("button", { name: "Ajouter un abonnement", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await editor
      .getByLabel("Mot de passe", { exact: true })
      .getAttribute("type"),
    "text",
  );
  await editor
    .getByLabel("Lien du serveur", { exact: true })
    .fill("fixture.invalid");
  assert(
    (await editor.getByLabel("Notes", { exact: true }).inputValue()).includes(
      "Note client historique",
    ),
  );
  assert(
    (await editor.getByLabel("Notes", { exact: true }).inputValue()).includes(
      "Note abonnement historique",
    ),
  );
  await editor
    .getByLabel("Notes", { exact: true })
    .fill("Une seule note à conserver");
  await editor
    .getByLabel("Mot de passe", { exact: true })
    .fill("fixture-existing-secret");
  await editor
    .getByRole("button", { name: "Enregistrer la fiche", exact: true })
    .click();
  await editor.waitFor({ state: "hidden" });
  assert(
    await page
      .getByRole("button", { name: "fixture-existing", exact: true })
      .evaluate((el) => el.classList.contains("panel-poyeland")),
  );
  await page.getByText("fixture-existing", { exact: true }).click();
  await page.getByText("Panel : Poyeland", { exact: true }).waitFor();
  const detail = page.getByRole("dialog");
  await detail.getByText("fixture-existing-secret", { exact: true }).waitFor();
  await detail.getByText("https://fixture.invalid/", { exact: true }).waitFor();
  assert.equal(
    await detail.getByRole("button", { name: /Afficher/ }).count(),
    0,
  );
  assert.equal(await detail.getByRole("link").count(), 0);
  assert.equal(
    await detail
      .getByText("Une seule note à conserver", { exact: true })
      .count(),
    1,
  );
  await page.screenshot({
    path: "/tmp/scdr-client-readable.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Actualiser depuis le panel", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Consulter cet abonnement dans le panel",
      exact: true,
    })
    .click();
  await page.getByLabel("Expiration reçue du fournisseur").waitFor();
  assert.equal(
    await page.getByLabel("Expiration reçue du fournisseur").inputValue(),
    "2027-10-29",
  );
  await page
    .getByRole("button", {
      name: "Enregistrer le résultat dans la fiche",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(mutationCalls.length, 0);
  await page.getByText("fixture-existing", { exact: true }).click();
  await page.getByRole("button", { name: "Renouveler", exact: true }).click();
  await page.getByLabel("Durée chez le fournisseur").selectOption("3");
  await page.getByLabel("Prix de vente (€)", { exact: true }).fill("30");
  await page.getByLabel("Prix d’achat (€)", { exact: true }).fill("6.25");
  const renewButton = page.getByRole("button", {
    name: "Confirmer le renouvellement de 3 mois",
    exact: true,
  });
  assert(await renewButton.isDisabled());
  await page
    .getByRole("button", {
      name: "Consulter cet abonnement dans le panel",
      exact: true,
    })
    .click();
  await page.getByLabel(/Je confirme cette action/).check();
  await renewButton.scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/scdr-provider-confirm-renew.png",
  });
  await renewButton.evaluate((el) => {
    el.click();
    el.click();
  });
  await page
    .getByText("Action confirmée par le fournisseur", { exact: true })
    .waitFor();
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0].key, "fixture-second-key");
  assert.equal(mutationCalls[0].months, 3);
  assert.equal(
    await page.getByLabel("Expiration reçue du fournisseur").inputValue(),
    "2028-01-29",
  );
  await page
    .getByRole("button", {
      name: "Enregistrer le résultat dans la fiche",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("fixture-existing", { exact: true }).click();
  await page
    .getByRole("button", { name: "Suspendre chez le fournisseur", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Consulter cet abonnement dans le panel",
      exact: true,
    })
    .click();
  await page.getByLabel(/Je confirme cette action/).check();
  await page
    .getByRole("button", { name: "Confirmer la suspension", exact: true })
    .click();
  await page
    .getByText("Action confirmée par le fournisseur", { exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Enregistrer le résultat dans la fiche",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(mutationCalls.length, 2);
  assert.equal(mutationCalls[1].enabled, false);
  await page.getByText("fixture-existing", { exact: true }).click();
  await page
    .getByRole("button", { name: "Activer chez le fournisseur", exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Créer l’abonnement dans un panel Strong 8K",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Nom du client", { exact: true })
    .fill("Client créé via panel");
  await page
    .getByLabel("Panel fournisseur", { exact: true })
    .selectOption({ label: "Diogo" });
  await page
    .getByRole("button", {
      name: "Charger les bouquets de ce panel",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Bouquet fournisseur", { exact: true })
    .selectOption("132");
  await page.getByLabel("Prix de vente (€)", { exact: true }).fill("80");
  await page.getByLabel("Prix d’achat (€)", { exact: true }).fill("20");
  await page.getByLabel(/Je confirme cette action/).check();
  await page
    .getByRole("button", { name: "Confirmer la création", exact: true })
    .click();
  await page
    .getByText("Action confirmée par le fournisseur", { exact: true })
    .waitFor();
  assert.equal(mutationCalls.length, 3);
  assert.equal(mutationCalls[2].key, "fixture-valid-key");
  await page
    .getByRole("button", {
      name: "Enregistrer le résultat dans la fiche",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("fixture-created-user", { exact: true }).waitFor();
  await page.getByText("fixture-existing", { exact: true }).click();
  await page.getByRole("button", { name: "Renouveler", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Consulter cet abonnement dans le panel",
      exact: true,
    })
    .click();
  await page.getByLabel(/Je confirme cette action/).check();
  failNext();
  await page
    .getByRole("button", { name: /Confirmer le renouvellement/ })
    .click();
  await page.getByText(/Le résultat reste à vérifier/).waitFor();
  await page
    .getByRole("button", {
      name: "Rechercher le résultat enregistré",
      exact: true,
    })
    .click();
  assert.equal(mutationCalls.length, 4);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .getByRole("button", { name: /Opérations fournisseur à reprendre/ })
    .click();
  await page.getByRole("button", { name: "Reprendre", exact: true }).click();
  await page.getByText(/Le résultat reste à vérifier/).waitFor();
  await page
    .getByRole("button", {
      name: "Vérifier l’abonnement dans le panel",
      exact: true,
    })
    .click();
  await page.getByLabel(/J’ai vérifié le résultat directement/).check();
  await page
    .getByRole("button", {
      name: "Clôturer après vérification manuelle",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(mutationCalls.length, 4);
  await tabs.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByText("fixture-existing", { exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await tabs.getByRole("button", { name: "Expirations", exact: true }).click();
  assert.equal(await page.locator(".account-bar").count(), 0);
  await page.getByRole("heading", { name: "À prolonger" }).waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await tabs.getByRole("button", { name: "Clients", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await page.getByLabel("Pseudo").fill("Test24h Snap");
  await page.getByLabel("Plateforme de contact").selectOption("Snapchat");
  await page.getByLabel("Contact", { exact: true }).fill("@test24h");
  await page.getByLabel("Application utilisée").selectOption("IBO Player");
  await page.getByLabel("Durée de l’abonnement").selectOption("trial24");
  const trialStart = new Date(Date.now() - 86400000).toISOString().slice(0, 16);
  await page.getByLabel("Début du test 24 h").fill(trialStart);
  assert(
    await page.getByLabel("Date d’expiration").evaluate((el) => el.readOnly),
  );
  assert.equal(
    await page.getByLabel("Prix de vente (€)", { exact: true }).inputValue(),
    "0",
  );
  await page
    .getByRole("button", { name: "Enregistrer la fiche", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const trialRow = page
    .locator(".customer-card")
    .filter({ hasText: "Test24h Snap" });
  await trialRow.getByText("Test 24 h", { exact: true }).waitFor();
  await trialRow.getByText("IBO Player", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".customer-card")
      .first()
      .getByRole("button", { name: "Test24h Snap", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await trialRow
      .getByRole("link", { name: "@test24h", exact: true })
      .getAttribute("href"),
    "https://www.snapchat.com/add/test24h",
  );
  await tabs.getByRole("button", { name: "Expirations", exact: true }).click();
  assert.equal(await page.locator(".account-bar").count(), 0);
  await page.getByText("Test24h Snap", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/scdr-trial-followup.png",
    animations: "disabled",
  });
  await tabs.getByRole("button", { name: "Accueil", exact: true }).click();
  await page
    .getByRole("button", { name: "Voir les clients en ligne", exact: true })
    .click();
  const live = page.getByRole("dialog", { name: "Clients en ligne" });
  await live.getByText("Chaîne de test", { exact: true }).waitFor();
  await live.getByText("En ligne", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/scdr-live-clients.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Fermer les connexions", exact: true })
    .click();
  await tabs.getByRole("button", { name: "Bilan", exact: true }).click();
  await page.getByRole("heading", { name: "Bilan", exact: true }).waitFor();
  assert.equal(
    await page.locator(".financial-cards .financial-card").count(),
    2,
  );
  assert.deepEqual(
    await page.locator(".financial-card > span").allTextContents(),
    ["Bénéfice", "Bénéfice / mois"],
  );
  const firstBalance = await page
      .locator(".financial-card")
      .nth(0)
      .boundingBox(),
    secondBalance = await page.locator(".financial-card").nth(1).boundingBox();
  assert(firstBalance.width > firstBalance.height * 2);
  assert(secondBalance.y >= firstBalance.y + firstBalance.height);
  assert.equal(await page.locator(".account-bar").count(), 0);
  assert.equal(await page.getByText(/Équivalent mensuel/).count(), 0);
  await page.screenshot({
    path: "/tmp/scdr-financial-summary.png",
    animations: "disabled",
  });
  await tabs.getByRole("button", { name: "Médias", exact: true }).click();
  assert.equal(await page.locator(".account-bar").count(), 0);
  assert.equal(await page.locator(".panel-shortcuts").count(), 0);
  assert.equal(
    await page
      .getByRole("link", { name: "Ouvrir le site du panel", exact: true })
      .getAttribute("href"),
    "https://panel.example.invalid/",
  );
  const picture = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 900;
    const g = c.getContext("2d");
    g.fillStyle = "#101315";
    g.fillRect(0, 0, 600, 900);
    g.fillStyle = "#f4f6fa";
    g.font = "bold 72px sans-serif";
    g.fillText("SCDR TV", 100, 430);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Ajouter une publicité").setInputFiles({
    name: "publicite-test.png",
    mimeType: "image/png",
    buffer: Buffer.from(picture, "base64"),
  });
  await page.getByRole("img", { name: "publicite-test.jpg" }).waitFor();
  assert.equal(mediaRows.length, 1);
  assert(JSON.stringify(mediaRows[0].payload).length < 3100000);
  await page
    .getByRole("button", { name: "Ouvrir publicite-test.jpg", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Visionneuse de photos" }).waitFor();
  await page.getByRole("button", { name: "Partager", exact: true }).click();
  await page.waitForFunction(() => window.__sharedFiles?.length === 1);
  assert((await page.evaluate(() => window.__sharedFiles[0].size)) < 1450000);
  await page
    .getByRole("button", { name: "Fermer la photo", exact: true })
    .click();
  await page.locator(".main-shell").evaluate((el) => (el.scrollTop = 0));
  assert(
    (await page.locator(".photo-thumb").first().boundingBox()).height < 140,
  );
  await page.screenshot({
    path: "/tmp/scdr-media-library.png",
    animations: "disabled",
  });
  const inputBytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 2400;
    const ctx = canvas.getContext("2d"),
      pixels = ctx.createImageData(2400, 2400);
    let seed = 1234567;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], "grande-photo.png", { type: "image/png" }),
    );
    const field = document.querySelector(
      'input[aria-label="Ajouter une publicité"]',
    );
    field.files = transfer.files;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  assert(inputBytes > 12 * 1024 * 1024);
  await page
    .getByRole("img", { name: "grande-photo.jpg", exact: true })
    .waitFor();
  assert.equal(mediaRows.length, 2);
  assert(
    mediaRows.every((row) => JSON.stringify(row.thumbnail).length < 115000),
  );
  await page
    .getByRole("button", { name: "Ouvrir grande-photo.jpg", exact: true })
    .click();
  const viewer = page.getByRole("dialog", { name: "Visionneuse de photos" });
  await viewer.waitFor();
  await viewer
    .locator(".photo-viewer-strip")
    .evaluate((el) =>
      el.scrollTo({ left: el.clientWidth, behavior: "instant" }),
    );
  await viewer.getByText("2 / 2", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/scdr-photo-viewer.png",
    animations: "disabled",
  });
  await viewer.getByLabel("Catégorie de la photo").selectOption("tutorials");
  await page
    .getByRole("button", { name: "Fermer la photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Tutos", exact: true }).click();
  await page
    .getByRole("button", { name: "Ouvrir publicite-test.jpg", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Publicités", exact: true }).click();
  await page
    .getByRole("button", { name: "Ouvrir grande-photo.jpg", exact: true })
    .waitFor();

  assert(JSON.stringify(mediaRows[1].payload).length < 3100000);
  await page
    .getByRole("button", { name: "Ajouter des photos", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await page
    .getByLabel("Mot de passe de déverrouillage")
    .fill("Design-test-password!");
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("heading", { name: "Accueil", exact: true }).waitFor();
  await tabs.getByRole("button", { name: "Médias", exact: true }).click();
  assert.equal(await page.locator(".account-bar").count(), 0);
  await page.getByRole("img", { name: "grande-photo.jpg" }).waitFor();
  assert.equal(
    mediaFullReads(),
    0,
    "A thumbnail grid must not download full-size photos",
  );
  await page
    .getByRole("button", { name: "Ouvrir grande-photo.jpg", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Visionneuse de photos" })
    .getByRole("button", { name: "Partager", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector(".photo-viewer-actions .primary").disabled,
  );
  assert.equal(
    mediaFullReads(),
    0,
    "Previously opened full photos must come from the encrypted device cache",
  );
  await page
    .getByRole("button", { name: "Fermer la photo", exact: true })
    .click();
  const legacy = {
    ...mediaRows.find((r) => r.category === "ads"),
    id: crypto.randomUUID(),
    category: "tutorials",
    thumbnail: null,
  };
  mediaRows.push(legacy);
  const migration = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    try {
      const b = response.request().postDataJSON();
      return b.action === "thumbnail" && b.id === legacy.id;
    } catch {
      return false;
    }
  });
  await page.getByRole("button", { name: "Tutos", exact: true }).click();
  await migration;
  assert(
    legacy.thumbnail,
    "Old images should acquire encrypted thumbnails automatically",
  );
  assert.equal(
    mediaFullReads(),
    1,
    "Only a legacy image without a thumbnail needs one initial full download",
  );
  console.log(
    JSON.stringify({
      galleryFullDownloadsBeforeOpening: 0,
      cachedPhotoExtraDownloads: 0,
      legacyPhotoMigrationDownloads: 1,
    }),
  );
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .getByRole("button", { name: "Activer les notifications", exact: true })
    .click();
  await page
    .getByText("Notifications activées sur cet appareil.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Tester une notification", exact: true })
    .click();
  await page.getByText(/Notification de test envoyée/).waitFor();
  assert(pushCalls.some((c) => c.action === "subscribe"));
  assert(pushCalls.some((c) => c.action === "test"));
  assert(pushCalls.some((c) => c.action === "sync"));
  await page.screenshot({
    path: "/tmp/scdr-native-push-settings.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Se connecter", exact: true })
    .waitFor();
  await context.close();
  const reseller = await actor("reseller");
  await reseller.page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: "Revendeurs", exact: true })
    .click();
  await reseller.page
    .getByRole("heading", { name: "Votre espace revendeur" })
    .waitFor();
  assert.equal(
    await reseller.page
      .getByRole("button", { name: "Créer son invitation" })
      .count(),
    0,
  );
  assert.equal(
    await reseller.page.getByText("admin@exemple.invalid").count(),
    0,
  );
  await reseller.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: permanent dark theme over light preference, six tabs, unpaid icon, prices, encrypted photo upload/reload/native share, native push enable/test, settings-only email/Face ID/logout, admin invitations and suspension with page preserved, client/expiry pages, reseller access, mobile layout.",
  );
} finally {
  await browser.close();
}
