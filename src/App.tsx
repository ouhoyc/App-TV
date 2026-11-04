import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileUp,
  Home,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Network,
  X,
  Copy,
  Share2,
  RefreshCw,
  WifiOff,
  Archive,
  Trash2,
  Pencil,
  CircleHelp,
  Images,
  ExternalLink,
} from "lucide-react";
import Coins from "./StackedCoins";
import { APP_VERSION } from "./version";
import { lastOpenSummary } from "./openTiming";
import { externalBrowserHref, normalizeWebAddress } from "./externalBrowser";
import type { Profile } from "./cloudStore";
import {
  decrypt,
  derive,
  encrypt,
  exportBackup,
  parseEnvelope,
  type Envelope,
  type Session,
} from "./crypto";
import { loadEnvelope, saveEnvelope } from "./storage";
import {
  addMonths,
  daysLeft,
  duplicate,
  emptyVault,
  mergeClients,
  newClient,
  newSubscription,
  providerPanels,
  renew,
  searchClients,
  state,
  today,
  validateVault,
  contactPlatforms,
  type Client,
  type ProviderPanel,
  type Subscription,
  type Plan,
  type Vault,
} from "./model";
import { csvFields, mapCsv, parseCsv, type CsvField } from "./csv";
import {
  PROVIDER_URL,
  normalizeProviderKey,
  testProviderConnection,
  type ProviderAccount,
} from "./provider";
import { watchBackgroundLock } from "./backgroundLock";
import ProviderWorkflow, { ProviderHistory } from "./ProviderWorkflow";
import type { ProviderContext, ProviderOperation } from "./providerWorkflow";
import type { CloudPayload } from "./cloudCrypto";
import {
  CustomerTable,
  FinancialDashboard,
  type CustomerOrder,
} from "./Business";
import {
  applyPlan,
  customerContact,
  clientPseudo,
  panelAccent,
  clientNotes,
  serverAddress,
  planMonths,
  paidSubscription,
  panelCost,
  planOf,
  prepareClient,
  financialSummary,
  money,
} from "./commerce";
import Notifications from "./Notifications";
import { PanelAccess, panelSite } from "./PanelAccess";
import { takeNotificationClient } from "./notificationNavigation";
const MediaLibrary = lazy(() => import("./Media"));

const date = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(s + "T12:00:00"));
const initials = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
const message = (c: Client, s: Subscription) =>
  `Bonjour ${c.name},\n\nVoici tes informations de connexion :\n\nService : ${s.provider}\nIdentifiant : ${s.username}\nMot de passe : ${s.password}\nServeur : ${s.server}\nExpiration : ${date(s.expires)}`;
export type Page =
  | "dashboard"
  | "clients"
  | "resellers"
  | "expirations"
  | "balance"
  | "media"
  | "settings";
type Dialog =
  | { kind: "edit"; client: Client }
  | { kind: "detail"; id: string }
  | { kind: "renew"; client: Client; subscription: Subscription }
  | { kind: "share"; client: Client; subscription: Subscription }
  | { kind: "backup" }
  | { kind: "restore" }
  | { kind: "csv" }
  | { kind: "provider" }
  | { kind: "provider-history" }
  | {
      kind: "provider-action";
      client: Client;
      subscription?: Subscription;
      mode: ProviderContext["mode"];
      operation?: ProviderOperation;
      context?: ProviderContext;
    }
  | null;
function Badge({ subscription }: { subscription: Subscription }) {
  const label = state(subscription);
  return (
    <span
      className={
        "badge " +
        (label === "Actif"
          ? "good"
          : label === "À renouveler"
            ? "soon"
            : "muted-badge")
      }
    >
      <i />
      {label}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Secret({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="secret">
      <div>
        <small>{label}</small>
        <p>{value || "Non renseigné"}</p>
      </div>
      <button
        className="icon-button"
        disabled={!value}
        onClick={() => onCopy(value)}
        aria-label={"Copier " + label}
      >
        <Copy size={17} />
      </button>
    </div>
  );
}

export interface CloudWorkspace {
  vault: Vault;
  privateKey: CryptoKey;
  save: (vault: Vault) => Promise<void>;
  onLock: () => void;
  profile: Profile;
  ownerLabel: (clientId: string) => string;
  providerFor: (clientId: string) => Vault["provider"];
  ownerFor: (clientId: string) => string;
  sealProviderContext: (
    client: Client,
    meta: ProviderContext,
  ) => Promise<CloudPayload>;
  ready: boolean;
  viewOwners: string[];
  sealMedia: (asset: unknown) => Promise<CloudPayload>;
  syncReminders: () => Promise<unknown>;
  onRefresh: () => void;
  onLegacyImport: () => void;
}
export default function App({
  cloud,
  accountHeader,
  accountNotices,
  settingsContent,
  settingsFooter,
  resellersContent,
  initialPage = "dashboard",
  onPageChange,
}: {
  cloud?: CloudWorkspace;
  accountHeader?: ReactNode;
  accountNotices?: ReactNode;
  settingsContent?: ReactNode;
  settingsFooter?: ReactNode;
  resellersContent?: ReactNode;
  initialPage?: Page;
  onPageChange?: (page: Page) => void;
} = {}) {
  const [envelope, setEnvelope] = useState<Envelope | null | undefined>(
      undefined,
    ),
    [vault, setVault] = useState<Vault | null>(cloud?.vault || null),
    [session, setSession] = useState<Session | null>(
      cloud ? { key: cloud.privateKey, salt: "", iterations: 0 } : null,
    );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [accepted, setAccepted] = useState(false);
  const [page, setPage] = useState<Page>(initialPage),
    [query, setQuery] = useState(""),
    [dialog, setDialog] = useState<Dialog>(null),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [storageError, setStorageError] = useState(false);
  const [archived, setArchived] = useState(false),
    [customerOrder, setCustomerOrder] = useState<CustomerOrder>("access"),
    [expiryFilter, setExpiryFilter] = useState("followup");
  const scrollPane = useRef<HTMLDivElement>(null);
  function navigate(next: Page) {
    setPage(next);
    onPageChange?.(next);
    setQuery("");
    scrollPane.current?.scrollTo({ top: 0 });
  }
  const locked = useRef(!cloud);
  const writing = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    function open() {
      if (!vault) return;
      const id = takeNotificationClient(vault.clients.map((c) => c.id));
      if (id) {
        navigate("clients");
        setDialog({ kind: "detail", id });
      }
    }
    open();
    window.addEventListener("scdr-notification-open", open);
    return () => window.removeEventListener("scdr-notification-open", open);
  }, [vault]);
  useEffect(() => {
    if (cloud) void cloud.syncReminders().catch(() => {});
  }, []);
  useEffect(() => {
    if (cloud) return;
    loadEnvelope()
      .then(setEnvelope)
      .catch((e) => {
        setError(e.message);
        setStorageError(true);
      });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setRevision((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    const sw = () =>
      setNotice(
        "Le mode hors ligne n’a pas pu être installé. Reconnectez-vous et rechargez.",
      );
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("offline-unavailable", sw);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("offline-unavailable", sw);
    };
  }, []);
  function lock() {
    if (cloud) {
      cloud.onLock();
      return;
    }
    locked.current = true;
    setSession(null);
    setVault(null);
    setDialog(null);
    setQuery("");
    setPassword("");
    setConfirmation("");
    setError("");
    setNotice("");
  }
  useEffect(() => {
    // AccountApp owns the cloud session's lock lifecycle and Face ID resume.
    // Two visibility listeners otherwise turn a background lock into a manual
    // lock, suppressing the automatic Face ID attempt on return.
    if (cloud || !session) return;
    return watchBackgroundLock(lock);
  }, [session, Boolean(cloud)]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let result: { vault: Vault; session: Session };
      if (envelope) {
        result = await decrypt(envelope, password);
      } else {
        if (password.length < 12 || password !== confirmation || !accepted)
          throw new Error(
            "Utilisez 12 caractères minimum, confirmez le mot de passe et lisez l’avertissement.",
          );
        const key = await derive(password);
        const v = emptyVault();
        const saved = await encrypt(v, key);
        await saveEnvelope(saved, null);
        setEnvelope(saved);
        result = { vault: v, session: key };
      }
      locked.current = false;
      setSession(result.session);
      setVault(result.vault);
      setPassword("");
      setConfirmation("");
      navigator.storage?.persist?.().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit(next: Vault) {
    if (writing.current || !session || locked.current)
      throw new Error(
        "Une sauvegarde est en cours. Réessayez dans un instant.",
      );
    validateVault(next);
    writing.current = true;
    setBusy(true);
    try {
      if (cloud) {
        await cloud.save(next);
        if (!locked.current) setVault(next);
        return;
      }
      const saved = await encrypt(next, session);
      await saveEnvelope(saved, envelope!.ciphertext);
      setEnvelope(saved);
      if (!locked.current) setVault(next);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copy(value: string, message?: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(
        message ||
          "Copié. Le presse-papiers peut être accessible à d’autres applications.",
      );
    } catch {
      setError("Copie indisponible dans ce navigateur.");
    }
  }
  async function saveClient(client: Client) {
    if (!vault) return;
    client = prepareClient(
      vault.clients.find((c) => c.id === client.id),
      client,
    );
    await commit({
      ...vault,
      clients: vault.clients.some((c) => c.id === client.id)
        ? vault.clients.map((c) => (c.id === client.id ? client : c))
        : [client, ...vault.clients],
    });
    setDialog(null);
    setNotice(
      cloud
        ? "Fiche chiffrée et enregistrée sur le serveur."
        : "Fiche enregistrée dans le coffre.",
    );
  }
  const brand = (
    <div className="brand">
      <span className="brand-symbol">
        <img src="/scdr-tv-192.png" alt="" width="40" height="40" />
      </span>
      <span>
        SCDR TV<sup>CLIENTS & ABONNEMENTS</sup>
      </span>
    </div>
  );
  if (!vault || !session)
    return (
      <div className="lock-layout">
        <header>
          {brand}
          <span className="security-caption">
            <ShieldCheck size={14} /> VOTRE ESPACE, VOS DONNÉES
          </span>
        </header>
        <main className="unlock">
          <div className="lock-emblem">
            <LockKeyhole size={26} />
          </div>
          <span className="eyebrow">CLIENTS & ABONNEMENTS</span>
          <h1>
            {storageError
              ? "Stockage inaccessible."
              : envelope === undefined
                ? "Ouverture de votre espace…"
                : envelope
                  ? "Heureux de vous retrouver."
                  : "Un espace à vous."}
          </h1>
          <p className="subtitle">
            {envelope
              ? "Déverrouillez votre coffre pour retrouver vos clients."
              : "Vos clients. Vos informations. Sous votre contrôle."}
          </p>
          {envelope === undefined && !storageError ? (
            <p>Ouverture du stockage local…</p>
          ) : storageError ? (
            <div className="alert error">
              {error} Le coffre existant n’a pas été remplacé.
            </div>
          ) : (
            <form onSubmit={unlock}>
              <Field
                label={
                  envelope
                    ? "Mot de passe maître"
                    : "Créer votre mot de passe maître"
                }
                type="password"
                autoComplete={envelope ? "current-password" : "new-password"}
                minLength={envelope ? undefined : 12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  envelope ? "Votre mot de passe" : "12 caractères minimum"
                }
              />
              {!envelope && (
                <>
                  <Field
                    label="Confirmer le mot de passe"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      required
                    />
                    <span>
                      Je comprends que mon mot de passe ne peut pas être
                      récupéré et qu’une sauvegarde externe est indispensable.
                    </span>
                  </label>
                </>
              )}
              {error && (
                <p role="alert" className="alert error">
                  {error}
                </p>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Protection du coffre…"
                  : envelope
                    ? "Déverrouiller"
                    : "Créer mon coffre"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {envelope === null && !storageError && (
            <details className="storage-help">
              <summary>Vous aviez déjà créé un coffre ?</summary>
              <p>
                Aucun coffre n’a été trouvé dans ce navigateur à cette adresse.
                Revenez à l’adresse utilisée au départ et ouvrez l’app de la
                même façon : Safari ou icône d’accueil. Les liens d’aperçu et la
                navigation privée peuvent utiliser un stockage différent.
              </p>
              <p>
                Cette version n’a pas encore de compte utilisateur ni de
                sauvegarde serveur. Créer un nouveau mot de passe ne récupère
                pas vos anciennes fiches. Une sauvegarde exportée peut être
                restaurée depuis les paramètres après création d’un coffre.
              </p>
            </details>
          )}
          <div className="privacy-line">
            <ShieldCheck size={15} />
            <span>Chiffrement AES-256-GCM · Données sur cet appareil</span>
          </div>
          <p className="fine-print">
            Effacer les données Safari, perdre l’iPhone ou supprimer l’app peut
            effacer ce coffre. Exportez régulièrement une sauvegarde chiffrée
            hors de cet appareil. Aucun accès de secours au mot de passe.
          </p>
        </main>
        <footer className="lock-footer">
          Pensé pour rester entre vos mains.
        </footer>
      </div>
    );
  void revision;
  const activeClients = vault.clients.filter((c) => !c.archived),
    visibleClients = vault.clients.filter((c) => c.archived === archived),
    searched = searchClients(visibleClients, query);
  const subscriptions = activeClients.flatMap((c) =>
    c.subscriptions.map((s) => ({ client: c, subscription: s })),
  );
  const enabled = subscriptions.filter(
    ({ subscription: s }) => s.status === "enabled",
  );
  const soon = enabled
    .filter(
      ({ subscription: s }) =>
        daysLeft(s.expires) >= 0 && daysLeft(s.expires) <= 7,
    )
    .sort((a, b) =>
      a.subscription.expires.localeCompare(b.subscription.expires),
    );
  const monthTotals = financialSummary(vault.clients);
  const panelNameFor = (client: Client, sub: Subscription) =>
    providerPanels(cloud ? cloud.providerFor(client.id) : vault.provider).find(
      (p) => p.id === sub.panelId,
    )?.name || sub.provider;
  const activeShare = activeClients.length
    ? Math.round(
        (activeClients.filter((c) =>
          c.subscriptions.some(
            (s) => s.status === "enabled" && daysLeft(s.expires) >= 0,
          ),
        ).length /
          activeClients.length) *
          100,
      )
    : 0;
  const current =
    dialog?.kind === "detail"
      ? vault.clients.find((c) => c.id === dialog.id)
      : null;
  const nav = [
    { id: "dashboard" as const, label: "Accueil", icon: Home },
    { id: "clients" as const, label: "Clients", icon: Users },
    { id: "resellers" as const, label: "Revendeurs", icon: Network },
    { id: "expirations" as const, label: "Expirations", icon: Clock3 },
    { id: "balance" as const, label: "Bilan", icon: Coins },
    { id: "media" as const, label: "Médias", icon: Images },
  ];
  function clientRow(c: Client) {
    const s = [...c.subscriptions].sort((a, b) =>
      a.expires.localeCompare(b.expires),
    )[0];
    return (
      <button
        key={c.id}
        className="client-row"
        onClick={() => setDialog({ kind: "detail", id: c.id })}
      >
        <span className="avatar">{initials(clientPseudo(c))}</span>
        <span className="row-main">
          <strong>
            {c.name}
            {c.subscriptions.some((s) => s.paid !== true) && (
              <Coins
                className="unpaid-inline"
                size={16}
                aria-label="Non réglé"
              />
            )}
          </strong>
          <small>
            {cloud?.profile.role === "admin"
              ? cloud.ownerLabel(c.id) + " · "
              : ""}
            {c.subscriptions
              .map((s) => s.provider)
              .filter(Boolean)
              .join(" · ") || "Aucun fournisseur"}
            {c.subscriptions.length > 1
              ? ` · ${c.subscriptions.length} abonnements`
              : ""}
          </small>
        </span>
        <span className="client-row-end">
          {s ? (
            <>
              <Badge subscription={s} />
              <small>{date(s.expires)}</small>
            </>
          ) : (
            <small>Sans abonnement</small>
          )}
        </span>
        <ChevronRight size={16} className="dim" />
      </button>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        {brand}
        <div className="workspace-label">MON ESPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "selected" : ""}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => {
                navigate(n.id);
                setQuery("");
              }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "expirations" && soon.length > 0 && (
                <span className="nav-count">{soon.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-state">
            <span className="status-dot" />
            <span>
              {cloud
                ? "Sauvegarde chiffrée synchronisée"
                : "Coffre local chiffré"}
              <small>
                {cloud
                  ? "Données rattachées à votre compte"
                  : "Aucune donnée dans le cloud"}
              </small>
            </span>
          </div>
          <div className="profile">
            <span className="profile-avatar">M</span>
            <div>
              {cloud?.profile.display_name || "Mon espace privé"}
              <small>
                {cloud
                  ? cloud.profile.role === "admin"
                    ? "Administrateur"
                    : "Sous-revendeur"
                  : "Sur cet appareil"}
              </small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <header className="topbar">
        <span className="app-wordmark">
          <img src="/scdr-tv-192.png" alt="" width="36" height="36" />
          SCDR <span>TV</span>
        </span>
        <div className="header-actions">
          {panelSite(vault.provider) ? (
            <a
              className="header-panel-link"
              href={externalBrowserHref(panelSite(vault.provider))}
              target={
                externalBrowserHref(panelSite(vault.provider)).startsWith(
                  "x-safari-",
                )
                  ? "_self"
                  : "_blank"
              }
              rel="noopener noreferrer"
              aria-label="Ouvrir le site du panel"
            >
              Panel <ExternalLink size={15} />
            </a>
          ) : (
            <button
              type="button"
              className="header-panel-link"
              aria-label="Configurer le lien du panel"
              onClick={() => {
                navigate("settings");
                requestAnimationFrame(() =>
                  document.getElementById("panel-site-input")?.focus(),
                );
              }}
            >
              Panel <ExternalLink size={15} />
            </button>
          )}
          <button
            className={
              "icon-button settings-gear" +
              (page === "settings" ? " active" : "")
            }
            aria-label="Paramètres"
            aria-pressed={page === "settings"}
            onClick={() => navigate("settings")}
          >
            <Settings size={24} />
          </button>
        </div>
      </header>
      {(page === "dashboard" || page === "clients") && accountHeader}
      <div className="main-shell" ref={scrollPane}>
        {accountNotices}
        <main className="content">
          <div className="page-heading">
            <div>
              <h1>
                {page === "dashboard"
                  ? "Accueil"
                  : page === "clients"
                    ? "Clients"
                    : page === "resellers"
                      ? "Revendeurs"
                      : page === "expirations"
                        ? "Expirations"
                        : page === "balance"
                          ? "Bilan"
                          : page === "media"
                            ? "Médias"
                            : "Paramètres"}
              </h1>
            </div>
            {page === "clients" && (
              <button
                className="primary"
                onClick={() => setDialog({ kind: "edit", client: newClient() })}
              >
                <Plus size={17} />
                Ajouter un client
              </button>
            )}
          </div>
          {!online && (
            <div className="alert">
              <WifiOff size={17} />
              {cloud
                ? "Vous êtes hors ligne. Les modifications ne pourront pas être synchronisées avant le retour du réseau."
                : "Vous êtes hors ligne. Votre coffre reste disponible."}
            </div>
          )}
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Fermer l’erreur"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              <Check size={17} />
              {notice}
            </div>
          )}
          {page === "dashboard" && (
            <>
              <button
                type="button"
                className="activity-card"
                style={{ "--share": activeShare + "%" } as React.CSSProperties}
                aria-label="Voir les clients"
                onClick={() => navigate("clients")}
              >
                <div className="activity-card-top">
                  <span className="activity-number">
                    {activeClients.length}
                  </span>
                  <span className="activity-icon">
                    <Users size={25} />
                  </span>
                </div>
                <span className="activity-label">Clients</span>
                <p>
                  {
                    activeClients.filter((c) =>
                      c.subscriptions.some(
                        (s) =>
                          s.status === "enabled" && daysLeft(s.expires) >= 0,
                      ),
                    ).length
                  }{" "}
                  avec abonnement en cours <span>·</span>{" "}
                  {activeClients.length
                    ? Math.round(
                        (activeClients.filter((c) =>
                          c.subscriptions.some(
                            (s) =>
                              s.status === "enabled" &&
                              daysLeft(s.expires) >= 0,
                          ),
                        ).length /
                          activeClients.length) *
                          100,
                      )
                    : 0}
                  %
                </p>
                <progress
                  aria-label="Part des clients avec abonnement en cours"
                  max="100"
                  value={
                    activeClients.length
                      ? (activeClients.filter((c) =>
                          c.subscriptions.some(
                            (s) =>
                              s.status === "enabled" &&
                              daysLeft(s.expires) >= 0,
                          ),
                        ).length /
                          activeClients.length) *
                        100
                      : 0
                  }
                />
              </button>
              <button
                type="button"
                className="month-profit"
                aria-label="Voir le bilan"
                onClick={() => navigate("balance")}
              >
                <span className="month-profit-icon">
                  <Coins size={22} />
                </span>
                <span className="month-profit-text">
                  <small>Bénéfice du mois</small>
                  <strong>
                    {monthTotals.annualIncomplete
                      ? "À compléter"
                      : money(monthTotals.monthly)}
                  </strong>
                </span>
                <ChevronRight size={18} />
              </button>
              <div className="urgency-strip">
                <button
                  onClick={() => {
                    setExpiryFilter("7");
                    navigate("expirations");
                  }}
                >
                  <span className="urgency-icon">
                    <Clock3 size={21} />
                  </span>
                  <span>
                    <strong>{soon.length}</strong>
                    <small>À renouveler</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setExpiryFilter("expired");
                    navigate("expirations");
                  }}
                >
                  <span className="urgency-icon expired">
                    <Archive size={21} />
                  </span>
                  <span>
                    <strong>
                      {
                        enabled.filter(
                          ({ subscription: s }) => daysLeft(s.expires) < 0,
                        ).length
                      }
                    </strong>
                    <small>Expirés</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                className="primary full dashboard-add"
                onClick={() => setDialog({ kind: "edit", client: newClient() })}
              >
                <Plus size={19} />
                Ajouter un client
              </button>
              <div className="dashboard-grid">
                <section className="panel expiry-panel">
                  <div className="section-heading">
                    <div>
                      <h2>
                        À renouveler{" "}
                        <span className="count">{soon.length}</span>
                      </h2>
                      <p>Les échéances des 7 prochains jours.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("expirations")}
                    >
                      Tout voir
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {soon.length ? (
                    soon.slice(0, 4).map(({ client: c, subscription: s }) => (
                      <div
                        className={
                          "expiry-row " + panelAccent(panelNameFor(c, s))
                        }
                        key={s.id}
                      >
                        <span className="avatar">
                          {initials(clientPseudo(c))}
                        </span>
                        <div className="row-main">
                          <strong>{clientPseudo(c, s)}</strong>
                          <small>
                            {s.provider || "Abonnement"} · {date(s.expires)}
                          </small>
                        </div>
                        <span className="days">
                          {daysLeft(s.expires) === 0
                            ? "Aujourd’hui"
                            : `Dans ${daysLeft(s.expires)} j`}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={"Renouveler " + clientPseudo(c, s)}
                          onClick={() =>
                            setDialog({
                              kind: "renew",
                              client: c,
                              subscription: s,
                            })
                          }
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty
                      icon={<Clock3 size={25} />}
                      title="Aucune urgence à l’horizon"
                      text="Les abonnements à renouveler apparaîtront ici."
                    />
                  )}
                  <div className="panel-foot">
                    <span className="status-dot" />
                    {
                      enabled.filter(
                        ({ subscription: s }) =>
                          daysLeft(s.expires) >= 0 && daysLeft(s.expires) <= 30,
                      ).length
                    }{" "}
                    abonnement(s) arrivent à échéance sous 30 jours
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "clients" && (
            <section className="panel">
              <div className="section-heading">
                <div className="tabs" role="group" aria-label="Affichage">
                  <button
                    className={
                      !archived && customerOrder === "access" ? "active" : ""
                    }
                    aria-pressed={!archived && customerOrder === "access"}
                    onClick={() => {
                      setArchived(false);
                      setCustomerOrder("access");
                    }}
                  >
                    Accès <span>{activeClients.length}</span>
                  </button>
                  <button
                    className={
                      !archived && customerOrder === "due" ? "active" : ""
                    }
                    aria-pressed={!archived && customerOrder === "due"}
                    onClick={() => {
                      setArchived(false);
                      setCustomerOrder("due");
                    }}
                  >
                    Échéances
                  </button>
                  <button
                    className={archived ? "active" : ""}
                    aria-pressed={archived}
                    onClick={() => setArchived(true)}
                  >
                    Archives
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() => setDialog({ kind: "csv" })}
                >
                  <FileUp size={16} />
                  Importer un CSV
                </button>
              </div>
              <SearchBox value={query} onChange={setQuery} />
              {!!searched.length && (
                <CustomerTable
                  clients={searched}
                  order={archived ? "access" : customerOrder}
                  onCopy={(value, message) => void copy(value, message)}
                  panelName={panelNameFor}
                  busy={busy}
                  onOpen={(id) => setDialog({ kind: "detail", id })}
                  onPaid={(client, sub) =>
                    void action(() =>
                      saveClient({
                        ...client,
                        subscriptions: client.subscriptions.map((s) =>
                          s.id === sub.id ? paidSubscription(s, true) : s,
                        ),
                      }),
                    )
                  }
                />
              )}
              {!searched.length && (
                <Empty
                  icon={<Users size={25} />}
                  title="Aucun client à afficher"
                  text="Ajoutez une fiche ou ajustez votre recherche."
                />
              )}
            </section>
          )}
          {page === "expirations" && (
            <section className="panel">
              <div className="section-heading wrap">
                <h2>À prolonger</h2>
                <select
                  aria-label="Filtrer les échéances"
                  value={expiryFilter}
                  onChange={(e) => setExpiryFilter(e.target.value)}
                >
                  <option value="7">Sous 7 jours</option>
                  <option value="followup">
                    À prolonger · tests et échéances
                  </option>
                  <option value="30">Sous 30 jours</option>
                  <option value="active">Tous les actifs</option>
                  <option value="expired">Expirés</option>
                  <option value="disabled">Suspendus</option>
                </select>
              </div>
              {(() => {
                const items = subscriptions
                  .filter(({ subscription: s }) =>
                    expiryFilter === "followup"
                      ? s.plan === "trial24" ||
                        (daysLeft(s.expires) <= 14 && s.status === "enabled")
                      : expiryFilter === "disabled"
                        ? s.status === "disabled"
                        : s.status === "enabled" &&
                          (expiryFilter === "expired"
                            ? daysLeft(s.expires) < 0
                            : expiryFilter === "active"
                              ? daysLeft(s.expires) >= 0
                              : daysLeft(s.expires) >= 0 &&
                                daysLeft(s.expires) <= Number(expiryFilter)),
                  )
                  .sort((a, b) =>
                    a.subscription.expires.localeCompare(
                      b.subscription.expires,
                    ),
                  );
                return items.length ? (
                  items.map(({ client: c, subscription: s }) => (
                    <div
                      className={
                        "expiry-row " + panelAccent(panelNameFor(c, s))
                      }
                      key={s.id}
                    >
                      <span className="avatar">
                        {initials(clientPseudo(c))}
                      </span>
                      <button
                        className="row-main plain"
                        onClick={() => setDialog({ kind: "detail", id: c.id })}
                      >
                        <strong>{clientPseudo(c, s)}</strong>
                        <small>
                          {s.provider || "Abonnement"} · {date(s.expires)}
                        </small>
                      </button>
                      <Badge subscription={s} />
                      <button
                        className="secondary small"
                        onClick={() =>
                          setDialog(
                            cloud && s.panelId && s.type !== "Autre"
                              ? {
                                  kind: "provider-action",
                                  mode: "renew",
                                  client: c,
                                  subscription: s,
                                }
                              : { kind: "renew", client: c, subscription: s },
                          )
                        }
                      >
                        <RefreshCw size={14} />
                        <span>Renouveler</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty
                    icon={<Clock3 size={26} />}
                    title="Aucune échéance dans cette période"
                    text="Vos abonnements sont affichés selon leurs dates locales."
                  />
                );
              })()}
            </section>
          )}
          {page === "resellers" &&
            (resellersContent || (
              <section className="panel reseller-manager">
                <Empty
                  icon={<Network size={26} />}
                  title="Votre espace revendeur"
                  text="Vous gérez votre propre clientèle. La gestion du réseau est réservée aux administrateurs."
                />
              </section>
            ))}
          {page === "balance" && (
            <FinancialDashboard
              clients={vault.clients}
              panels={providerPanels(vault.provider)}
            />
          )}
          {page === "media" &&
            (cloud ? (
              <Suspense fallback={<p>Chargement…</p>}>
                <MediaLibrary cloud={cloud} />
              </Suspense>
            ) : (
              <p>Connectez-vous à votre compte pour ajouter des publicités.</p>
            ))}
          {page === "settings" && (
            <div className="settings-grid">
              {settingsContent}
              <PanelAccess
                settings={vault.provider}
                busy={busy}
                onSave={async (provider) => {
                  await commit({ ...vault, provider });
                }}
              />
              {cloud && <Notifications cloud={cloud} />}
              <section className="panel settings-panel">
                <h2>Sauvegardes & données</h2>
                <p>
                  {cloud
                    ? "Vos données sont chiffrées sur l’appareil avant leur enregistrement sur votre compte."
                    : "Votre coffre est enregistré uniquement dans ce navigateur."}
                </p>
                {cloud && (
                  <Setting
                    icon={<ArrowDownLeft size={19} />}
                    title="Importer mon ancien coffre local"
                    text="Récupérez les fiches de ce navigateur sans effacer la copie locale."
                    onClick={cloud.onLegacyImport}
                  />
                )}
                <Setting
                  icon={<Download size={19} />}
                  title="Exporter une sauvegarde chiffrée"
                  text="Un fichier protégé par un mot de passe distinct."
                  onClick={() => setDialog({ kind: "backup" })}
                />
                <Setting
                  icon={<ArrowDownLeft size={19} />}
                  title="Restaurer une sauvegarde"
                  text="Vérification et aperçu avant toute modification."
                  onClick={() => setDialog({ kind: "restore" })}
                />
                <Setting
                  icon={<FileUp size={19} />}
                  title="Importer des clients en CSV"
                  text="Associez vos colonnes et vérifiez les doublons."
                  onClick={() => setDialog({ kind: "csv" })}
                />
                <div className="alert">
                  {cloud ? (
                    "Gardez aussi une sauvegarde externe chiffrée. Votre clé de récupération permet de retrouver votre compte et vos clés si vous oubliez votre mot de passe."
                  ) : (
                    <>
                      Sur iPhone : enregistrez la sauvegarde dans Fichiers,
                      idéalement sur un autre support. Effacer Safari, supprimer
                      l’app ou perdre l’appareil peut supprimer vos données. Le
                      stockage persistant n’est jamais garanti sur iOS.
                    </>
                  )}
                </div>
              </section>
              <section className="panel settings-panel">
                <h2>Services</h2>
                <Setting
                  icon={<KeyRound size={19} />}
                  title="Connexion fournisseur"
                  text="Strong 8K · deux panels et leurs crédits"
                  onClick={() => setDialog({ kind: "provider" })}
                />
                {cloud && (
                  <>
                    <Setting
                      icon={<Plus size={19} />}
                      title="Créer un client avec Strong 8K"
                      text="Choisir un panel et créer un abonnement réel."
                      onClick={() =>
                        setDialog({
                          kind: "provider-action",
                          client: { ...newClient(), subscriptions: [] },
                          mode: "create",
                        })
                      }
                    />
                    <Setting
                      icon={<RefreshCw size={19} />}
                      title="Opérations fournisseur à reprendre"
                      text="Retrouver les résultats et vérifier les opérations interrompues."
                      onClick={() => setDialog({ kind: "provider-history" })}
                    />
                  </>
                )}
                {!cloud && (
                  <>
                    <Setting
                      icon={<LockKeyhole size={19} />}
                      title="Verrouiller le coffre"
                      text="Jamais dans l’app · Après 5 minutes en arrière-plan."
                      onClick={lock}
                    />
                  </>
                )}
              </section>
              {settingsFooter}
              <p className="fine-print">SCDR TV · Version {APP_VERSION}</p>
              {lastOpenSummary() && (
                <p className="fine-print open-timing">
                  Dernière ouverture : {lastOpenSummary()}
                </p>
              )}
            </div>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation principale">
        {nav.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "selected" : ""}
            aria-current={page === n.id ? "page" : undefined}
            onClick={() => {
              navigate(n.id);
              setQuery("");
            }}
          >
            <n.icon size={20} />
            <span>{n.id === "dashboard" ? "Accueil" : n.label}</span>
          </button>
        ))}
      </nav>
      {dialog && (
        <Modal
          title={
            dialog.kind === "edit"
              ? vault.clients.some((c) => c.id === dialog.client.id)
                ? "Modifier le client"
                : "Nouveau client"
              : dialog.kind === "detail"
                ? "Fiche client"
                : dialog.kind === "renew"
                  ? "Renouveler un abonnement"
                  : dialog.kind === "share"
                    ? "Préparer le partage"
                    : dialog.kind === "backup"
                      ? "Sauvegarde chiffrée"
                      : dialog.kind === "restore"
                        ? "Restaurer une sauvegarde"
                        : dialog.kind === "csv"
                          ? "Importer un fichier CSV"
                          : dialog.kind === "provider-history"
                            ? "Opérations fournisseur à reprendre"
                            : dialog.kind === "provider-action"
                              ? dialog.mode === "create"
                                ? "Créer chez le fournisseur"
                                : dialog.mode === "renew"
                                  ? "Renouveler chez le fournisseur"
                                  : dialog.mode === "status"
                                    ? "Statut chez le fournisseur"
                                    : "Consulter le fournisseur"
                              : "Connexion fournisseur"
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          {dialog.kind === "edit" && (
            <ClientEditor
              client={dialog.client}
              panels={providerPanels(
                cloud ? cloud.providerFor(dialog.client.id) : vault.provider,
              )}
              busy={busy}
              onSave={(c) => action(() => saveClient(c))}
              onCreateProvider={
                cloud && !vault.clients.some((c) => c.id === dialog.client.id)
                  ? (client) =>
                      setDialog({
                        kind: "provider-action",
                        client: { ...client, subscriptions: [] },
                        mode: "create",
                      })
                  : undefined
              }
            />
          )}
          {dialog.kind === "detail" && current && (
            <>
              <div className="detail-heading">
                <span className="avatar large">
                  {initials(clientPseudo(current))}
                </span>
                <div>
                  <h2
                    className={panelAccent(
                      providerPanels(
                        cloud ? cloud.providerFor(current.id) : vault.provider,
                      ).find((p) => p.id === current.subscriptions[0]?.panelId)
                        ?.name ||
                        current.subscriptions[0]?.provider ||
                        "",
                    )}
                  >
                    {clientPseudo(current)}
                  </h2>
                  <p>
                    {customerContact(current).value
                      ? `${customerContact(current).platform} · ${customerContact(current).value}`
                      : ""}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Modifier le client"
                  onClick={() =>
                    setDialog({
                      kind: "edit",
                      client: structuredClone(current),
                    })
                  }
                >
                  <Pencil size={18} />
                </button>
              </div>
              {current.whatsapp && <p>WhatsApp : {current.whatsapp}</p>}
              {current.subscriptions.map((s) => (
                <section className="subscription-detail" key={s.id}>
                  <div className="section-heading">
                    <h3>{s.provider || "Abonnement"}</h3>
                    <Badge subscription={s} />
                  </div>
                  <p className="subscription-dates">
                    Du {date(s.start)} au {date(s.expires)}
                  </p>
                  {s.panelId && (
                    <p className="fine-print">
                      Panel :{" "}
                      {providerPanels(
                        cloud ? cloud.providerFor(current.id) : vault.provider,
                      ).find((p) => p.id === s.panelId)?.name ||
                        "À réassocier dans la fiche client"}
                    </p>
                  )}
                  {s.providerEnabled === null && (
                    <p className="fine-print">
                      État du panel : non communiqué.
                    </p>
                  )}
                  {[
                    ["Pseudo", clientPseudo(current, s)],
                    ["Mot de passe", s.password],
                    ["Lien du serveur", serverAddress(s)],
                    ...(s.mac ? [["Adresse MAC", s.mac]] : []),
                  ].map(([label, value]) => (
                    <Secret
                      key={label}
                      label={label}
                      value={value}
                      onCopy={copy}
                    />
                  ))}
                  {(s.sale || s.cost) && (
                    <p className="fine-print">
                      Vente : {s.sale || "—"} € · Achat : {s.cost || "—"} €
                    </p>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void action(() =>
                        saveClient({
                          ...current,
                          subscriptions: current.subscriptions.map((v) =>
                            v.id === s.id
                              ? paidSubscription(v, v.paid !== true)
                              : v,
                          ),
                        }),
                      )
                    }
                  >
                    {s.paid === true
                      ? "Marquer comme non réglé"
                      : "Marquer comme réglé"}
                  </button>
                  <div className="button-row">
                    {cloud && s.panelId && s.type !== "Autre" && (
                      <>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            setDialog({
                              kind: "provider-action",
                              client: current,
                              subscription: s,
                              mode: "inspect",
                            })
                          }
                        >
                          Actualiser depuis le panel
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            setDialog({
                              kind: "provider-action",
                              client: current,
                              subscription: s,
                              mode: "status",
                            })
                          }
                        >
                          {s.status === "disabled"
                            ? "Activer chez le fournisseur"
                            : "Suspendre chez le fournisseur"}
                        </button>
                      </>
                    )}
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        setDialog(
                          cloud && s.panelId && s.type !== "Autre"
                            ? {
                                kind: "provider-action",
                                client: current,
                                subscription: s,
                                mode: "renew",
                              }
                            : {
                                kind: "renew",
                                client: current,
                                subscription: s,
                              },
                        )
                      }
                    >
                      <RefreshCw size={15} />
                      Renouveler
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        setDialog({
                          kind: "share",
                          client: current,
                          subscription: s,
                        })
                      }
                    >
                      <Share2 size={15} />
                      Partager
                    </button>
                  </div>
                  {s.renewals.length > 0 && (
                    <details>
                      <summary>
                        Historique des renouvellements ({s.renewals.length})
                      </summary>
                      {s.renewals.map((r, i) => (
                        <p key={i} className="fine-print">
                          {new Date(r.at).toLocaleDateString("fr-FR")} :{" "}
                          {date(r.previous)} → {date(r.next)}
                        </p>
                      ))}
                    </details>
                  )}
                </section>
              ))}
              {clientNotes(current) && (
                <p className="note">{clientNotes(current)}</p>
              )}
              <div className="button-row detail-actions">
                {cloud && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      setDialog({
                        kind: "provider-action",
                        client: current,
                        mode: "create",
                      })
                    }
                  >
                    Créer un abonnement Strong 8K
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        current.archived
                          ? "Désarchiver cette fiche ?"
                          : "Archiver cette fiche ? Elle sera conservée dans les archives.",
                      )
                    )
                      action(() =>
                        saveClient({ ...current, archived: !current.archived }),
                      );
                  }}
                >
                  <Archive size={15} />
                  {current.archived ? "Désarchiver" : "Archiver"}
                </button>
                {(!cloud || cloud.profile.role === "admin") && (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Supprimer définitivement " +
                            current.name +
                            " et ses abonnements ? Cette action est irréversible.",
                        )
                      )
                        action(async () => {
                          await commit({
                            ...vault,
                            clients: vault.clients.filter(
                              (c) => c.id !== current.id,
                            ),
                          });
                          setDialog(null);
                        });
                    }}
                  >
                    <Trash2 size={15} />
                    Supprimer
                  </button>
                )}
              </div>
            </>
          )}
          {dialog.kind === "renew" && (
            <RenewalForm
              subscription={dialog.subscription}
              busy={busy}
              panel={providerPanels(
                cloud ? cloud.providerFor(dialog.client.id) : vault.provider,
              ).find((p) => p.id === dialog.subscription.panelId)}
              onRenew={(next, sale, cost, plan) =>
                action(async () => {
                  const updated = {
                    ...renew(dialog.subscription, next),
                    sale,
                    cost,
                    plan,
                    paid: false,
                    expiresAt: undefined,
                    trialStartedAt: undefined,
                  };
                  await saveClient({
                    ...dialog.client,
                    subscriptions: dialog.client.subscriptions.map((s) =>
                      s.id === updated.id ? updated : s,
                    ),
                  });
                })
              }
            />
          )}
          {dialog.kind === "share" && (
            <ShareForm
              client={dialog.client}
              subscription={dialog.subscription}
              copy={copy}
              notify={setError}
            />
          )}
          {dialog.kind === "backup" && (
            <BackupForm
              vault={vault}
              busy={busy}
              onExport={async (password) => {
                const serialized = await exportBackup(vault, password);
                const a = document.createElement("a");
                const url = URL.createObjectURL(
                  new Blob([serialized], { type: "application/json" }),
                );
                a.href = url;
                a.download = `prive-sauvegarde-${today()}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
                await commit({
                  ...vault,
                  lastBackup: new Date().toISOString(),
                });
                if (!locked.current)
                  setNotice(
                    "Export lancé. Vérifiez que le fichier est bien enregistré dans Fichiers.",
                  );
              }}
            />
          )}
          {dialog.kind === "restore" && (
            <RestoreForm
              vault={vault}
              busy={busy}
              onRestore={async (clients, replace) => {
                await commit({
                  ...vault,
                  clients: mergeClients(vault.clients, clients, replace),
                });
                setDialog(null);
                setNotice(
                  "Sauvegarde restaurée. Vos paramètres fournisseur actuels ont été conservés.",
                );
              }}
            />
          )}
          {dialog.kind === "csv" && (
            <CsvImport
              vault={vault}
              busy={busy}
              onImport={async (clients) => {
                await commit({
                  ...vault,
                  clients: mergeClients(vault.clients, clients, false),
                });
                setDialog(null);
                setNotice(
                  "Import terminé. Les fiches existantes ont été conservées.",
                );
              }}
            />
          )}
          {dialog.kind === "provider" && (
            <ProviderForm
              value={vault.provider}
              busy={busy}
              onlineAccount={!!cloud}
              onSave={async (provider) => {
                await commit({ ...vault, provider });
                setDialog(null);
                setNotice(
                  "Paramètres fournisseur enregistrés dans votre coffre chiffré.",
                );
              }}
            />
          )}
          {dialog.kind === "provider-action" && cloud && (
            <ProviderWorkflow
              key={
                dialog.operation?.id ||
                `${dialog.client.id}:${dialog.subscription?.id || "new"}:${dialog.mode}`
              }
              cloud={cloud}
              client={dialog.client}
              subscription={dialog.subscription}
              mode={dialog.mode}
              panels={providerPanels(cloud.providerFor(dialog.client.id))}
              initialOperation={dialog.operation}
              initialContext={dialog.context}
              onApply={async (client) => {
                await commit({
                  ...vault,
                  clients: vault.clients.some((c) => c.id === client.id)
                    ? vault.clients.map((c) =>
                        c.id === client.id ? client : c,
                      )
                    : [client, ...vault.clients],
                });
              }}
              onFinish={() => {
                setDialog(null);
                setNotice(
                  "Résultat fournisseur enregistré. Aucune action distante n’a été répétée.",
                );
              }}
            />
          )}
          {dialog.kind === "provider-history" && cloud && (
            <ProviderHistory
              cloud={cloud}
              onResume={(captured, context, operation) => {
                const current =
                  vault.clients.find((c) => c.id === captured.id) || captured;
                setDialog({
                  kind: "provider-action",
                  client: current,
                  subscription:
                    current.subscriptions.find(
                      (s) => s.id === context.subscriptionId,
                    ) ||
                    captured.subscriptions.find(
                      (s) => s.id === context.subscriptionId,
                    ),
                  mode: context.mode,
                  operation,
                  context,
                });
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  icon,
  accent,
}: {
  label: string;
  value: number;
  caption: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={"metric " + (accent ? "accent" : "")}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>
        {accent ? <span className="mini-dot" /> : null}
        {caption}
      </small>
    </section>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input
        aria-label="Rechercher des clients"
        inputMode="search"
        enterKeyHint="search"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="Rechercher un pseudo…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Effacer la recherche">
          <X size={16} />
        </button>
      )}
    </label>
  );
}
export function Setting({
  icon,
  title,
  text,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="setting" onClick={onClick}>
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

function ClientEditor({
  client,
  panels,
  busy,
  onSave,
  onCreateProvider,
}: {
  client: Client;
  panels: ProviderPanel[];
  busy: boolean;
  onSave: (c: Client) => void;
  onCreateProvider?: (c: Client) => void;
}) {
  const [draft, setDraft] = useState(() => {
    const value = structuredClone(client);
    value.name = clientPseudo(client);
    value.notes = clientNotes(client);
    value.subscriptions = value.subscriptions.map((sub, i) => {
      const next = sub.expires ? sub : applyPlan(sub, "year1");
      return {
        ...next,
        username: i === 0 ? value.name : sub.username,
        server: serverAddress(sub),
        notes: "",
        cost:
          sub.cost ||
          (sub.plan === "trial24"
            ? "0"
            : panelCost(
                panels.find((p) => p.id === sub.panelId),
                planMonths(planOf(next)) || 12,
              )),
      };
    });
    return value;
  });
  const [problem, setProblem] = useState("");
  const set = (key: keyof Client, value: string) =>
    setDraft({ ...draft, [key]: value });
  function sub(id: string, key: keyof Subscription, value: string) {
    setDraft({
      ...draft,
      subscriptions: draft.subscriptions.map((s) =>
        s.id === id ? { ...s, [key]: value } : s,
      ),
    });
  }
  const contact = customerContact(draft);
  function setContact(
    platform: (typeof contactPlatforms)[number],
    value: string,
  ) {
    setDraft({
      ...draft,
      contact: { platform, value },
      ...(platform === "Téléphone"
        ? { phone: value }
        : platform === "WhatsApp"
          ? { whatsapp: value }
          : {}),
    });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const c = {
            ...draft,
            name: draft.name.trim(),
            subscriptions: draft.subscriptions.map((s) => ({
              ...s,
              server: normalizeWebAddress(s.server),
            })),
          };
          validateVault({ ...emptyVault(), clients: [c] });
          setProblem("");
          onSave(c);
        } catch (e) {
          setProblem((e as Error).message);
        }
      }}
    >
      <div className="form-grid">
        <Field
          label="Pseudo *"
          required
          maxLength={200}
          value={draft.name}
          onChange={(e) =>
            setDraft({
              ...draft,
              name: e.target.value,
              subscriptions: draft.subscriptions.map((v, i) =>
                i === 0 ? { ...v, username: e.target.value } : v,
              ),
            })
          }
          autoComplete="off"
        />
        <label className="field">
          <span>Plateforme de contact</span>
          <select
            aria-label="Plateforme de contact"
            value={contact.platform}
            onChange={(e) =>
              setContact(
                e.target.value as (typeof contactPlatforms)[number],
                contact.value,
              )
            }
          >
            {contactPlatforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <Field
          label="Contact"
          value={contact.value}
          onChange={(e) => setContact(contact.platform, e.target.value)}
          placeholder={
            contact.platform === "Téléphone" || contact.platform === "WhatsApp"
              ? "+33…"
              : "Pseudo ou coordonnées"
          }
        />
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          aria-label="Notes"
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
      {onCreateProvider && (
        <button
          type="button"
          className="secondary full"
          disabled={busy}
          onClick={() => onCreateProvider(draft)}
        >
          Créer l’abonnement dans un panel Strong 8K
        </button>
      )}
      {draft.subscriptions.map((s, i) => (
        <fieldset key={s.id}>
          <legend>Abonnement {i + 1}</legend>
          <div className="form-grid">
            <label className="field">
              <span>Panel Strong 8K</span>
              <select
                value={s.panelId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const calculated = panelCost(
                    panels.find((p) => p.id === id),
                    s.plan === "month1"
                      ? 1
                      : s.plan === "month3"
                        ? 3
                        : s.plan === "month6"
                          ? 6
                          : 12,
                  );
                  setDraft({
                    ...draft,
                    subscriptions: draft.subscriptions.map((v) =>
                      v.id === s.id
                        ? {
                            ...v,
                            panelId: id,
                            provider:
                              panels.find((p) => p.id === id)?.name ||
                              v.provider,
                            cost: s.plan === "trial24" ? "0" : calculated,
                          }
                        : v,
                    ),
                  });
                }}
              >
                <option value="">Non renseigné</option>
                {s.panelId && !panels.some((p) => p.id === s.panelId) && (
                  <option value={s.panelId}>Panel à réassocier</option>
                )}
                {panels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Application utilisée</span>
              <select
                aria-label="Application utilisée"
                value={s.player || ""}
                onChange={(e) => sub(s.id, "player", e.target.value)}
              >
                <option value="">Choisir…</option>
                <option>Tivimate</option>
                <option>Smarters Player</option>
                <option>IBO Player</option>
              </select>
            </label>
            <Field
              label="Mot de passe"
              type="text"
              autoComplete="off"
              value={s.password}
              onChange={(e) => sub(s.id, "password", e.target.value)}
            />
            <Field
              label="Lien du serveur"
              type="text"
              inputMode="url"
              placeholder="https://…"
              value={s.server}
              onChange={(e) => sub(s.id, "server", e.target.value)}
            />
            {s.type === "MAG" && (
              <Field
                label="Adresse MAC"
                placeholder="00:00:00:00:00:00"
                pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}"
                value={s.mac}
                onChange={(e) => sub(s.id, "mac", e.target.value)}
              />
            )}
            <Field
              label="Date de début *"
              type="date"
              required
              value={s.start}
              readOnly={s.plan === "trial24"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  subscriptions: draft.subscriptions.map((v) =>
                    v.id === s.id
                      ? applyPlan({ ...v, start: e.target.value }, planOf(v))
                      : v,
                  ),
                })
              }
            />
            <label className="field">
              <span>Durée de l’abonnement</span>
              <select
                aria-label="Durée de l’abonnement"
                value={
                  s.plan === "trial24"
                    ? "trial24"
                    : s.plan === "year1"
                      ? "12"
                      : s.plan === "month6"
                        ? "6"
                        : s.plan === "month3"
                          ? "3"
                          : s.plan === "month1"
                            ? "1"
                            : ""
                }
                onChange={(e) => {
                  const plan: Plan =
                    e.target.value === "trial24"
                      ? "trial24"
                      : e.target.value === "12"
                        ? "year1"
                        : e.target.value === "6"
                          ? "month6"
                          : e.target.value === "3"
                            ? "month3"
                            : e.target.value === "1"
                              ? "month1"
                              : "custom";
                  const updated = applyPlan(s, plan);
                  if (plan === "trial24") {
                    updated.sale ||= "0";
                    updated.cost ||= "0";
                  } else if (e.target.value)
                    updated.cost =
                      panelCost(
                        panels.find((p) => p.id === s.panelId),
                        Number(e.target.value),
                      ) || s.cost;
                  setDraft({
                    ...draft,
                    subscriptions: draft.subscriptions.map((v) =>
                      v.id === s.id ? updated : v,
                    ),
                  });
                }}
              >
                <option value="">Personnalisée</option>
                <option value="trial24">Test 24 h</option>
                <option value="1">1 mois</option>
                <option value="3">3 mois</option>
                <option value="6">6 mois</option>
                <option value="12">12 mois</option>
              </select>
            </label>
            {s.plan === "trial24" && (
              <Field
                label="Début du test 24 h"
                type="datetime-local"
                value={
                  s.trialStartedAt
                    ? new Date(
                        Date.parse(s.trialStartedAt) -
                          new Date(s.trialStartedAt).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  const instant = new Date(e.target.value);
                  if (Number.isFinite(+instant))
                    setDraft({
                      ...draft,
                      subscriptions: draft.subscriptions.map((v) =>
                        v.id === s.id ? applyPlan(v, "trial24", instant) : v,
                      ),
                    });
                }}
              />
            )}
            <Field
              label="Date d’expiration *"
              type="date"
              required
              min={s.start}
              value={s.expires}
              readOnly={s.plan === "trial24"}
              onChange={(e) => sub(s.id, "expires", e.target.value)}
            />
            <Field
              label="Prix de vente (€)"
              type="number"
              min="0"
              step="0.01"
              value={s.sale}
              onChange={(e) => sub(s.id, "sale", e.target.value)}
            />
            <Field
              label="Prix d’achat (€)"
              type="number"
              min="0"
              step="0.01"
              value={s.cost}
              readOnly={!!panels.find((p) => p.id === s.panelId)?.annualCost}
              onChange={(e) => sub(s.id, "cost", e.target.value)}
            />
            <label className="field">
              <span>Statut local</span>
              <select
                value={s.status}
                onChange={(e) => sub(s.id, "status", e.target.value)}
              >
                <option value="enabled">Activé</option>
                <option value="disabled">Suspendu</option>
              </select>
            </label>
          </div>
          <button
            className="text-button danger-text"
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Retirer cet abonnement et son historique de cette fiche ?",
                )
              )
                setDraft({
                  ...draft,
                  subscriptions: draft.subscriptions.filter(
                    (item) => item.id !== s.id,
                  ),
                });
            }}
          >
            Retirer cet abonnement
          </button>
        </fieldset>
      ))}
      {problem && (
        <p role="alert" className="alert error">
          {problem}
        </p>
      )}
      <button className="primary full form-submit" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer la fiche"}
        <Check size={17} />
      </button>
    </form>
  );
}
function RenewalForm({
  subscription,
  busy,
  onRenew,
  panel,
}: {
  subscription: Subscription;
  busy: boolean;
  onRenew: (next: string, sale: string, cost: string, plan: Plan) => void;
  panel?: ProviderPanel;
}) {
  const [next, setNext] = useState(
    addMonths(
      subscription.expires > today() ? subscription.expires : today(),
      12,
    ),
  );
  const [plan, setPlan] = useState<Plan>("year1"),
    [sale, setSale] = useState(subscription.sale),
    [cost, setCost] = useState(panelCost(panel) || subscription.cost);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRenew(next, sale, cost, plan);
      }}
    >
      <p>
        Expiration actuelle : <strong>{date(subscription.expires)}</strong>
      </p>
      <Field
        label="Nouvelle date d’expiration"
        type="date"
        required
        min={subscription.expires > today() ? subscription.expires : today()}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <p className="alert">
        <CircleHelp size={18} />
        Cette action met à jour le suivi. Le renouvellement chez le fournisseur
        se fait depuis la fiche liée à son panel.
      </p>
      <label className="field">
        <span>Durée de prolongation</span>
        <select
          aria-label="Durée de prolongation"
          value={plan}
          onChange={(e) => {
            const p = e.target.value as Plan;
            setPlan(p);
            const months =
              p === "year1" ? 12 : p === "month6" ? 6 : p === "month3" ? 3 : 1;
            setNext(
              addMonths(
                subscription.expires > today() ? subscription.expires : today(),
                months,
              ),
            );
            setCost(panelCost(panel, months) || subscription.cost);
          }}
        >
          <option value="month1">1 mois</option>
          <option value="month3">3 mois</option>
          <option value="month6">6 mois</option>
          <option value="year1">1 an</option>
        </select>
      </label>
      <Field
        label="Prix de vente (€)"
        type="number"
        min="0"
        step="0.01"
        required
        value={sale}
        onChange={(e) => setSale(e.target.value)}
      />
      <Field
        label="Prix d’achat (€)"
        type="number"
        min="0"
        step="0.01"
        required
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />
      <p className="sr-only">
        Cette action met à jour votre suivi local uniquement. Elle ne renouvelle
        rien chez le fournisseur et ne réactive pas un abonnement suspendu.
      </p>
      <button className="primary full" disabled={busy}>
        Enregistrer le renouvellement
      </button>
    </form>
  );
}
function ShareForm({
  client,
  subscription,
  copy,
  notify,
}: {
  client: Client;
  subscription: Subscription;
  copy: (s: string) => void;
  notify: (s: string) => void;
}) {
  const [text, setText] = useState(message(client, subscription));
  const [consent, setConsent] = useState(false);
  return (
    <>
      <p>Relisez et modifiez le message avant de choisir son destinataire.</p>
      <textarea
        className="share-text"
        aria-label="Message à partager"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Ce message contient des identifiants en clair. Je comprends le risque
          de confidentialité.
        </span>
      </label>
      <div className="button-row">
        <button
          className="primary"
          disabled={!consent}
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ text });
              else copy(text);
            } catch (e) {
              if ((e as Error).name !== "AbortError")
                notify(
                  "Le partage n’a pas abouti. Vous pouvez copier le message.",
                );
            }
          }}
        >
          <Share2 size={16} />
          {typeof navigator.share === "function"
            ? "Partager…"
            : "Copier le message"}
        </button>
        <button
          className="secondary"
          disabled={!consent}
          onClick={() =>
            window.open(
              "https://wa.me/" +
                (client.whatsapp || client.phone).replace(/\D/g, "") +
                "?text=" +
                encodeURIComponent(text),
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          WhatsApp
        </button>
        <a
          className={"secondary " + (!consent ? "disabled" : "")}
          aria-disabled={!consent}
          href={
            consent
              ? "sms:" +
                client.phone.replace(/[^+\d]/g, "") +
                "&body=" +
                encodeURIComponent(text)
              : undefined
          }
          onClick={(e) => {
            if (!consent) e.preventDefault();
          }}
        >
          SMS
        </a>
      </div>
      <p className="fine-print">
        L’application ouvre une fenêtre de partage ; vous confirmez vous-même
        l’envoi. L’ouverture de WhatsApp transmet le message à WhatsApp.
      </p>
    </>
  );
}
function BackupForm({
  vault,
  busy,
  onExport,
}: {
  vault: Vault;
  busy: boolean;
  onExport: (p: string) => Promise<void>;
}) {
  const [p, setP] = useState(""),
    [c, setC] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (p !== c) {
          setError("Les mots de passe ne correspondent pas.");
          return;
        }
        setWorking(true);
        try {
          await onExport(p);
          setP("");
          setC("");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setWorking(false);
        }
      }}
    >
      <p>
        {vault.clients.length} client(s), tous les abonnements, leurs
        identifiants, l’historique et les paramètres fournisseur seront protégés
        dans un fichier indépendant.
      </p>
      <Field
        label="Mot de passe de sauvegarde (12 caractères minimum)"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        value={p}
        onChange={(e) => setP(e.target.value)}
      />
      <Field
        label="Confirmer ce mot de passe"
        type="password"
        autoComplete="new-password"
        required
        value={c}
        onChange={(e) => setC(e.target.value)}
      />
      <p className="alert">
        Conservez ce mot de passe en lieu sûr. Sans lui, la sauvegarde est
        irrécupérable. Enregistrez le fichier en dehors de cet iPhone.
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy || working}>
        <Download size={16} />
        {working ? "Chiffrement…" : "Exporter le fichier chiffré"}
      </button>
    </form>
  );
}
function RestoreForm({
  vault,
  busy,
  onRestore,
}: {
  vault: Vault;
  busy: boolean;
  onRestore: (clients: Client[], replace: boolean) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [p, setP] = useState(""),
    [incoming, setIncoming] = useState<Vault | null>(null),
    [replace, setReplace] = useState(false),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const duplicates =
    incoming?.clients.filter((c) => vault.clients.some((v) => duplicate(v, c)))
      .length || 0;
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setWorking(true);
          setError("");
          try {
            if (file.size > 20_000_000)
              throw new Error("Fichier trop volumineux.");
            const result = await decrypt(parseEnvelope(await file.text()), p);
            setIncoming(result.vault);
            setP("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setWorking(false);
          }
        }}
      >
        <label className="field">
          <span>Fichier de sauvegarde chiffrée</span>
          <input
            type="file"
            accept=".json,application/json"
            required
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setIncoming(null);
            }}
          />
        </label>
        <Field
          label="Mot de passe de la sauvegarde"
          type="password"
          autoComplete="off"
          required
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        <button className="secondary full" disabled={working}>
          {working ? "Vérification…" : "Déchiffrer et vérifier"}
        </button>
      </form>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {incoming && (
        <div className="import-preview">
          <h3>Intégrité vérifiée</h3>
          <p>
            {incoming.clients.length} client(s) · {duplicates} doublon(s)
            possible(s).
          </p>
          <ul>
            {incoming.clients.slice(0, 8).map((c) => (
              <li key={c.id}>
                {c.name} · {c.subscriptions.length} abonnement(s)
              </li>
            ))}
          </ul>
          <p className="fine-print">
            Les paramètres fournisseur contenus dans le fichier ne remplacent
            pas ceux de ce coffre.
          </p>
          {duplicates > 0 && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <span>
                Remplacer les fiches correspondantes, y compris leurs
                abonnements et historiques. Sans cette option, elles seront
                conservées.
              </span>
            </label>
          )}
          <button
            className="primary full"
            disabled={busy || working}
            onClick={async () => {
              if (
                !confirm(
                  replace
                    ? "Confirmer la restauration et le remplacement des doublons ?"
                    : "Confirmer l’ajout des clients sans remplacer les fiches existantes ?",
                )
              )
                return;
              try {
                setWorking(true);
                await onRestore(incoming.clients, replace);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setWorking(false);
              }
            }}
          >
            Confirmer la restauration
          </button>
        </div>
      )}
    </>
  );
}
function CsvImport({
  vault,
  busy,
  onImport,
}: {
  vault: Vault;
  busy: boolean;
  onImport: (clients: Client[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Partial<Record<CsvField, number>>>({}),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const result = rows.length
    ? mapCsv(rows, mapping)
    : { clients: [], errors: [] };
  const duplicates = result.clients.filter(
    (c, i) =>
      vault.clients.some((v) => duplicate(v, c)) ||
      result.clients.slice(0, i).some((v) => duplicate(v, c)),
  ).length;
  return (
    <>
      <p>
        Fichiers séparés par virgules ou points-virgules. Les données restent en
        mémoire jusqu’à confirmation ; aucun CSV n’est enregistré.
      </p>
      <label className="field">
        <span>Choisir un CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setRows([]);
            setError("");
            if (!file) return;
            try {
              if (file.size > 5_000_000) throw new Error("5 Mo maximum.");
              const parsed = parseCsv(await file.text());
              setRows(parsed);
              const m: Partial<Record<CsvField, number>> = {};
              for (const key of Object.keys(csvFields) as CsvField[]) {
                const i = parsed[0].findIndex(
                  (h) =>
                    h.toLowerCase().trim() === key ||
                    h.toLowerCase().trim() === csvFields[key].toLowerCase(),
                );
                if (i >= 0) m[key] = i;
              }
              setMapping(m);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      {rows.length > 0 && (
        <>
          <h3>Associer les colonnes</h3>
          <div className="form-grid">
            {(Object.keys(csvFields) as CsvField[]).map((f) => (
              <label className="field" key={f}>
                <span>
                  {csvFields[f]}
                  {f === "name" ? " *" : ""}
                </span>
                <select
                  value={mapping[f] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [f]:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Ignorer</option>
                  {rows[0].map((h, i) => (
                    <option value={i} key={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="import-preview">
            <h3>Aperçu de l’import</h3>
            <p>
              {result.clients.length} ligne(s) valide(s) · {duplicates}{" "}
              doublon(s) ignoré(s).
            </p>
            <ul>
              {result.clients.slice(0, 5).map((c) => (
                <li key={c.id}>
                  {c.name} · {c.subscriptions.length} abonnement(s) ·
                  identifiants masqués
                </li>
              ))}
            </ul>
            {result.errors.length > 0 && (
              <div className="alert error">
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {result.errors.length > 10 && (
                  <p>… {result.errors.length - 10} autres erreurs.</p>
                )}
                Corrigez le fichier avant de confirmer l’import.
              </div>
            )}
            <p className="fine-print">
              Doublons détectés par identifiant, téléphone ou nom exact. Les
              fiches déjà présentes sont conservées.
            </p>
            <button
              className="primary full"
              disabled={
                busy ||
                working ||
                !result.clients.length ||
                !!result.errors.length ||
                mapping.name === undefined
              }
              onClick={async () => {
                if (
                  !confirm(
                    "Confirmer l’import des lignes affichées ? Les doublons seront ignorés.",
                  )
                )
                  return;
                setWorking(true);
                try {
                  await onImport(result.clients);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setWorking(false);
                }
              }}
            >
              Confirmer l’import
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </>
  );
}
function ProviderForm({
  value,
  busy,
  onlineAccount,
  onSave,
}: {
  value: Vault["provider"];
  busy: boolean;
  onlineAccount: boolean;
  onSave: (v: Vault["provider"]) => Promise<void>;
}) {
  const [panels, setPanels] = useState<ProviderPanel[]>(() => {
      const saved = providerPanels(value).map((p) => ({ ...p }));
      while (saved.length < 2)
        saved.push({
          id: crypto.randomUUID(),
          name: `Panel ${saved.length + 1}`,
          key: "",
        });
      return saved;
    }),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [testing, setTesting] = useState(false),
    [saving, setSaving] = useState(false),
    [accounts, setAccounts] = useState<
      Record<string, ProviderAccount | undefined>
    >({});
  const panel = panels[selected];
  const key = panel.key;
  const account = accounts[panel.id];
  function editPanel(
    field: "name" | "key" | "annualCost" | "dashboardUrl",
    text: string,
  ) {
    setPanels(
      panels.map((p) => (p.id === panel.id ? { ...p, [field]: text } : p)),
    );
    if (field === "key") setAccounts({ ...accounts, [panel.id]: undefined });
    setError("");
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (busy || testing || saving) return;
          setError("");
          setSaving(true);
          const next = panels.map((p) => ({
            ...p,
            name: p.name.trim(),
            key: p.key.trim() ? normalizeProviderKey(p.key) : "",
          }));
          if (next.some((p) => !p.name))
            throw new Error("Donnez un nom à chacun des deux panels.");
          if (
            next[0].name.toLocaleLowerCase() ===
            next[1].name.toLocaleLowerCase()
          )
            throw new Error(
              "Choisissez deux noms différents pour distinguer vos panels.",
            );
          if (next[0].key && next[0].key === next[1].key)
            throw new Error(
              "Les deux panels ont la même clé. Vérifiez la clé du second fournisseur.",
            );
          if (next.some((p) => /\s/.test(p.key)))
            throw new Error("Une clé API ne doit pas contenir d’espace.");
          if (
            next.some(
              (p) =>
                p.annualCost !== undefined &&
                p.annualCost !== "" &&
                (!Number.isFinite(Number(p.annualCost)) ||
                  Number(p.annualCost) < 0),
            )
          )
            throw new Error("Vérifiez le prix d’achat de chaque panel.");
          if (
            next.some(
              (p) => p.dashboardUrl && !/^https?:\/\//i.test(p.dashboardUrl),
            )
          )
            throw new Error(
              "Le lien du panel doit commencer par https:// ou http://.",
            );
          await onSave({
            ...value,
            url: PROVIDER_URL,
            key: next[0].key,
            panels: next,
          });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p>Deux fournisseurs Strong 8K, deux clés et deux soldes distincts.</p>
      <label className="field">
        <span>Panel à configurer</span>
        <select
          value={selected}
          disabled={busy || testing || saving}
          onChange={(e) => {
            setSelected(Number(e.target.value));
            setError("");
          }}
        >
          {panels.map((p, i) => (
            <option key={p.id} value={i}>
              {p.name || `Panel ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Nom du panel"
        value={panel.name}
        maxLength={80}
        required
        disabled={busy || testing || saving}
        onChange={(e) => editPanel("name", e.target.value)}
      />
      <Field
        label="Adresse HTTPS de l’API"
        type="url"
        value={PROVIDER_URL}
        readOnly
      />
      <Field
        label="Prix d’achat annuel (€)"
        type="number"
        min="0"
        step="0.01"
        value={panel.annualCost || ""}
        disabled={busy || testing || saving}
        onChange={(e) => editPanel("annualCost", e.target.value)}
      />
      <Field
        label="Clé API personnelle"
        type="password"
        maxLength={4096}
        placeholder="Clé API seule ou lien API complet"
        disabled={busy || testing || saving}
        autoComplete="new-password"
        value={key}
        onChange={(e) => {
          editPanel("key", e.target.value);
        }}
      />
      <div className="alert">
        Ce test consulte uniquement le compte et les crédits du panel
        sélectionné. Aucun abonnement n’est créé ou renouvelé. Cette API ne
        fournit pas la liste de vos clients.
      </div>
      <p className="muted">
        La clé transite en HTTPS par notre serveur vers le fournisseur pour le
        test. Elle est conservée dans votre coffre chiffré uniquement si vous
        l’enregistrez.
      </p>
      {!onlineAccount && (
        <p role="alert" className="alert">
          Connectez-vous à votre compte SCDR TV pour tester l’API.
        </p>
      )}
      <button
        type="button"
        className="secondary full"
        disabled={!onlineAccount || !key.trim() || busy || testing || saving}
        onClick={async () => {
          setError("");
          setAccounts({ ...accounts, [panel.id]: undefined });
          setTesting(true);
          try {
            const result = await testProviderConnection(key.trim());
            setAccounts((previous) => ({ ...previous, [panel.id]: result }));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setTesting(false);
          }
        }}
      >
        {testing ? "Connexion au fournisseur…" : "Tester la connexion"}
      </button>
      {account && (
        <div role="status" className="alert">
          <strong>Connexion réussie</strong>
          <br />
          Panel : {panel.name}
          <br />
          Compte : {account.name || "Non communiqué"}
          <br />
          Crédits :{" "}
          {account.credits === null
            ? "Non communiqués"
            : new Intl.NumberFormat("fr-FR", {
                maximumFractionDigits: 4,
              }).format(account.credits)}
          <br />
          {account.enabled === null
            ? "État du compte : non communiqué"
            : account.enabled
              ? "Compte fournisseur actif"
              : "Compte fournisseur désactivé : contactez le fournisseur."}
        </div>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button
        className="primary full form-submit"
        disabled={
          busy || testing || saving || !panels.some((p) => p.key.trim())
        }
      >
        {saving ? "Enregistrement…" : "Enregistrer les deux panels"}
      </button>
    </form>
  );
}
