import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const base = "http://localhost:5173";
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
  // iOS Home Screen apps can have dvh shorter than lvh by the top safe inset.
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    }),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
  });
  let fixture;
  await page.route("**/api/**", (route) =>
    route.fulfill(
      fixture
        ? {
            json: new URL(route.request().url()).pathname.endsWith("/account")
              ? { profile: fixture.profile }
              : fixture,
          }
        : { status: 401, json: { error: "Connexion requise." } },
    ),
  );
  await page.goto(base);
  fixture = await page.evaluate(async () => {
    const { createIdentity } = await import("/src/cloudCrypto.ts");
    const identity = await createIdentity("Layout-test-password!");
    const profile = {
      id: "layout-admin",
      email: "layout@example.invalid",
      display_name: "Mon compte",
      role: "admin",
      active: true,
    };
    return {
      profile,
      profiles: [
        profile,
        { ...profile, id: "other-admin", display_name: "Associé" },
      ],
      keys: [{ user_id: profile.id, public_jwk: identity.jwk }],
      vaults: [],
      invitations: [],
      keyring: {
        password_envelope: identity.passwordBox,
        recovery_envelope: identity.recoveryBox,
      },
    };
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Connexion avec mot de passe" })
    .click();
  await page
    .getByLabel("Mot de passe de déverrouillage")
    .fill("Layout-test-password!");
  await page
    .getByRole("button", { name: "Déverrouiller", exact: true })
    .click();
  await page.getByRole("heading", { name: "Accueil" }).waitFor();
  assert.equal(
    await page
      .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
      .getAttribute("content"),
    "default",
  );
  assert.equal(
    await page.locator("html").getAttribute("data-display-mode"),
    "standalone",
  );
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      "--app-dynamic-height",
      "calc(100vh - var(--safe-top))",
    ),
  );

  async function geometry(insets) {
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.locator(".main-shell").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const result = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      };
      return {
        header: rect(".topbar"),
        account: rect(".account-bar"),
        root: rect("#root"),
        nav: rect(".mobile-nav"),
        tab: rect(".mobile-nav button"),
        scroll: rect(".main-shell"),
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bottomPadding: parseFloat(
          getComputedStyle(document.querySelector(".mobile-nav")).paddingBottom,
        ),
      };
    });
    assert(result.account.top >= insets.top - 1, JSON.stringify(result));
    assert(
      result.account.top >= result.header.bottom - 1,
      JSON.stringify(result),
    );
    assert(
      await page.locator(".clientele-filter").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return !!hit && el.contains(hit);
      }),
      "Clientele selector must be visible and tappable below the header",
    );
    assert(
      Math.abs(result.root.bottom - result.height) <= 1,
      JSON.stringify(result),
    );
    assert(
      Math.abs(result.nav.bottom - result.height) <= 1,
      JSON.stringify(result),
    );
    assert(
      Math.abs(result.tab.bottom - (result.height - insets.bottom)) <= 1,
      JSON.stringify(result),
    );
    assert.equal(result.bottomPadding, insets.bottom);
    assert(result.scroll.height > 80, JSON.stringify(result));
    const controls = await page.locator(".topbar").evaluate((el) => {
      const brand = el.querySelector(".app-wordmark").getBoundingClientRect(),
        panel = el.querySelector(".header-panel-link").getBoundingClientRect(),
        gear = el.querySelector(".settings-gear").getBoundingClientRect();
      return {
        brandRight: brand.right,
        panelLeft: panel.left,
        panelRight: panel.right,
        gearLeft: gear.left,
        gearRight: gear.right,
        width: innerWidth,
      };
    });
    assert(
      controls.brandRight <= controls.panelLeft &&
        controls.panelRight < controls.gearLeft &&
        controls.gearRight <= controls.width,
      JSON.stringify(controls),
    );
    assert(result.scrollWidth <= result.width + 1, JSON.stringify(result));
    assert(result.scrollHeight <= result.height + 1, JSON.stringify(result));
    assert(result.nav.left >= insets.left - 1);
    assert(result.nav.right <= result.width - insets.right + 1);
    return result;
  }
  const portrait = await geometry({ top: 59, bottom: 34, left: 0, right: 0 });
  const headerRendering = await page.locator(".topbar").evaluate((header) => {
    const style = getComputedStyle(header);
    return {
      outsideScroll: !document.querySelector(".main-shell").contains(header),
      position: style.position,
      filter: style.filter,
      backdrop: style.backdropFilter,
      navBackdrop: getComputedStyle(document.querySelector(".mobile-nav"))
        .backdropFilter,
      dialogsLeft: document.querySelectorAll("dialog[open]").length,
      gearSize: document
        .querySelector(".settings-gear svg")
        .getAttribute("width"),
    };
  });
  assert.deepEqual(headerRendering, {
    outsideScroll: true,
    position: "fixed",
    filter: "none",
    backdrop: "none",
    navBackdrop: "none",
    dialogsLeft: 0,
    gearSize: "24",
  });
  const statusSurface = await page
    .locator(".ios-status-surface")
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        height: rect.height,
        width: rect.width,
        position: style.position,
        background: style.backgroundColor,
        clip: style.backgroundClip,
        pointerEvents: style.pointerEvents,
        outsideRoot: !document.querySelector("#root").contains(el),
      };
    });
  assert.deepEqual(statusSurface, {
    top: 0,
    height: 11,
    width: 393,
    position: "fixed",
    background: "rgb(16, 19, 21)",
    clip: "text",
    pointerEvents: "none",
    outsideRoot: true,
  });
  const headerBeforeScroll = await page.locator(".topbar").boundingBox();
  const filterBeforeScroll = await page.locator(".account-bar").boundingBox();
  assert.equal(headerBeforeScroll.y, 0);
  const gear = await page
    .getByRole("button", { name: "Paramètres", exact: true })
    .boundingBox();
  assert(gear.y >= 59);
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/app-tv-mobile-layout-day.png",
  });
  await page.locator(".main-shell").evaluate((el) => {
    el.scrollTop = 100000;
  });
  assert.deepEqual(
    await page.locator(".topbar").boundingBox(),
    headerBeforeScroll,
  );
  assert.deepEqual(
    await page.locator(".account-bar").boundingBox(),
    filterBeforeScroll,
  );
  const footer = await page.locator(".main-shell > :last-child").boundingBox();
  const nav = await page.locator(".mobile-nav").boundingBox();
  assert(footer.y + footer.height <= nav.y + 1);
  await page.locator(".main-shell").evaluate((el) => {
    el.scrollTop = 0;
  });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    animations: "disabled",
    path: "/tmp/app-tv-mobile-layout-night.png",
  });

  const scale = await page.evaluate(() => visualViewport.scale);
  await cdp.send("Input.synthesizePinchGesture", {
    x: 190,
    y: 450,
    scaleFactor: 2,
    gestureSourceType: "touch",
  });
  assert.equal(await page.evaluate(() => visualViewport.scale), scale);
  assert.equal(
    await page.evaluate(() =>
      document.dispatchEvent(new Event("gesturestart", { cancelable: true })),
    ),
    false,
  );
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  assert(
    viewport.includes("user-scalable=no") &&
      viewport.includes("maximum-scale=1"),
  );
  await page
    .getByRole("button", { name: "Ajouter un client", exact: true })
    .click();
  await page.getByLabel("Pseudo").focus();
  assert(
    parseFloat(
      await page
        .getByLabel("Pseudo")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ) >= 16,
  );
  assert.equal(await page.evaluate(() => visualViewport.scale), scale);
  const dialog = await page.getByRole("dialog").boundingBox();
  assert(dialog.y >= 59 && dialog.y + dialog.height <= 852 - 34);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();

  // A newly installed opaque-status-bar app has a shorter viewport and no
  // top inset: the system already reserves those 59px outside the webpage.
  await page.setViewportSize({ width: 393, height: 793 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  });
  // Reproduce an installed app retaining the previous, oversized lvh.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--app-large-height", "852px"),
  );
  const opaquePortrait = await geometry({
    top: 0,
    bottom: 34,
    left: 0,
    right: 0,
  });
  const opaqueGear = await page
    .getByRole("button", { name: "Paramètres", exact: true })
    .boundingBox();
  assert(opaqueGear.y >= 0 && opaqueGear.y + opaqueGear.height <= 60);
  assert.equal(
    await page.locator("html").getAttribute("data-status-bar"),
    "opaque",
  );
  assert.equal(opaquePortrait.root.bottom, 793);
  assert.equal(opaquePortrait.account.top, 60);
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("--app-large-height"),
  );

  // Software-keyboard geometry must hide the tab bar instead of raising it
  // above the keyboard; closing the keyboard restores the exact original edge.
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: "Clients", exact: true })
    .click();
  const search = page.getByRole("textbox", {
    name: "Rechercher des clients",
    exact: true,
  });
  await search.focus();
  await page.evaluate(() => {
    window.__keyboardOriginalViewport = visualViewport.height;
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      get: () => 430,
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.keyboard === "open",
  );
  assert.equal(await page.locator(".mobile-nav").isVisible(), false);
  await search.fill("Pseudo recherché");
  await page.screenshot({
    path: "/tmp/scdr-search-keyboard.png",
    animations: "disabled",
  });
  await page.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.keyboard === "closed",
  );
  assert(await page.locator(".mobile-nav").isVisible());
  assert(
    Math.abs(
      (await page.locator(".mobile-nav").boundingBox()).y +
        (await page.locator(".mobile-nav").boundingBox()).height -
        793,
    ) <= 1,
  );
  await search.press("Enter");
  assert(await search.evaluate((el) => document.activeElement !== el));
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: "Accueil", exact: true })
    .click();
  await page.setViewportSize({ width: 844, height: 390 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, bottom: 21, left: 47, right: 47 },
  });
  const landscape = await geometry({ top: 0, bottom: 21, left: 47, right: 47 });
  await page.setViewportSize({ width: 320, height: 568 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 20, bottom: 0, left: 0, right: 0 },
  });
  const compact = await geometry({ top: 20, bottom: 0, left: 0, right: 0 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const sidebar = await page.locator(".sidebar").boundingBox();
  const account = await page.locator(".account-bar").boundingBox();
  assert.equal(account.x, sidebar.width);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      portrait,
      opaquePortrait,
      landscape,
      compact,
      pinchScale: scale,
      desktopAligned: true,
    }),
  );
} finally {
  await browser.close();
}
