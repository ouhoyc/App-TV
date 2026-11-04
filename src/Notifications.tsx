import { useEffect, useState } from "react";
import { request } from "./cloudStore";
import type { CloudWorkspace } from "./App";

export default function Notifications({ cloud }: { cloud: CloudWorkspace }) {
  const [config, setConfig] = useState<{
      publicKey: string;
      configured: boolean;
    } | null>(null),
    [id, setId] = useState(""),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const supported =
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  useEffect(() => {
    let live = true;
    request<{ publicKey: string; configured: boolean }>("notifications")
      .then(async (c) => {
        if (!live) return;
        setConfig(c);
        if (supported && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker.getRegistration();
          const sub = await registration?.pushManager.getSubscription();
          if (sub && live) {
            const r = await request<{ id: string }>("notifications", {
              action: "subscribe",
              subscription: sub.toJSON(),
            });
            if (live) {
              setId(r.id);
              setEnabled(true);
            }
          }
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!supported || (ios && !installed))
      throw new Error(
        "Sur iPhone, ouvrez SCDR TV depuis son icône sur l’écran d’accueil pour activer les notifications.",
      );
    if (!config?.publicKey)
      throw new Error(
        "La configuration des notifications n’est pas disponible.",
      );
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error(
        "Autorisez les notifications dans les réglages de l’iPhone ou du navigateur.",
      );
    const registration = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(
      atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const sub =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }));
    const result = await request<{ id: string }>("notifications", {
      action: "subscribe",
      subscription: sub.toJSON(),
    });
    setId(result.id);
    setEnabled(true);
    await cloud.syncReminders();
    setNotice("Notifications activées sur cet appareil.");
  }
  return (
    <section className="panel settings-panel">
      <h2>Notifications</h2>
      <p>
        Tests : après 24 h. Abonnements annuels : 14 jours avant expiration.
      </p>
      {!supported || (ios && !installed) ? (
        <p className="alert">
          Sur iPhone : ouvrez l’app depuis l’écran d’accueil. Si besoin, dans
          Safari : Partager → Sur l’écran d’accueil.
        </p>
      ) : null}
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          disabled={
            busy || !supported || !!(ios && !installed) || !config?.configured
          }
          onClick={() =>
            void run(
              enabled
                ? async () => {
                    const registration = await navigator.serviceWorker.ready;
                    const sub =
                      await registration.pushManager.getSubscription();
                    if (sub) {
                      await request("notifications", {
                        action: "unsubscribe",
                        endpoint: sub.endpoint,
                      });
                      await sub.unsubscribe();
                    }
                    setEnabled(false);
                    setId("");
                    setNotice("Notifications désactivées sur cet appareil.");
                  }
                : activate,
            )
          }
        >
          {enabled
            ? "Désactiver les notifications"
            : "Activer les notifications"}
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !enabled || !id}
          onClick={() =>
            void run(async () => {
              await request("notifications", { action: "test", id });
              setNotice(
                "Notification de test envoyée. Vérifiez le centre de notifications.",
              );
            })
          }
        >
          Tester une notification
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await cloud.syncReminders();
              setNotice("Rappels synchronisés.");
            })
          }
        >
          Synchroniser les rappels
        </button>
      </div>
      {notice && (
        <p role="status" className="alert">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </section>
  );
}
