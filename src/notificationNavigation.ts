let pending = new URL(location.href).searchParams.get("client") || "";
const valid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
if (!valid(pending)) pending = "";
if ("serviceWorker" in navigator)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SCDR_OPEN_CLIENT" && valid(event.data.clientId)) {
      pending = event.data.clientId;
      window.dispatchEvent(new Event("scdr-notification-open"));
    }
  });
export function takeNotificationClient(allowed: string[]) {
  if (!pending || !allowed.includes(pending)) return "";
  const id = pending;
  pending = "";
  const url = new URL(location.href);
  url.searchParams.delete("client");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  return id;
}
