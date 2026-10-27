// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "@playwright/test"
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pass = "Test-browser-password-2026";
try {
  await page.goto("http://127.0.0.1:4173");
  await page.getByLabel("Créer votre mot de passe maître").fill(pass);
  await page
    .getByLabel("Confirmer le mot de passe", { exact: true })
    .fill(pass);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon coffre" }).click();
  await page.getByRole("heading", { name: "Tout est à sa place." }).waitFor();
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await page.getByLabel("Nom ou pseudonyme").fill("Alice Martin");
  await page.getByLabel("Téléphone", { exact: true }).fill("0612345678");
  await page
    .getByLabel("Fournisseur", { exact: true })
    .fill("Fournisseur test");
  await page.getByLabel("Identifiant", { exact: true }).fill("alice-demo");
  await page.getByLabel("Mot de passe", { exact: true }).fill("secret-client");
  await page.getByLabel("Date de début").fill("2026-01-01");
  await page.getByLabel("Date d’expiration").fill("2027-01-01");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await page.getByRole("button", { name: /Alice Martin/ }).waitFor();
  const records = await page.evaluate(
    async () =>
      new Promise((res, rej) => {
        const r = indexedDB.open("prive-encrypted", 1);
        r.onsuccess = () => {
          const db = r.result;
          const t = db.transaction("vault");
          const get = t.objectStore("vault").get("main");
          get.onsuccess = () => {
            res(JSON.stringify(get.result));
            db.close();
          };
          get.onerror = rej;
        };
        r.onerror = rej;
      }),
  );
  assert(!records.includes("Alice"));
  assert(!records.includes("secret-client"));
  await page.reload();
  await page.getByLabel("Mot de passe maître").fill(pass);
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("button", { name: /Alice Martin/ }).click();
  assert(!(await page.getByText("secret-client", { exact: true }).count()));
  await page
    .getByRole("button", { name: "Afficher Mot de passe", exact: true })
    .click();
  await page.getByText("secret-client", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Renouveler", exact: true }).click();
  await page.getByLabel("Nouvelle date").fill("2028-01-01");
  await page
    .getByRole("button", { name: "Confirmer le renouvellement local" })
    .click();
  await page.getByRole("button", { name: /Alice Martin/ }).click();
  await page.getByText("Historique des renouvellements (1)").waitFor();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("button", { name: "Créer une sauvegarde" }).click();
  await page
    .getByLabel("Mot de passe de sauvegarde")
    .fill("Backup-browser-password");
  await page
    .getByLabel("Confirmer ce mot de passe")
    .fill("Backup-browser-password");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter le fichier chiffré" })
    .click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().includes("sauvegarde"));
  const file = await download.path();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .getByRole("button", { name: "Paramètres", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Restaurer une sauvegarde/ }).click();
  await page.locator("input[type=file]").setInputFiles(file);
  await page
    .getByLabel("Mot de passe de la sauvegarde")
    .fill("Backup-browser-password");
  await page.getByRole("button", { name: "Déchiffrer et vérifier" }).click();
  await page.getByText("Intégrité vérifiée", { exact: true }).waitFor();
  await page
    .getByText("1 client(s) · 1 doublon(s) possible(s).", { exact: true })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirmer la restauration" }).click();
  await page
    .getByText(
      "Sauvegarde restaurée. Vos paramètres fournisseur actuels ont été conservés.",
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Clients", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Importer un CSV" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "name,phone\nBob Test,0699887766\nAlice Martin,0612345678",
      ),
    });
  await page
    .getByText("2 ligne(s) valide(s) · 1 doublon(s) ignoré(s).")
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirmer l’import" }).click();
  await page.getByRole("button", { name: /Bob Test/ }).waitFor();
  await page.getByRole("button", { name: /Alice Martin/ }).click();
  await page.getByRole("button", { name: "Partager", exact: true }).click();
  assert(
    (await page.getByLabel("Message à partager").inputValue()).includes(
      "secret-client",
    ),
  );
  assert(await page.getByRole("button", { name: "WhatsApp" }).isDisabled());
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .getByRole("button", { name: "Vue d’ensemble", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/app-tv-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/app-tv-mobile.png", fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Mot de passe maître").fill(pass);
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("button", { name: /Alice Martin/ }).waitFor();
  await page
    .getByText("Vous êtes hors ligne. Votre coffre reste disponible.")
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: creation, encrypted IndexedDB, reload/unlock, masked credentials, renewal history, encrypted export/restore preview, mobile layout, offline reload.",
  );
} finally {
  await browser.close();
}
