import { useEffect, useRef, useState } from "react";
import type { CloudWorkspace } from "./App";
import { request, HttpError } from "./cloudStore";
import { invoice, panelCost } from "./commerce";
import { decryptCloud } from "./cloudCrypto";
import {
  newSubscription,
  today,
  validDate,
  type Client,
  type ProviderPanel,
  type Subscription,
  type Vault,
} from "./model";
import {
  applyProviderDevice,
  openProviderReceipt,
  providerRequest,
  subscriptionIdentity,
  type ProviderContext,
  type ProviderDevice,
  type ProviderOperation,
  type ProviderReceipt,
} from "./providerWorkflow";

export interface WorkflowProps {
  cloud: CloudWorkspace;
  client: Client;
  subscription?: Subscription;
  panels: ProviderPanel[];
  mode: ProviderContext["mode"];
  onApply: (client: Client) => Promise<void>;
  onFinish: () => void;
  initialOperation?: ProviderOperation;
  initialContext?: ProviderContext;
}
const operationName = {
  create: "Création",
  renew: "Renouvellement",
  status: "Changement de statut",
};

export default function ProviderWorkflow({
  cloud,
  client,
  subscription,
  panels,
  mode,
  onApply,
  onFinish,
  initialOperation,
  initialContext,
}: WorkflowProps) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [draftSub, setDraftSub] = useState<Subscription>(
    () =>
      subscription || {
        ...newSubscription(),
        id: initialContext?.subscriptionId || crypto.randomUUID(),
      },
  );
  const [panelId, setPanelId] = useState(
    initialContext?.panelId || subscription?.panelId || "",
  );
  const [kind, setKind] = useState<"m3u" | "mag">(
    initialContext?.type || (subscription?.type === "MAG" ? "mag" : "m3u"),
  );
  const [months, setMonths] = useState(initialContext?.months || 12);
  const [pack, setPack] = useState(initialContext?.pack || "");
  const [country, setCountry] = useState("");
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<ProviderDevice | null>(null);
  const [inspected, setInspected] = useState(false);
  const [receipt, setReceipt] = useState<ProviderReceipt | null>(null);
  const [operation, setOperation] = useState<ProviderOperation | null>(
    initialOperation || null,
  );
  const [pendingId, setPendingId] = useState(initialOperation?.id || "");
  const [start, setStart] = useState(subscription?.start || today());
  const [expires, setExpires] = useState(subscription?.expires || "");
  const running = useRef(false),
    applied = useRef(false);
  const panel = panels.find((p) => p.id === panelId);
  const [sale, setSale] = useState(
    initialContext?.sale ?? subscription?.sale ?? "",
  );
  const [cost, setCost] = useState(
    initialContext?.cost ??
      (panelCost(panel, months) || subscription?.cost || ""),
  );
  const write = mode !== "inspect";
  const locked = !!pendingId;
  const changedStatus = subscription?.status === "disabled";
  const target = { ...client, name: name.trim(), phone };
  async function run(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function key() {
    if (!panel?.key)
      throw new Error(
        "Choisissez un panel dont la clé est enregistrée dans les paramètres.",
      );
    return panel.key;
  }
  function identity() {
    return subscriptionIdentity({
      ...draftSub,
      type: kind === "mag" ? "MAG" : "M3U",
    });
  }
  function showDevice(value: ProviderDevice | null) {
    setDevice(value);
    if (value?.expires) setExpires(value.expires);
    if (value)
      setDraftSub((s) => ({
        ...s,
        type: value.type === "mag" ? "MAG" : "M3U",
        username: value.username || s.username,
        password: value.password || s.password,
        mac: value.mac || s.mac,
        m3u: value.m3u || s.m3u,
        server: value.server || s.server,
      }));
  }
  async function accept(row: ProviderOperation) {
    setOperation(row);
    setPendingId(row.id);
    setConfirmed(false);
    if (row.result_box) {
      const result = await openProviderReceipt(
        row.result_box,
        row.id,
        cloud.profile.id,
        cloud.privateKey,
      );
      setReceipt(result);
      showDevice(result.device);
      if (result.action === "renew" && !result.device?.expires) setExpires("");
    }
  }
  useEffect(() => {
    if (initialOperation) void run(() => accept(initialOperation));
  }, []);
  async function consult() {
    const response = await providerRequest<{ device: ProviderDevice }>(
      "device",
      key(),
      identity(),
    );
    showDevice(response.device);
    setInspected(true);
  }
  async function submit() {
    if (!target.name) throw new Error("Renseignez le nom du client.");
    if (!cloud.ready)
      throw new Error(
        "Les deux associés doivent avoir activé leurs clés avant une opération fournisseur.",
      );
    if (!confirmed || !write)
      throw new Error(
        "Relisez puis confirmez l’action sur le panel sélectionné.",
      );
    if (
      mode !== "status" &&
      (!sale.trim() ||
        !cost.trim() ||
        ![sale, cost].every(
          (v) => Number.isFinite(Number(v)) && Number(v) >= 0,
        ))
    )
      throw new Error(
        "Renseignez le prix de vente et le coût avant de confirmer.",
      );
    if (pendingId) return;
    const providerKey = key();
    const type = kind;
    const details =
      mode === "create"
        ? {
            type,
            ...(type === "mag" ? { mac: draftSub.mac } : {}),
            months,
            pack,
            country,
          }
        : {
            ...identity(),
            ...(mode === "renew" ? { months } : { enabled: changedStatus }),
          };
    const meta: ProviderContext = {
      panelId,
      subscriptionId: draftSub.id,
      mode,
      type,
      months,
      pack,
      sale,
      cost,
      player: draftSub.player || "",
    };
    const contextBox = await cloud.sealProviderContext(target, meta);
    const operationId = crypto.randomUUID();
    setPendingId(operationId);
    setConfirmed(false);
    let response;
    try {
      response = await providerRequest<{ operation: ProviderOperation }>(
        mode,
        providerKey,
        {
          ...details,
          operationId,
          ownerId: cloud.ownerFor(client.id),
          clientId: client.id,
          subscriptionId: mode === "create" ? null : draftSub.id,
          contextBox,
          confirmed: true,
        },
      );
    } catch (e) {
      if (e instanceof HttpError && [400, 403, 409, 422].includes(e.status))
        setPendingId("");
      throw e;
    }
    await accept(response.operation);
  }
  async function apply() {
    if (!applied.current) {
      const next = applyProviderDevice(
        target,
        {
          ...draftSub,
          sale,
          cost,
          sales:
            mode === "renew" && subscription && !subscription.sales?.length
              ? invoice(
                  subscription,
                  "legacy:" + subscription.id,
                  subscription.start + "T12:00:00Z",
                ).sales
              : draftSub.sales,
          player: initialContext?.player || draftSub.player || "",
          type: kind === "mag" ? "MAG" : "M3U",
        },
        device,
        panelId,
        { start, expires },
        receipt || undefined,
      );
      await onApply(next);
      applied.current = true;
    }
    if (operation)
      await request("provider", {
        action: "ack",
        operationId: operation.id,
        confirmed: true,
      });
    onFinish();
  }
  const resultReady = !!receipt || (mode === "inspect" && inspected);
  const uncertain = locked && !receipt;
  return (
    <div className="provider-workflow">
      <p>
        {mode === "inspect"
          ? "Consultez l’abonnement sur son panel, puis enregistrez les informations reçues."
          : mode === "create"
            ? "Créez un véritable abonnement chez votre fournisseur, puis ajoutez-le à la fiche client."
            : mode === "renew"
              ? "Renouvelez l’abonnement chez le fournisseur sélectionné."
              : "Modifiez le statut réel de l’abonnement dans le panel."}
      </p>
      {!resultReady && !uncertain && (
        <>
          {!client.name && (
            <>
              <label className="field">
                <span>Nom du client</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setConfirmed(false);
                  }}
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Téléphone du client</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setConfirmed(false);
                  }}
                  disabled={busy}
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Panel fournisseur</span>
            <select
              value={panelId}
              aria-label="Panel fournisseur"
              disabled={busy}
              onChange={(e) => {
                setPanelId(e.target.value);
                setCost(
                  panelCost(
                    panels.find((p) => p.id === e.target.value),
                    months,
                  ) ||
                    subscription?.cost ||
                    "",
                );
                setPackages([]);
                setPack("");
                setConfirmed(false);
                setInspected(false);
                setDevice(null);
              }}
            >
              <option value="">Choisir le bon panel…</option>
              {panels.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.key}>
                  {p.name}
                  {!p.key ? " · clé manquante" : ""}
                </option>
              ))}
            </select>
          </label>
          {mode === "create" && (
            <>
              <label className="field">
                <span>Type d’abonnement</span>
                <select
                  value={kind}
                  aria-label="Type d’abonnement"
                  disabled={busy}
                  onChange={(e) => {
                    setKind(e.target.value as "mag" | "m3u");
                    setConfirmed(false);
                  }}
                >
                  <option value="m3u">M3U · identifiant et mot de passe</option>
                  <option value="mag">MAG · adresse MAC</option>
                </select>
              </label>
              {kind === "mag" && (
                <label className="field">
                  <span>Adresse MAC</span>
                  <input
                    value={draftSub.mac}
                    placeholder="00:00:00:00:00:00"
                    disabled={busy}
                    onChange={(e) => {
                      setDraftSub({ ...draftSub, mac: e.target.value });
                      setConfirmed(false);
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                className="secondary full"
                disabled={busy || !panel?.key}
                onClick={() =>
                  void run(async () => {
                    const r = await providerRequest<{
                      packages: { id: string; name: string }[];
                    }>("packages", key());
                    setPackages(r.packages);
                    if (!r.packages.length)
                      throw new Error("Aucun bouquet disponible sur ce panel.");
                  })
                }
              >
                Charger les bouquets de ce panel
              </button>
              <label className="field">
                <span>Bouquet fournisseur</span>
                <select
                  value={pack}
                  aria-label="Bouquet fournisseur"
                  disabled={busy || !packages.length}
                  onChange={(e) => {
                    setPack(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">Choisir un bouquet…</option>
                  {packages.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pays (facultatif)</span>
                <input
                  value={country}
                  maxLength={3}
                  placeholder="FR ou ALL pour VPN"
                  disabled={busy}
                  onChange={(e) => {
                    setCountry(e.target.value.toUpperCase());
                    setConfirmed(false);
                  }}
                />
              </label>
            </>
          )}
          {(mode === "create" || mode === "renew") && (
            <>
              <label className="field">
                <span>Durée chez le fournisseur</span>
                <select
                  value={months}
                  disabled={busy}
                  onChange={(e) => {
                    setMonths(Number(e.target.value));
                    setCost(
                      panelCost(panel, Number(e.target.value)) ||
                        subscription?.cost ||
                        "",
                    );
                    setConfirmed(false);
                  }}
                >
                  {mode === "create" && (
                    <option value="trial24" disabled>
                      Test 24 h · non documenté par l’API
                    </option>
                  )}
                  {[1, 3, 6, 12].map((n) => (
                    <option value={n} key={n}>
                      {n} mois
                    </option>
                  ))}
                </select>
              </label>
              {mode === "create" && (
                <p className="fine-print">
                  L’API fournie documente uniquement 1, 3, 6 et 12 mois. Créez
                  le test 24 h dans le panel, puis enregistrez sa fiche avec la
                  durée « Test 24 h ».
                </p>
              )}
            </>
          )}
          {mode !== "create" && (
            <button
              type="button"
              className="secondary full"
              disabled={busy || !panel?.key}
              onClick={() => void run(consult)}
            >
              Consulter cet abonnement dans le panel
            </button>
          )}
          {device && (
            <div role="status" className="alert">
              Expiration dans le panel : {device.expires || "Non communiquée"}
              <br />
              État :{" "}
              {device.enabled === null
                ? "Non communiqué"
                : device.enabled
                  ? "Actif"
                  : "Suspendu"}
            </div>
          )}
          {(mode === "create" || mode === "renew") && (
            <div className="form-grid">
              <label className="field">
                <span>Prix de vente (€)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sale}
                  disabled={busy}
                  onChange={(e) => {
                    setSale(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="field">
                <span>Prix d’achat (€)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  disabled={busy}
                  onChange={(e) => {
                    setCost(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="field">
                <span>Application utilisée</span>
                <select
                  aria-label="Application utilisée"
                  value={draftSub.player || ""}
                  disabled={busy}
                  onChange={(e) =>
                    setDraftSub({
                      ...draftSub,
                      player: e.target.value as
                        "Tivimate" | "Smarters Player" | "IBO Player" | "",
                    })
                  }
                >
                  <option value="">Choisir…</option>
                  <option>Tivimate</option>
                  <option>Smarters Player</option>
                  <option>IBO Player</option>
                </select>
              </label>
            </div>
          )}
          {write && (
            <>
              <div className="alert">
                {target.name || "Nouveau client"} ·{" "}
                {panel?.name || "Panel à choisir"}
                <br />
                {mode === "status"
                  ? changedStatus
                    ? "Activation"
                    : "Suspension"
                  : `${mode === "create" ? "Création" : "Renouvellement"} · ${months} mois`}
                {mode === "create" && pack && (
                  <>
                    <br />
                    Bouquet : {packages.find((p) => p.id === pack)?.name}
                  </>
                )}
                {mode !== "status" && (
                  <p>
                    Cette action peut utiliser des crédits de ce panel. Le coût
                    est fixé par votre fournisseur.
                  </p>
                )}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Je confirme cette action sur{" "}
                {panel?.name || "le panel sélectionné"} pour{" "}
                {target.name || "ce client"}.
              </label>
              <button
                type="button"
                className="primary full"
                disabled={
                  busy ||
                  !confirmed ||
                  !panel?.key ||
                  (mode === "create" && (!pack || !name.trim())) ||
                  (mode !== "create" && !inspected)
                }
                onClick={() => void run(submit)}
              >
                {busy
                  ? "Opération en cours…"
                  : mode === "create"
                    ? "Confirmer la création"
                    : mode === "renew"
                      ? `Confirmer le renouvellement de ${months} mois`
                      : changedStatus
                        ? "Confirmer l’activation"
                        : "Confirmer la suspension"}
              </button>
            </>
          )}
        </>
      )}
      {uncertain && (
        <>
          <p className="alert" role="status">
            {operation?.state === "failed"
              ? "Le fournisseur a refusé cette opération. Aucun nouvel essai automatique n’a été lancé."
              : "Le résultat reste à vérifier. Ne relancez pas la création ou le renouvellement : des crédits ont peut-être déjà été utilisés."}
          </p>
          <button
            type="button"
            className="secondary full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await request<{ operation: ProviderOperation }>(
                  "provider",
                  { action: "receipt", operationId: pendingId },
                );
                await accept(r.operation);
              })
            }
          >
            Rechercher le résultat enregistré
          </button>
          {mode !== "create" && (
            <button
              type="button"
              className="secondary full"
              disabled={busy || !panel?.key}
              onClick={() => void run(consult)}
            >
              Vérifier l’abonnement dans le panel
            </button>
          )}
          {device && (
            <p className="alert">
              Expiration actuelle du panel :{" "}
              {device.expires || "Non communiquée"}. État :{" "}
              {device.enabled === null
                ? "Non communiqué"
                : device.enabled
                  ? "Actif"
                  : "Suspendu"}
              .
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            J’ai vérifié le résultat directement dans mon panel fournisseur.
          </label>
          <button
            type="button"
            className="secondary full"
            disabled={busy || !confirmed || !operation}
            onClick={() =>
              void run(async () => {
                await request("provider", {
                  action: "resolve",
                  operationId: pendingId,
                  confirmed: true,
                });
                onFinish();
              })
            }
          >
            Clôturer après vérification manuelle
          </button>
          <p className="fine-print">
            Vous retrouverez cette opération dans Paramètres → Opérations
            fournisseur à reprendre.
          </p>
        </>
      )}
      {resultReady && (
        <>
          <div role="status" className="alert">
            <strong>
              {receipt
                ? "Action confirmée par le fournisseur"
                : "Informations reçues du panel"}
            </strong>
            <br />
            {panel?.name || "Panel enregistré"} · {target.name}
            {receipt?.needsSync && (
              <p>
                Certaines informations n’ont pas été confirmées par le panel.
                Vérifiez-les avant d’enregistrer ; ne relancez pas l’action.
              </p>
            )}
          </div>
          <label className="field">
            <span>Date de début du suivi</span>
            <input
              type="date"
              value={start}
              disabled={busy}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span>
              {device?.expires
                ? "Expiration reçue du fournisseur"
                : "Expiration à renseigner (non communiquée)"}
            </span>
            <input
              type="date"
              value={expires}
              readOnly={!!device?.expires}
              disabled={busy}
              onChange={(e) => setExpires(e.target.value)}
            />
          </label>
          {kind === "m3u" && (
            <label className="field">
              <span>Identifiant fournisseur</span>
              <input
                value={draftSub.username}
                readOnly={!!device?.username}
                disabled={busy}
                onChange={(e) =>
                  setDraftSub({ ...draftSub, username: e.target.value })
                }
              />
            </label>
          )}
          {kind === "m3u" && (
            <label className="field">
              <span>Mot de passe fournisseur</span>
              <input
                type="password"
                autoComplete="new-password"
                value={draftSub.password}
                readOnly={!!device?.password}
                disabled={busy}
                onChange={(e) =>
                  setDraftSub({ ...draftSub, password: e.target.value })
                }
              />
            </label>
          )}
          <button
            type="button"
            className="primary full"
            disabled={busy || !validDate(expires)}
            onClick={() => void run(apply)}
          >
            {busy
              ? "Enregistrement…"
              : applied.current
                ? "Terminer l’enregistrement"
                : "Enregistrer le résultat dans la fiche"}
          </button>
          <p className="fine-print">
            Cette étape enregistre la fiche chiffrée. Elle ne relance aucune
            action chez le fournisseur.
          </p>
        </>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
          {pendingId && !operation
            ? " Retrouvez le résultat via le bouton de recherche, sans relancer l’opération."
            : ""}
        </p>
      )}
    </div>
  );
}

export function ProviderHistory({
  cloud,
  onResume,
}: {
  cloud: CloudWorkspace;
  onResume: (
    client: Client,
    meta: ProviderContext,
    operation: ProviderOperation,
  ) => void;
}) {
  const [rows, setRows] = useState<ProviderOperation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    request<{ operations: ProviderOperation[] }>("provider", {
      action: "history",
    })
      .then((r) => {
        if (live) setRows(r.operations);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function resume(row: ProviderOperation) {
    try {
      setError("");
      if (cloud.ownerFor(row.client_id) !== row.owner_id)
        throw new Error(
          "Sélectionnez d’abord la clientèle concernée dans le menu en haut de l’app, puis reprenez cette opération.",
        );
      const value = (await decryptCloud(
        row.context_box,
        row.owner_id,
        1,
        cloud.profile.id,
        cloud.privateKey,
      )) as Vault & { providerContext?: ProviderContext };
      const client = value.clients.find((c) => c.id === row.client_id);
      if (!client || !value.providerContext)
        throw new Error(
          "Le contexte de cette opération ne peut pas être ouvert.",
        );
      onResume(client, value.providerContext, row);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div>
      <p>
        Les résultats restent chiffrés et accessibles à vous et votre associé.
        Une opération incertaine doit être vérifiée avant tout nouvel essai.
      </p>
      {loading && <p>Chargement…</p>}
      {!loading && !rows.length && <p>Aucune opération à reprendre.</p>}
      {rows.map((r) => (
        <div key={r.id} className="provider-operation-row">
          <div>
            <strong>{operationName[r.action]}</strong>
            <p>
              {new Date(r.created_at).toLocaleString("fr-FR")} ·{" "}
              {r.state === "succeeded"
                ? "Résultat à enregistrer"
                : r.state === "failed"
                  ? "Refusée"
                  : "À vérifier"}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => void resume(r)}
          >
            Reprendre
          </button>
        </div>
      ))}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
