import assert from "node:assert/strict";
import { chromium, devices } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const password = "Fictitious-test-password-2026";
try {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      colorScheme,
    });
    context.setDefaultTimeout(10_000);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.goto("http://127.0.0.1:4173");
    await page.getByLabel("Créer votre mot de passe maître").fill(password);
    await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Créer mon coffre" }).click();
    await page.getByRole("heading", { name: "Tout est à sa place." }).waitFor();
    await page.clock.pauseAt(await page.evaluate(() => Date.now()));

    // Simulate the visibility events iOS emits, and a suspended timer on return.
    const visible = (hidden) => page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { configurable: true, value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
    const unlock = async () => {
      await page.clock.resume();
      await page.getByLabel("Mot de passe maître", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Déverrouiller", exact: true }).click();
      await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor({ state: "hidden" });
      await page.waitForTimeout(100);
      await page.clock.pauseAt(await page.evaluate(() => Date.now()));
    };
    await page.getByRole("button", { name: "Ajouter un client", exact: true }).click();
    await page.getByLabel("Nom ou pseudonyme").fill("Client fictif");
    await visible(true);
    await page.clock.runFor(60_000);
    await visible(false);
    assert.equal(await page.getByLabel("Nom ou pseudonyme").inputValue(), "Client fictif");

    await visible(true);
    await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 240_000));
    await visible(false);
    await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor();
    await unlock();

    // Activity extends the deadline, but an expired session cannot be revived.
    await page.clock.runFor(240_000);
    await page.getByRole("button", { name: "Paramètres", exact: true }).first().click();
    await page.getByText("Version 0.1.1", { exact: true }).waitFor();
    await page.clock.runFor(60_000);
    assert.equal(await page.getByText("Version 0.1.1", { exact: true }).count(), 1);
    await page.screenshot({ path: `/tmp/app-tv-locking-${colorScheme}.png`, fullPage: true });
    await page.clock.runFor(240_000);
    await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor();
    await unlock();
    await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 300_000));
    await page.evaluate(() => window.dispatchEvent(new Event("pointerdown")));
    await page.clock.runFor(100);
    await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor();
    await unlock();

    await page.getByRole("button", { name: "Paramètres", exact: true }).first().click();
    await page.getByRole("button", { name: /Verrouiller le coffre/ }).click();
    await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor();
    await unlock();
    await page.reload();
    await page.getByRole("button", { name: "Déverrouiller", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${colorScheme}: draft retained, background deadline, idle timeout, activity, manual lock, reload`);
    await context.close();
  }
} finally {
  await browser.close();
}
