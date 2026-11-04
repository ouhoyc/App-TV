// SCDR TV uses the approved Carbone night palette on every screen.
export function initializeTheme() {
  document.documentElement.dataset.theme = "dark";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", "#101315");
}
