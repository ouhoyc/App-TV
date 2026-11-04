import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Real WebAuthn/PRF in Chromium's virtual platform authenticator. API fixtures
// isolate this local-encryption feature without creating production users.
const base = process.env.APP_TV_DEVICE_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const password = "Local-device-test-password!";
const derivedCredential = createHash("sha256")
  .update("app-tv:auth:v1:device-test@example.invalid:" + password)
  .digest("hex");
const errors = [];
let debugPage;
async function actor(hasPrf = true, setupRequested = false) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { value: true }),
  );
  const page = await context.newPage();
  debugPage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        ctap2Version: "ctap2_1",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf,
      },
    },
  );
  let fixture,
    expired = false;
  let session = true,
    logins = 0;
  let accountGets = 0,
    workspaceGets = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && path === "/api/account")
      accountGets++;
    if (route.request().method() === "GET" && path === "/api/workspace")
      workspaceGets++;
    const body =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : null;
    if (path === "/api/account" && body?.action === "logout") {
      session = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (
      fixture &&
      !expired &&
      path === "/api/account" &&
      body?.action === "login"
    ) {
      assert.equal(body.email, fixture.profile.email);
      assert.equal(body.credential, derivedCredential);
      session = true;
      logins++;
      return route.fulfill({
        json: { profile: fixture.profile, workspace: fixture },
      });
    }
    if (expired || !fixture || !session)
      return route.fulfill({
        status: 401,
        json: { error: "Session expirée." },
      });
    return route.fulfill({
      json: path === "/api/account" ? { profile: fixture.profile } : fixture,
    });
  });
  await page.goto(base + (setupRequested ? "/?setup=face-id" : ""));
  fixture = await page.evaluate(async (password) => {
    const crypto = await import("/src/cloudCrypto.ts");
    const model = await import("/src/model.ts");
    const created = await crypto.createIdentity(password);
    const profile = {
      id: "test-owner",
      email: "device-test@example.invalid",
      display_name: "Test appareil",
      role: "reseller",
      active: true,
    };
    const keys = ["test-owner", "admin-a", "admin-b"].map((user_id) => ({
      user_id,
      public_jwk: created.jwk,
    }));
    const vault = model.emptyVault();
    const client = model.newClient();
    client.name = "Client chiffré appareil";
    client.subscriptions = [];
    vault.clients = [client];
    return {
      profile,
      profiles: [profile],
      keys,
      invitations: [],
      keyring: {
        password_envelope: created.passwordBox,
        recovery_envelope: created.recoveryBox,
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
  }, password);
  await page.reload();
  if (setupRequested) {
    await page.getByRole("dialog", { name: "Activer Face ID" }).waitFor();
  } else {
    await page
      .getByRole("button", { name: "Connexion avec mot de passe" })
      .click();
    await page
      .getByLabel("Mot de passe de déverrouillage", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Déverrouiller", exact: true })
      .click();
    await page.getByRole("heading", { name: "Accueil" }).waitFor();
  }
  return {
    context,
    page,
    cdp,
    authenticatorId,
    logins: () => logins,
    requests: () => ({ accountGets, workspaceGets }),
    expire: () => {
      expired = true;
    },
  };
}
async function activate(a, allowError = false) {
  if (
    !(await a.page.getByRole("dialog", { name: "Activer Face ID" }).count())
  ) {
    await a.page
      .getByRole("button", { name: "Paramètres", exact: true })
      .click();
    await a.page.getByRole("button", { name: /^Face ID/ }).click();
  }
  await a.page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await a.page.getByRole("dialog", { name: "Activer Face ID" }).waitFor();
  assert.equal(
    await a.page.getByRole("heading", { name: "Accueil" }).count(),
    0,
  );
  await a.page.getByLabel("Votre mot de passe actuel").fill(password);
  await a.page.getByRole("button", { name: "Continuer", exact: true }).click();
  await a.page.evaluate(() => {
    window.requireCredentialGesture = true;
    if (window.gestureGuardInstalled) return;
    window.gestureGuardInstalled = true;
    document.addEventListener(
      "click",
      () => {
        window.credentialClickTask = true;
        setTimeout(() => {
          window.credentialClickTask = false;
        }, 0);
      },
      { capture: true },
    );
    for (const method of ["create", "get"]) {
      const original = navigator.credentials[method].bind(
        navigator.credentials,
      );
      navigator.credentials[method] = (options) => {
        if (window.requireCredentialGesture && !window.credentialClickTask)
          throw new DOMException("Direct click required", "NotAllowedError");
        return original(options);
      };
    }
  });
  await a.page
    .getByRole("button", {
      name: /Créer ma clé d’accès|Valider ma clé d’accès/,
    })
    .click();
  const confirmation = a.page.getByRole("button", {
    name: "Terminer avec Face ID",
    exact: true,
  });
  await Promise.race([
    confirmation.waitFor(),
    a.page.locator(".app-shell").waitFor(),
    a.page.getByRole("alert").waitFor(),
  ]);
  if (await confirmation.isVisible()) await confirmation.click();
  const alert = a.page.getByRole("dialog").getByRole("alert");
  if (!allowError && (await alert.isVisible()))
    throw new Error(await alert.innerText());
  await a.page.evaluate(() => {
    window.requireCredentialGesture = false;
  });
}
async function lock(a) {
  await a.page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await a.page.getByRole("button", { name: /^Verrouiller le coffre/ }).click();
  await a.page
    .getByRole("button", { name: "Déverrouiller avec Face ID" })
    .waitFor();
}
async function unlock(a) {
  await a.page
    .getByRole("button", { name: "Déverrouiller avec Face ID" })
    .click();
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
}
try {
  const a = await actor(true, true);
  await a.page.getByRole("dialog", { name: "Activer Face ID" }).waitFor();
  await activate(a);
  await a.page.locator(".app-shell").waitFor();
  const stored = await a.page.evaluate(() => JSON.stringify(localStorage));
  assert(!stored.includes(password));
  assert(!stored.includes(derivedCredential));
  assert(!stored.includes("Client chiffré appareil"));
  assert(!stored.includes("PRIVATE KEY"));
  // Regression: explicit logout used to erase Face ID. A fresh page must
  // reconnect through the server using only the credential unlocked by PRF.
  await a.page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await a.page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await a.page
    .getByRole("button", { name: /Se connecter avec Face ID/ })
    .waitFor();
  const beforeStartup = a.requests();
  await a.page.reload();
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
  assert.equal(a.logins(), 1);
  assert.deepEqual(
    a.requests(),
    beforeStartup,
    "Remembered Face ID must use the authenticated login snapshot without redundant account/workspace probes",
  );
  console.log(
    JSON.stringify({
      faceIdStartupExtraAccountProbes: 0,
      faceIdStartupExtraWorkspaceProbes: 0,
    }),
  );
  await a.page.clock.install();
  // No inactivity lock while the app is visible, even without interaction.
  await a.page.clock.fastForward(30 * 60 * 1000);
  assert.equal(await a.page.locator(".app-shell").count(), 1);
  assert.equal(a.logins(), 1);
  const visibility = async (hidden) =>
    a.page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: hidden,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  // A short departure preserves the current page and needs no Face ID.
  await a.page.getByRole("button", { name: "Clients", exact: true }).click();
  await visibility(true);
  await a.page.clock.fastForward(299000);
  assert.equal(await a.page.locator(".app-shell").count(), 1);
  await visibility(false);
  await a.page.clock.fastForward(600000);
  assert.equal(await a.page.locator(".app-shell").count(), 1);
  assert.equal(a.logins(), 1);
  const backgroundLogin = a.page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === "login",
  );
  // Frozen background timers: advancing wall time alone still requires Face ID
  // on return after five minutes.
  await visibility(true);
  await a.page.clock.setSystemTime(
    new Date((await a.page.evaluate(() => Date.now())) + 300000),
  );
  await visibility(false);
  await backgroundLogin;
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
  assert.equal(a.logins(), 2);
  await a.page.evaluate(() => {
    delete document.hidden;
  });
  await a.page.clock.resume();
  await lock(a);
  await unlock(a);
  await a.page.goto(base + "/?setup=face-id");
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
  assert.equal(
    await a.page.getByRole("dialog", { name: "Activer Face ID" }).count(),
    0,
  );
  await a.page.getByRole("button", { name: "Clients", exact: true }).click();
  await a.page.getByText("Client chiffré appareil", { exact: true }).waitFor();
  assert(
    await a.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await lock(a);
  // Cancellation keeps the password fallback usable and doesn't open the vault.
  await a.page.evaluate(() => {
    window.originalGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    };
  });
  await a.page
    .getByRole("button", { name: "Déverrouiller avec Face ID" })
    .click();
  await a.page
    .getByRole("alert")
    .filter({ hasText: "Validation annulée" })
    .waitFor();
  // Simulate managers that set DOM values without firing onChange.
  await a.page
    .getByLabel("Mot de passe de déverrouillage")
    .evaluate((input, value) => {
      input.value = value;
    }, password);
  await a.page
    .locator("#account-login")
    .evaluate((form) => form.requestSubmit());
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
  await a.page.evaluate(() => {
    navigator.credentials.get = window.originalGet;
  });
  // AES-GCM rejects a modified local envelope.
  await a.page.evaluate(() => {
    const key = "app-tv:device-unlock:v1:test-owner";
    const box = JSON.parse(localStorage.getItem(key));
    box.ciphertext =
      (box.ciphertext[0] === "A" ? "B" : "A") + box.ciphertext.slice(1);
    localStorage.setItem(key, JSON.stringify(box));
  });
  await lock(a);
  await a.page
    .getByRole("button", { name: "Déverrouiller avec Face ID" })
    .click();
  await a.page
    .getByRole("alert")
    .filter({ hasText: "protection locale" })
    .waitFor();
  await a.page.getByLabel("Mot de passe de déverrouillage").fill(password);
  await a.page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await a.page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await a.page.getByRole("button", { name: /^Face ID/ }).click();
  await a.page
    .getByRole("button", { name: "Désactiver sur cet appareil" })
    .click();
  await activate(a);
  await a.page.locator(".app-shell").waitFor();
  await lock(a);
  a.expire();
  await a.page
    .getByRole("button", { name: "Déverrouiller avec Face ID" })
    .click();
  await a.page
    .getByRole("button", { name: "Se connecter", exact: true })
    .waitFor();
  assert.equal(
    await a.page.getByRole("heading", { name: "Accueil" }).count(),
    0,
  );
  await a.page
    .getByRole("button", { name: /Se connecter avec Face ID/ })
    .waitFor();
  await a.page
    .getByRole("button", { name: "Oublier ce compte sur cet appareil" })
    .click();
  assert.equal(
    await a.page.evaluate(() =>
      localStorage.getItem("app-tv:device-unlock:v1:test-owner"),
    ),
    null,
  );
  assert.equal(
    await a.page
      .getByRole("button", { name: /Se connecter avec Face ID/ })
      .count(),
    0,
  );
  await a.context.close();
  const unsupported = await actor(false);
  await activate(unsupported, true);
  await unsupported.page
    .getByRole("alert")
    .filter({ hasText: "ne permet pas" })
    .waitFor();
  assert.equal(
    await unsupported.page.evaluate(() =>
      localStorage.getItem("app-tv:device-unlock:v1:test-owner"),
    ),
    null,
  );
  await unsupported.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native WebAuthn PRF with direct-click ceremonies, password-manager visibility, automatic startup/background reconnection, encrypted credential/client, cancellation/password fallback, tamper denial, disable/forget, refused login, unsupported authenticator, mobile layout.",
  );
} catch (error) {
  if (debugPage && !debugPage.isClosed())
    console.error((await debugPage.locator("body").innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser.close();
}
