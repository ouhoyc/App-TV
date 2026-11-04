export function normalizeWebAddress(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) ||
    /^(javascript|data|file|vbscript):/i.test(raw)
  )
    throw new Error("Vérifiez l’adresse du serveur ou du site.");
  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith("//")
      ? "https:" + raw
      : "https://" + raw;
  try {
    const url = new URL(candidate);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      /\s/.test(raw)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error("Vérifiez l’adresse du serveur ou du site.");
  }
}
// Safari's own URL handler leaves the standalone web-app browser on iOS 17+.
// Keep normal browser behavior elsewhere; never silently upgrade an HTTP site.
export function externalBrowserHref(
  value: string,
  ua = navigator.userAgent,
  standalone = matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone,
) {
  const version = /OS (\d+)[_\d]* like Mac OS X/.exec(ua);
  const ios = /iPhone|iPad|iPod/.test(ua);
  if (ios && standalone && (!version || Number(version[1]) >= 17)) {
    if (value.startsWith("https://")) return "x-safari-" + value;
    if (value.startsWith("http://")) {
      const origin =
        typeof location !== "undefined"
          ? location.origin
          : "https://app-tv-alpha.vercel.app";
      return (
        "x-safari-" + origin + "/open-browser.html#" + encodeURIComponent(value)
      );
    }
  }
  return value;
}
