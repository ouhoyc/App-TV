import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = process.env.APP_TV_TEST_URL || "https://app-tv-alpha.vercel.app";
const seeds = JSON.parse(
  await readFile("/workspace/work/account-e2e.json", "utf8"),
);
const errors = [];
const clientA = "Client Alpha " + Date.now().toString(36);
const clientB = "Client Bêta " + Date.now().toString(36);
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
let actors = [];
async function actor(
  email,
  token,
  password = "Account-browser-password-2026!",
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  const a = { context, page, email, password };
  actors.push(a);
  await page.goto(base + (token ? "#invitation=" + token : ""));
  if (!token)
    await page
      .getByRole("button", { name: "Connexion avec mot de passe" })
      .click();
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(a.password);
  if (token) {
    await page
      .getByLabel("Confirmer le mot de passe", { exact: true })
      .fill(a.password);
    await page
      .getByRole("button", { name: "Activer mon compte", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Gardez votre clé à l’abri." })
      .waitFor();
    a.recovery = await page.locator(".recovery-code").textContent();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Entrer dans mon espace" }).click();
  } else
    await page
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
  await page.getByRole("heading", { name: "Accueil" }).waitFor();
  return a;
}
async function unlock(a) {
  await a.page.bringToFront();
  if (await a.page.locator(".login-stage").isVisible()) {
    await a.page
      .getByRole("button", { name: "Connexion avec mot de passe" })
      .click();
    await a.page
      .getByLabel("Mot de passe de déverrouillage", { exact: true })
      .fill(a.password);
    await a.page
      .getByRole("button", { name: "Déverrouiller", exact: true })
      .click();
  }
  await a.page.getByRole("heading", { name: "Accueil" }).waitFor();
  await a.page.getByRole("button", { name: "Clients", exact: true }).click();
}
async function invite(a, name, email) {
  await unlock(a);
  await a.page.getByRole("button", { name: "Revendeurs", exact: true }).click();
  await a.page.getByLabel("Nom du sous-revendeur", { exact: true }).fill(name);
  await a.page
    .getByLabel("Email du sous-revendeur", { exact: true })
    .fill(email);
  await a.page.getByRole("button", { name: "Créer son invitation" }).click();
  const link = a.page.getByLabel("Lien d’invitation");
  await link.waitFor();
  const value = await link.inputValue();
  await a.page.getByRole("button", { name: "Accueil", exact: true }).click();
  return new URLSearchParams(new URL(value).hash.slice(1)).get("invitation");
}
async function addClient(a, name) {
  await unlock(a);
  await a.page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await a.page.getByLabel("Nom ou pseudonyme").fill(name);
  await a.page
    .getByLabel("Fournisseur", { exact: true })
    .fill("Fournisseur fictif");
  await a.page
    .getByLabel("Identifiant", { exact: true })
    .fill("test-credential");
  await a.page
    .getByLabel("Mot de passe", { exact: true })
    .fill("sensitive-test-value");
  await a.page.getByLabel("Date d’expiration").fill("2027-12-31");
  await a.page
    .getByRole("button", { name: "Enregistrer la fiche", exact: true })
    .click();
  await a.page
    .getByText("Fiche chiffrée et enregistrée sur le serveur.", { exact: true })
    .waitFor();
  await a.page.getByRole("button", { name: new RegExp(name) }).waitFor();
}
try {
  const a = await actor(
    seeds[0].email,
    process.env.APP_TV_TEST_REUSE_ADMINS ? undefined : seeds[0].token,
  );
  console.log("PASS first administrator activation and recovery setup");
  const b = await actor(
    seeds[1].email,
    process.env.APP_TV_TEST_REUSE_ADMINS ? undefined : seeds[1].token,
  );
  console.log("PASS second administrator activation and independent key");
  const run =
    seeds[0].email.split("@")[0].replace("admin-a-", "") +
    (process.env.APP_TV_TEST_REUSE_ADMINS ? "-" + Date.now().toString(36) : "");
  const r1email = "reseller-a-" + run + "@app-tv-test.invalid",
    r2email = "reseller-b-" + run + "@app-tv-test.invalid";
  const t1 = await invite(a, "Revendeur Alpha", r1email);
  const t2 = await invite(b, "Revendeur Bêta", r2email);
  const r1 = await actor(r1email, t1),
    r2 = await actor(r2email, t2);
  console.log(
    "PASS administrator-only reseller invitations and account activation",
  );
  await addClient(r1, clientA);
  await addClient(r2, clientB);
  console.log(
    "PASS both resellers save encrypted clients to their own account",
  );
  for (const admin of [a, b]) {
    await unlock(admin);
    await admin.page
      .getByRole("button", { name: "Actualiser les données" })
      .click();
    await admin.page.getByLabel("Clientèle affichée").selectOption("all");
    await admin.page
      .getByRole("button", { name: new RegExp(clientA) })
      .waitFor();
    await admin.page
      .getByRole("button", { name: new RegExp(clientB) })
      .waitFor();
  }
  console.log("PASS both administrators decrypt and see both clientèles");
  await unlock(r1);
  assert.equal(
    await r1.page.getByRole("button", { name: new RegExp(clientB) }).count(),
    0,
  );
  const data = await r1.page.evaluate(
    async () => await (await fetch("/api/workspace")).json(),
  );
  assert.equal(data.vaults.length, 1);
  assert.equal(data.profiles.length, 1);
  assert.equal(data.keys.length, 3);
  assert(!JSON.stringify(data).includes("sensitive-test-value"));
  assert(!JSON.stringify(data).includes(clientA));
  const forbidden = await r1.page.evaluate(
    async (owner) => {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          changes: [
            {
              owner_id: owner,
              expected_revision: 0,
              payload: {
                version: 1,
                iv: "AAAAAAAAAAAAAAAA",
                ciphertext: "A".repeat(32),
                recipients: {},
              },
            },
          ],
        }),
      });
      return r.status;
    },
    b.page
      ? (
          await b.page.evaluate(
            async () => await (await fetch("/api/account")).json(),
          )
        ).profile.id
      : null,
  );
  assert.equal(forbidden, 400);
  console.log(
    "PASS actual API isolates ciphertext, profiles and foreign writes",
  );
  await r1.page.reload();
  await r1.page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await r1.page
    .getByLabel("Mot de passe de déverrouillage", { exact: true })
    .waitFor();
  assert.equal(
    await r1.page
      .getByRole("button", { name: "Activer mon compte", exact: true })
      .count(),
    0,
  );
  await unlock(r1);
  await r1.page.getByRole("button", { name: new RegExp(clientA) }).waitFor();
  assert(
    !(await r1.page.evaluate(() => JSON.stringify(localStorage))).includes(
      clientA,
    ),
  );
  assert(
    (await r1.context.cookies()).find((c) => c.name === "app_tv_session")
      ?.httpOnly,
  );
  console.log(
    "PASS reload retains account and client, with HttpOnly session and no plaintext localStorage",
  );
  await r1.page.getByRole("button", { name: new RegExp(clientA) }).click();
  await r1.page
    .getByRole("button", { name: "Renouveler", exact: true })
    .click();
  await r1.page
    .getByLabel("Nouvelle date d’expiration", { exact: true })
    .fill("2028-12-31");
  await r1.page
    .getByRole("button", { name: "Enregistrer le renouvellement" })
    .click();
  await r1.page.getByRole("button", { name: new RegExp(clientA) }).click();
  await r1.page.getByText("Historique des renouvellements (1)").waitFor();
  await r1.page.getByRole("button", { name: "Fermer", exact: true }).click();
  console.log("PASS renewal saves remotely with history");
  await r1.page
    .getByRole("button", { name: "Se déconnecter du compte" })
    .click();
  await r1.page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await r1.page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await r1.page.getByLabel("Adresse email", { exact: true }).fill(r1.email);
  await r1.page
    .getByLabel("Clé de récupération", { exact: true })
    .fill(r1.recovery);
  r1.password = "New-account-password-2026!";
  await r1.page
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill(r1.password);
  await r1.page
    .getByLabel("Confirmer le mot de passe", { exact: true })
    .fill(r1.password);
  await r1.page
    .getByRole("button", { name: "Récupérer mon compte", exact: true })
    .click();
  await r1.page.getByRole("button", { name: new RegExp(clientA) }).waitFor();
  console.log(
    "PASS recovery key resets login and preserves original encryption keys and client",
  );
  await unlock(a);
  await a.page.getByRole("button", { name: "Revendeurs", exact: true }).click();
  await a.page
    .locator(".reseller-row")
    .filter({ hasText: r1.email })
    .getByRole("button", { name: "Suspendre", exact: true })
    .click();
  await a.page
    .locator(".reseller-row")
    .filter({ hasText: r1.email })
    .getByRole("button", { name: "Réactiver", exact: true })
    .waitFor();
  await a.page.getByRole("button", { name: "Accueil", exact: true }).click();
  await r1.page.reload();
  await r1.page
    .getByRole("button", { name: "Se connecter", exact: true })
    .waitFor();
  assert.equal(
    await r1.page.getByRole("button", { name: new RegExp(clientA) }).count(),
    0,
  );
  console.log(
    "PASS immediate server-side suspension clears sensitive interface",
  );
  await unlock(b);
  await b.page.getByRole("button", { name: "Actualiser les données" }).click();
  await b.page.getByRole("button", { name: "Revendeurs", exact: true }).click();
  await b.page
    .locator(".reseller-row")
    .filter({ hasText: r1.email })
    .getByRole("button", { name: "Réactiver", exact: true })
    .click();
  await b.page
    .locator(".reseller-row")
    .filter({ hasText: r1.email })
    .getByRole("button", { name: "Suspendre", exact: true })
    .waitFor();
  await b.page.getByRole("button", { name: "Fermer les revendeurs" }).click();
  const resumed = await actor(r1.email, undefined, r1.password);
  await resumed.page
    .getByRole("button", { name: new RegExp(clientA) })
    .waitFor();
  // A separate fresh browser context uses the same account without invitation.
  await resumed.context.close();
  await unlock(a);
  await a.page.getByRole("button", { name: "Activer le mode nuit" }).click();
  await a.page.screenshot({
    path: "/tmp/app-tv-accounts-night.png",
    fullPage: true,
  });
  await a.page.getByRole("button", { name: "Activer le mode jour" }).click();
  await a.page.screenshot({
    path: "/tmp/app-tv-accounts-day.png",
    fullPage: true,
  });
  assert(
    await a.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log("PASS theme switch, mobile layout and clean runtime");
  await writeFile(
    "/workspace/work/accounts-e2e-result.json",
    JSON.stringify({ ok: true, base }),
  );
} catch (e) {
  for (let i = 0; i < actors.length; i++)
    await actors[i].page
      .screenshot({
        path: `/tmp/app-tv-account-failure-${i}.png`,
        fullPage: true,
      })
      .catch(() => {});
  await writeFile(
    "/workspace/work/accounts-e2e-actors.json",
    JSON.stringify(
      actors.map(({ email, password, recovery }) => ({
        email,
        password,
        recovery,
      })),
    ),
    { mode: 0o600 },
  );
  const current = actors.at(-1);
  if (current) {
    await current.page
      .screenshot({ path: "/tmp/app-tv-account-failure.png", fullPage: true })
      .catch(() => {});
    const alerts = await current.page
      .locator("[role=alert]")
      .allTextContents()
      .catch(() => []);
    console.log("UI error messages:", alerts);
  }
  throw e;
} finally {
  await browser.close();
}
