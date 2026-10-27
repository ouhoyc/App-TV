import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { version } from "../package.json";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
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
  X,
  Copy,
  Share2,
  RefreshCw,
  WifiOff,
  Archive,
  Trash2,
  Pencil,
  CircleHelp,
} from "lucide-react";
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
  renew,
  searchClients,
  state,
  today,
  validateVault,
  type Client,
  type Subscription,
  type Vault,
} from "./model";
import { csvFields, mapCsv, parseCsv, type CsvField } from "./csv";
import { providerAvailability } from "./provider";

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
type Page = "dashboard" | "clients" | "expirations" | "settings";
type Dialog =
  | { kind: "edit"; client: Client }
  | { kind: "detail"; id: string }
  | { kind: "renew"; client: Client; subscription: Subscription }
  | { kind: "share"; client: Client; subscription: Subscription }
  | { kind: "backup" }
  | { kind: "restore" }
  | { kind: "csv" }
  | { kind: "provider" }
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
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret">
      <div>
        <small>{label}</small>
        <p>{value ? (visible ? value : "••••••••••••") : "Non renseigné"}</p>
      </div>
      <button
        className="icon-button"
        onClick={() => setVisible(!visible)}
        aria-label={(visible ? "Masquer " : "Afficher ") + label}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
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

export default function App() {
  const [envelope, setEnvelope] = useState<Envelope | null | undefined>(
      undefined,
    ),
    [vault, setVault] = useState<Vault | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [accepted, setAccepted] = useState(false);
  const [page, setPage] = useState<Page>("dashboard"),
    [query, setQuery] = useState(""),
    [dialog, setDialog] = useState<Dialog>(null),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [storageError, setStorageError] = useState(false);
  const [archived, setArchived] = useState(false),
    [expiryFilter, setExpiryFilter] = useState("7");
  const locked = useRef(true);
  const writing = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
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
    if (!session) return;
    const delay = 5 * 60 * 1000;
    let deadline = Date.now() + delay;
    let timer: number;
    const check = () => {
      clearTimeout(timer);
      const remaining = deadline - Date.now();
      if (remaining <= 0) lock();
      else timer = window.setTimeout(check, remaining);
    };
    const reset = () => {
      if (Date.now() >= deadline) {
        check();
        return;
      }
      if (document.hidden) return;
      deadline = Date.now() + delay;
      check();
    };
    const resume = () => {
      // iOS may suspend timers in the background: check elapsed time on return.
      if (!document.hidden) check();
    };
    for (const event of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(event, reset, { passive: true });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    check();
    return () => {
      clearTimeout(timer);
      for (const event of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(event, reset);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [session]);
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
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(
        "Copié. Le presse-papiers peut être accessible à d’autres applications.",
      );
    } catch {
      setError("Copie indisponible dans ce navigateur.");
    }
  }
  async function saveClient(client: Client) {
    if (!vault) return;
    await commit({
      ...vault,
      clients: vault.clients.some((c) => c.id === client.id)
        ? vault.clients.map((c) => (c.id === client.id ? client : c))
        : [client, ...vault.clients],
    });
    setDialog(null);
    setNotice("Fiche enregistrée dans le coffre.");
  }
  const brand = (
    <div className="brand">
      <span className="brand-symbol">
        p<span>·</span>
      </span>
      <span>
        privé<sup>PERSONAL WORKSPACE</sup>
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
            {envelope ? "Heureux de vous retrouver." : "Un espace à vous."}
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
  const current =
    dialog?.kind === "detail"
      ? vault.clients.find((c) => c.id === dialog.id)
      : null;
  const nav = [
    { id: "dashboard" as const, label: "Vue d’ensemble", icon: Home },
    { id: "clients" as const, label: "Clients", icon: Users },
    { id: "expirations" as const, label: "Expirations", icon: Clock3 },
    { id: "settings" as const, label: "Paramètres", icon: Settings },
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
        <span className="avatar">{initials(c.name)}</span>
        <span className="row-main">
          <strong>{c.name}</strong>
          <small>
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
              onClick={() => {
                setPage(n.id);
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
              Coffre local chiffré<small>Aucune donnée dans le cloud</small>
            </span>
          </div>
          <button onClick={lock}>
            <LockKeyhole size={17} />
            Verrouiller l’espace
          </button>
          <div className="profile">
            <span className="profile-avatar">M</span>
            <div>
              Mon espace privé<small>Sur cet appareil</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Mon espace <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </span>
          <span className="desktop-security">
            <ShieldCheck size={14} /> Espace privé et chiffré
          </span>
          <button
            className="icon-button mobile-lock"
            onClick={lock}
            aria-label="Verrouiller"
          >
            <LockKeyhole size={19} />
          </button>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">VOTRE PANEL PERSONNEL</span>
              <h1>
                {page === "dashboard"
                  ? "Tout est à sa place."
                  : page === "clients"
                    ? "Votre carnet clients."
                    : page === "expirations"
                      ? "Gardez une longueur d’avance."
                      : "Un espace sous contrôle."}
              </h1>
              <p className="subtitle">
                {page === "dashboard"
                  ? "Une vue claire sur vos clients et leurs abonnements."
                  : page === "clients"
                    ? "Les bonnes informations, toujours à portée de main."
                    : page === "expirations"
                      ? "Anticipez les échéances, simplement."
                      : "Vos données restent les vôtres."}
              </p>
            </div>
            {page !== "settings" && (
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
              Vous êtes hors ligne. Votre coffre reste disponible.
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
              <div className="metrics">
                <Metric
                  label="Total clients"
                  value={activeClients.length}
                  icon={<Users size={18} />}
                  caption="Dans votre carnet"
                />
                <Metric
                  label="Abonnements actifs"
                  value={
                    enabled.filter(
                      ({ subscription: s }) => daysLeft(s.expires) >= 0,
                    ).length
                  }
                  icon={<ShieldCheck size={18} />}
                  caption="En cours de validité"
                />
                <Metric
                  label="Sous 7 jours"
                  value={soon.length}
                  icon={<Clock3 size={18} />}
                  caption="À anticiper"
                  accent
                />
                <Metric
                  label="Abonnements expirés"
                  value={
                    enabled.filter(
                      ({ subscription: s }) => daysLeft(s.expires) < 0,
                    ).length
                  }
                  icon={<Archive size={18} />}
                  caption="À faire le point"
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel expiry-panel">
                  <div className="section-heading">
                    <div>
                      <h2>
                        À renouveler bientôt{" "}
                        <span className="count">{soon.length}</span>
                      </h2>
                      <p>Les échéances des 7 prochains jours.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("expirations")}
                    >
                      Tout voir
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {soon.length ? (
                    soon.slice(0, 4).map(({ client: c, subscription: s }) => (
                      <div className="expiry-row" key={s.id}>
                        <span className="avatar">{initials(c.name)}</span>
                        <div className="row-main">
                          <strong>{c.name}</strong>
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
                          aria-label={"Renouveler " + c.name}
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
                <section className="backup-card">
                  <div className="card-icon">
                    <ShieldCheck size={24} />
                  </div>
                  <span className="eyebrow">L’ESSENTIEL, À L’ABRI</span>
                  <h2>
                    Votre tranquillité
                    <br />a une sauvegarde.
                  </h2>
                  <p>
                    Gardez une copie chiffrée de vos données, indépendante de
                    tout fournisseur.
                  </p>
                  <button onClick={() => setDialog({ kind: "backup" })}>
                    <Download size={17} />
                    Créer une sauvegarde
                    <ArrowUpRight size={17} />
                  </button>
                  <small>
                    {vault.lastBackup
                      ? "Dernier export : " +
                        date(vault.lastBackup.slice(0, 10))
                      : "Aucune sauvegarde exportée pour le moment"}
                  </small>
                </section>
              </div>
              <section className="panel clients-panel">
                <div className="section-heading">
                  <div>
                    <h2>Derniers clients ajoutés</h2>
                    <p>Votre carnet, toujours à jour.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage("clients")}
                  >
                    Tous les clients
                    <ArrowRight size={15} />
                  </button>
                </div>
                <SearchBox value={query} onChange={setQuery} />
                {searchClients(activeClients, query)
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 5)
                  .map(clientRow)}
                {!searchClients(activeClients, query).length && (
                  <Empty
                    icon={<Users size={26} />}
                    title={
                      query ? "Aucun résultat" : "Votre carnet commence ici"
                    }
                    text={
                      query
                        ? "Essayez un autre nom, téléphone ou identifiant."
                        : "Ajoutez votre premier client pour retrouver ses informations ici."
                    }
                    action={
                      !query ? (
                        <button
                          className="secondary"
                          onClick={() =>
                            setDialog({ kind: "edit", client: newClient() })
                          }
                        >
                          <Plus size={16} />
                          Ajouter mon premier client
                        </button>
                      ) : undefined
                    }
                  />
                )}
              </section>
            </>
          )}
          {page === "clients" && (
            <section className="panel">
              <div className="section-heading">
                <div className="tabs">
                  <button
                    className={!archived ? "active" : ""}
                    onClick={() => setArchived(false)}
                  >
                    Clients <span>{activeClients.length}</span>
                  </button>
                  <button
                    className={archived ? "active" : ""}
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
              {searched.map(clientRow)}
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
                <h2>Les prochaines échéances</h2>
                <select
                  aria-label="Filtrer les échéances"
                  value={expiryFilter}
                  onChange={(e) => setExpiryFilter(e.target.value)}
                >
                  <option value="7">Sous 7 jours</option>
                  <option value="30">Sous 30 jours</option>
                  <option value="active">Tous les actifs</option>
                  <option value="expired">Expirés</option>
                  <option value="disabled">Suspendus</option>
                </select>
              </div>
              {(() => {
                const items = subscriptions
                  .filter(({ subscription: s }) =>
                    expiryFilter === "disabled"
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
                    <div className="expiry-row" key={s.id}>
                      <span className="avatar">{initials(c.name)}</span>
                      <button
                        className="row-main plain"
                        onClick={() => setDialog({ kind: "detail", id: c.id })}
                      >
                        <strong>{c.name}</strong>
                        <small>
                          {s.provider || "Abonnement"} · {date(s.expires)}
                        </small>
                      </button>
                      <Badge subscription={s} />
                      <button
                        className="secondary small"
                        onClick={() =>
                          setDialog({
                            kind: "renew",
                            client: c,
                            subscription: s,
                          })
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
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <h2>Sauvegardes & données</h2>
                <p>
                  Votre coffre est enregistré uniquement dans ce navigateur.
                </p>
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
                  Sur iPhone : enregistrez la sauvegarde dans Fichiers,
                  idéalement sur un autre support. Effacer Safari, supprimer
                  l’app ou perdre l’appareil peut supprimer vos données. Le
                  stockage persistant n’est jamais garanti sur iOS.
                </div>
              </section>
              <section className="panel settings-panel">
                <h2>Sécurité & fournisseur</h2>
                <Setting
                  icon={<KeyRound size={19} />}
                  title="Connexion fournisseur"
                  text="Strong 8K · intégration en préparation"
                  onClick={() => setDialog({ kind: "provider" })}
                />
                <Setting
                  icon={<LockKeyhole size={19} />}
                  title="Verrouiller le coffre"
                  text="Automatique après 5 min d’inactivité, même dans une autre application."
                  onClick={lock}
                />
                <div className="security-note">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>Local, par choix.</strong>
                    <p>
                      Aucun compte externe. Aucun suivi. Aucune dépendance à un
                      panel fournisseur.
                    </p>
                  </div>
                </div>
                <h3>Installer sur votre iPhone</h3>
                <p className="fine-print">Version {version}</p>
                <p>
                  Ouvrez le site en HTTPS dans Safari, touchez Partager, puis «
                  Sur l’écran d’accueil ». Après le premier chargement complet,
                  l’application peut fonctionner hors ligne. Le mode privé
                  Safari n’est pas recommandé.
                </p>
                <p className="fine-print">
                  Le mot de passe maître n’est pas récupérable. Le chiffrement
                  protège les données au repos ; un appareil compromis ou un
                  coffre ouvert restent exposés. Aucun Face ID n’est simulé.
                </p>
              </section>
            </div>
          )}
          <footer className="content-footer">
            <span>
              <ShieldCheck size={13} /> Vos données restent sur cet appareil.
            </span>
            <span>PRIVÉ · VERSION 0.1</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "selected" : ""}
            onClick={() => {
              setPage(n.id);
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
              busy={busy}
              onSave={(c) => action(() => saveClient(c))}
            />
          )}
          {dialog.kind === "detail" && current && (
            <>
              <div className="detail-heading">
                <span className="avatar large">{initials(current.name)}</span>
                <div>
                  <h2>{current.name}</h2>
                  <p>{current.phone || "Téléphone non renseigné"}</p>
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
              {current.notes && <p className="note">{current.notes}</p>}
              {current.subscriptions.map((s) => (
                <section className="subscription-detail" key={s.id}>
                  <div className="section-heading">
                    <h3>
                      {s.provider || "Abonnement"} <small>{s.type}</small>
                    </h3>
                    <Badge subscription={s} />
                  </div>
                  <p className="subscription-dates">
                    Du {date(s.start)} au {date(s.expires)}
                  </p>
                  {[
                    ["Identifiant", s.username],
                    ["Mot de passe", s.password],
                    ["Serveur", s.server],
                    ...(s.m3u ? [["Lien M3U", s.m3u]] : []),
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
                  {s.notes && <p className="note">{s.notes}</p>}
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        setDialog({
                          kind: "renew",
                          client: current,
                          subscription: s,
                        })
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
              <div className="button-row detail-actions">
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
              </div>
            </>
          )}
          {dialog.kind === "renew" && (
            <RenewalForm
              subscription={dialog.subscription}
              busy={busy}
              onRenew={(next) =>
                action(async () => {
                  const updated = renew(dialog.subscription, next);
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
              onSave={async (provider) => {
                await commit({ ...vault, provider });
                setDialog(null);
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
        placeholder="Rechercher un nom, téléphone, fournisseur, identifiant…"
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
function Setting({
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
  busy,
  onSave,
}: {
  client: Client;
  busy: boolean;
  onSave: (c: Client) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(client));
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const c = { ...draft, name: draft.name.trim() };
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
          label="Nom ou pseudonyme *"
          required
          maxLength={200}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="off"
        />
        <Field
          label="Téléphone"
          type="tel"
          value={draft.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        <Field
          label="WhatsApp (facultatif)"
          type="tel"
          value={draft.whatsapp}
          onChange={(e) => set("whatsapp", e.target.value)}
        />
      </div>
      <label className="field">
        <span>Notes client</span>
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
      {draft.subscriptions.map((s, i) => (
        <fieldset key={s.id}>
          <legend>Abonnement {i + 1}</legend>
          <div className="form-grid">
            <Field
              label="Fournisseur"
              value={s.provider}
              onChange={(e) => sub(s.id, "provider", e.target.value)}
            />
            <label className="field">
              <span>Type de connexion</span>
              <select
                value={s.type}
                onChange={(e) => sub(s.id, "type", e.target.value)}
              >
                <option>M3U</option>
                <option>MAG</option>
                <option>Autre</option>
              </select>
            </label>
            <Field
              label="Identifiant"
              autoComplete="off"
              value={s.username}
              onChange={(e) => sub(s.id, "username", e.target.value)}
            />
            <Field
              label="Mot de passe"
              type="password"
              autoComplete="new-password"
              value={s.password}
              onChange={(e) => sub(s.id, "password", e.target.value)}
            />
            <Field
              label="URL du serveur"
              type="url"
              placeholder="https://…"
              value={s.server}
              onChange={(e) => sub(s.id, "server", e.target.value)}
            />
            {s.type === "M3U" && (
              <Field
                label="Lien M3U complet"
                type="password"
                autoComplete="off"
                value={s.m3u}
                onChange={(e) => sub(s.id, "m3u", e.target.value)}
              />
            )}
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
              onChange={(e) => sub(s.id, "start", e.target.value)}
            />
            <label className="field">
              <span>Calculer l’expiration</span>
              <select
                aria-label="Durée de l’abonnement"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    sub(
                      s.id,
                      "expires",
                      addMonths(s.start, Number(e.target.value)),
                    );
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Choisir une durée…</option>
                <option value="1">1 mois</option>
                <option value="3">3 mois</option>
                <option value="6">6 mois</option>
                <option value="12">12 mois</option>
              </select>
            </label>
            <Field
              label="Date d’expiration *"
              type="date"
              required
              min={s.start}
              value={s.expires}
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
          <label className="field">
            <span>Notes abonnement</span>
            <textarea
              value={s.notes}
              onChange={(e) => sub(s.id, "notes", e.target.value)}
            />
          </label>
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
      <button
        className="secondary full"
        type="button"
        onClick={() =>
          setDraft({
            ...draft,
            subscriptions: [...draft.subscriptions, newSubscription()],
          })
        }
      >
        <Plus size={16} />
        Ajouter un abonnement
      </button>
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
}: {
  subscription: Subscription;
  busy: boolean;
  onRenew: (next: string) => void;
}) {
  const [next, setNext] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRenew(next);
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
        Cette action met à jour votre suivi local uniquement. Elle ne renouvelle
        rien chez le fournisseur et ne réactive pas un abonnement suspendu.
      </p>
      <button className="primary full" disabled={busy}>
        Confirmer le renouvellement local
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
  onSave,
}: {
  value: Vault["provider"];
  busy: boolean;
  onSave: (v: Vault["provider"]) => Promise<void>;
}) {
  const [url, setUrl] = useState(value.url),
    [key, setKey] = useState(value.key),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (url && new URL(url).protocol !== "https:")
            throw new Error("Une adresse HTTPS est obligatoire.");
          await onSave({ url, key });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <p>
        Les paramètres sont conservés dans votre coffre chiffré, jamais dans le
        code source.
      </p>
      <Field
        label="Adresse HTTPS de l’API"
        type="url"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Field
        label="Clé API personnelle"
        type="password"
        autoComplete="new-password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <div className="alert">
        {providerAvailability.reason} Les consultations du compte et des
        abonnements seront disponibles après validation de cette documentation.
        La création, le renouvellement et le changement de statut distants
        restent désactivés.
      </div>
      <button type="button" className="secondary full" disabled>
        Tester la connexion — documentation requise
      </button>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <button className="primary full form-submit" disabled={busy}>
        Enregistrer les paramètres localement
      </button>
    </form>
  );
}
