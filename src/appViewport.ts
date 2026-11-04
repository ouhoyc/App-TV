// iOS may ignore the viewport zoom limits. Prevent its proprietary pinch
// gestures too, while keeping ordinary touch scrolling and form interaction.
export function configureAppViewport() {
  const displayMode = window.matchMedia("(display-mode: standalone)");
  const root = document.documentElement;
  let unobscuredHeight = Math.min(
    window.innerHeight,
    window.visualViewport?.height || window.innerHeight,
  );
  let layoutWidth = window.innerWidth,
    keyboardOpen = false;
  const updateDisplayMode = () => {
    const installed =
      displayMode.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    root.dataset.displayMode = installed ? "standalone" : "browser";
    const appRoot = document.getElementById("root");
    const safeTop = appRoot
      ? parseFloat(getComputedStyle(appRoot).paddingTop) || 0
      : 0;
    root.dataset.statusBar = !installed
      ? "browser"
      : safeTop > 0
        ? "translucent"
        : "opaque";
    // An opaque iOS installation reserves the status bar outside the page.
    // Its lvh may still describe the old, taller surface. Use the visible
    // viewport there; retain the existing lvh workaround for edge-to-edge apps.
    const visibleHeight = Math.min(
      window.innerHeight,
      window.visualViewport?.height || window.innerHeight,
    );
    const focused = document.activeElement;
    const editing =
      focused instanceof HTMLTextAreaElement ||
      (focused instanceof HTMLInputElement &&
        [
          "text",
          "search",
          "password",
          "tel",
          "email",
          "url",
          "number",
        ].includes(focused.type)) ||
      (focused instanceof HTMLElement && focused.isContentEditable);
    if (Math.abs(window.innerWidth - layoutWidth) > 80) {
      unobscuredHeight = Math.max(visibleHeight, window.innerHeight);
      layoutWidth = window.innerWidth;
      keyboardOpen = false;
    }
    if (!editing && !keyboardOpen) unobscuredHeight = visibleHeight;
    if (visibleHeight > unobscuredHeight) unobscuredHeight = visibleHeight;
    keyboardOpen =
      !!(editing || keyboardOpen) && unobscuredHeight - visibleHeight > 140;
    root.dataset.keyboard = keyboardOpen ? "open" : "closed";
    if (visibleHeight > 0)
      root.style.setProperty("--app-visible-height", `${visibleHeight}px`);
    root.style.setProperty(
      "--app-visible-top",
      `${Math.max(0, window.visualViewport?.offsetTop || 0)}px`,
    );
  };
  let frame = 0;
  const scheduleUpdate = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateDisplayMode);
  };
  updateDisplayMode();
  displayMode.addEventListener("change", scheduleUpdate);
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  window.visualViewport?.addEventListener("resize", scheduleUpdate);
  window.visualViewport?.addEventListener("scroll", scheduleUpdate);
  document.addEventListener("visibilitychange", scheduleUpdate);
  document.addEventListener("focusin", scheduleUpdate);
  document.addEventListener("focusout", scheduleUpdate);
  const preventPinch = (event: Event) => event.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(type, preventPinch, { passive: false });
}
