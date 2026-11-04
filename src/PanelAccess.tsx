import { useEffect, useState } from "react";
import { ExternalLink, Check } from "lucide-react";
import type { ProviderSettings } from "./model";
import { normalizeWebAddress } from "./externalBrowser";
import { safeLink } from "./Business";
export function panelSite(settings: ProviderSettings) {
  return safeLink(
    settings.dashboardUrl ??
      settings.panels?.find((p) => safeLink(p.dashboardUrl || ""))
        ?.dashboardUrl ??
      "",
  );
}
export function PanelAccess({
  settings,
  busy,
  onSave,
}: {
  settings: ProviderSettings;
  busy: boolean;
  onSave: (settings: ProviderSettings) => Promise<void>;
}) {
  const saved = panelSite(settings),
    [url, setUrl] = useState(saved),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => setUrl(saved), [saved]);
  return (
    <section className="panel settings-panel">
      <h2>Site du panel</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (working || busy) return;
          setWorking(true);
          setError("");
          setDone(false);
          try {
            const next = normalizeWebAddress(url);
            if (next && !safeLink(next))
              throw new Error(
                "Indiquez une adresse complète commençant par https:// ou http://.",
              );
            await onSave({ ...settings, dashboardUrl: next });
            setDone(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setWorking(false);
          }
        }}
      >
        <label className="field">
          <span>Lien du site du panel</span>
          <input
            id="panel-site-input"
            type="text"
            inputMode="url"
            placeholder="https://…"
            value={url}
            autoComplete="url"
            onChange={(e) => {
              setUrl(e.target.value);
              setDone(false);
            }}
          />
        </label>
        <button type="submit" className="secondary" disabled={busy || working}>
          <ExternalLink size={16} />
          {working ? "Enregistrement…" : "Enregistrer le lien"}
        </button>
        {done && (
          <p role="status" className="panel-link-saved">
            <Check size={15} />
            Lien enregistré.
          </p>
        )}
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
