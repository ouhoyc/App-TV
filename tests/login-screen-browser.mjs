import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { value: true }),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  let releaseLogin;
  await page.route("**/api/**", async (route) => {
    if (route.request().postDataJSON()?.action === "login")
      await new Promise((resolve) => {
        releaseLogin = resolve;
      });
    await route.fulfill({
      status: 401,
      json: { error: "Mot de passe incorrect." },
    });
  });
  await page.goto("http://localhost:5173");
  const stage = page.getByRole("main", { name: "Connexion SCDR TV" });
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .waitFor();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--app-large-height", "911px"),
  );
  assert.equal(
    await page.locator("html").getAttribute("data-status-bar"),
    "opaque",
  );
  const keyBounds = await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .boundingBox();
  assert(keyBounds.y >= 0 && keyBounds.y + keyBounds.height <= 852);
  assert(
    await page.locator(".login-password").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return !!hit && el.contains(hit);
    }),
  );
  assert((await stage.boundingBox()).height <= 852);
  // iOS may expose a visual viewport smaller than the layout viewport, and
  // temporarily pan it after the keyboard closes. The key must follow it.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      value: 793,
    });
    Object.defineProperty(visualViewport, "offsetTop", {
      configurable: true,
      value: 17,
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(
    () =>
      document.documentElement.style.getPropertyValue(
        "--app-visible-height",
      ) === "793px",
  );
  const reducedKey = await page.locator(".login-password").boundingBox();
  assert(reducedKey.y >= 17 && reducedKey.y + reducedKey.height <= 810);
  const reducedRoot = await page.locator("#root").boundingBox();
  assert.equal(reducedRoot.y, 17);
  assert.equal(reducedRoot.height, 793);
  await page.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(
    () =>
      document.documentElement.style.getPropertyValue("--app-visible-top") ===
      "0px",
  );
  assert.equal(await page.locator("body").innerText(), "");
  assert.equal(await stage.locator("img").count(), 1);
  assert.equal(await page.getByRole("textbox").count(), 0);
  await page.screenshot({ path: "/tmp/scdr-login-idle.png" });
  // First-time/password login is accessible by tapping the TV, with no copy
  // on the screen until a credential form is actually needed.
  await stage
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Connexion", exact: true });
  await dialog.getByLabel("Adresse email").fill("login-test@example.invalid");
  await dialog
    .getByLabel("Mot de passe", { exact: true })
    .fill("Test-password-12345!");
  await dialog
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".login-stage")?.getAttribute("aria-busy") ===
      "true",
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".logo-letter").length === 4,
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".auth-pending")).opacity === "0",
  );
  assert.equal(await page.locator(".account-auth, .privacy-line").count(), 0);
  const motion = await page.locator(".logo-letter").evaluateAll((els) =>
    els.map((el) => ({
      name: getComputedStyle(el).animationName,
      delay: getComputedStyle(el).animationDelay,
      tag: el.tagName,
      promoted: getComputedStyle(el).willChange,
    })),
  );
  assert(motion.every((m) => m.name === "scdr-letter-shake"));
  assert(motion.every((m) => m.tag === "SPAN" && m.promoted === "transform"));
  assert.equal(new Set(motion.map((m) => m.delay)).size, 4);
  const frame1 = await page
    .locator(".logo-letter")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(160);
  const frame2 = await page
    .locator(".logo-letter")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(frame1, frame2);
  const compositor = await context.newCDPSession(page);
  await compositor.send("LayerTree.enable");
  let paints = 0;
  compositor.on("LayerTree.layerPainted", () => paints++);
  await page.waitForTimeout(250);
  paints = 0;
  await page.waitForTimeout(750);
  console.log(JSON.stringify({ animationPaintsOver750ms: paints }));
  assert(paints <= 4, "Letter motion should composite without continuous repaints");
  await compositor.detach();
  await page.screenshot({ path: "/tmp/scdr-login-animated.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".logo-letter")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(
    () => document.querySelector(".auth-pending") !== null,
  );
  while (!releaseLogin) await page.waitForTimeout(10);
  releaseLogin();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "Mot de passe incorrect." })
    .waitFor();
  assert.equal(await stage.getAttribute("aria-busy"), "false");
  assert.equal(await page.locator(".logo-letter").count(), 0);
  await page.getByRole("button", { name: "Fermer la connexion" }).click();
  assert.equal(await page.locator("body").innerText(), "");
  // The small key remains a usable password fallback. Escape restores the TV.
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.setViewportSize({ width: 320, height: 568 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const bounds = await stage.locator(".login-logo").boundingBox();
  assert(bounds.width <= 320 && bounds.height <= 568);
  // Invitations still open their activation form directly.
  await page.goto("http://localhost:5173/#invitation=" + "a".repeat(64));
  await page.getByRole("dialog", { name: "Activer mon compte" }).waitFor();
  await page.getByLabel("Confirmer le mot de passe").waitFor();
  assert.equal(await page.getByLabel("Code d’invitation").count(), 0);
  assert.equal(new URL(page.url()).hash, "");
  await page.addInitScript(() => {
    localStorage.setItem(
      "app-tv:device-unlock:v1:remembered",
      JSON.stringify({
        version: 2,
        userId: "remembered",
        email: "other@example.invalid",
        credentialId: btoa("test"),
        salt: btoa("x".repeat(32)),
        iv: btoa("x".repeat(12)),
        ciphertext: btoa("test"),
      }),
    );
    window.activationCredentialRequests = 0;
    navigator.credentials.get = async () => {
      window.activationCredentialRequests++;
      throw new DOMException("Unexpected account sign-in", "NotAllowedError");
    };
  });
  await page.goto(
    "http://localhost:5173/?activation-test=1#invitation=" + "b".repeat(64),
  );
  await page.getByRole("dialog", { name: "Activer mon compte" }).waitFor();
  await page.getByLabel("Confirmer le mot de passe").waitFor();
  assert.equal(
    await page.evaluate(() => window.activationCredentialRequests),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: logo-only login, password fallback, real staggered letter motion while awaiting server, no added delay, failed-login recovery, reduced motion, small screen, invitation activation.",
  );
  await context.close();
} finally {
  await browser.close();
}
