import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Copy,
  Download,
  LockKeyhole,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
  X,
  ScanFace,
  Network,
  Mail,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import App, { Setting, type Page } from "./App";
import DeviceSetup from "./DeviceSetup";
import AnimatedLogo from "./AnimatedLogo";
import { cancelOpen, finishOpen, markOpen, startOpen } from "./openTiming";
import { KeyRound } from "lucide-react";
import { watchBackgroundLock } from "./backgroundLock";
import {
  CloudStore,
  HttpError,
  request,
  type Profile,
  type Snapshot,
} from "./cloudStore";
import {
  createIdentity,
  importIdentity,
  loginCredential,
  openSecret,
  recoveryProof,
  sealSecret,
} from "./cloudCrypto";
import { loadEnvelope } from "./storage";
import { decrypt } from "./crypto";
import { mergeClients } from "./model";
import {
  hasDeviceUnlock,
  unlockDevice,
  forgetDeviceUnlock,
  deviceUnlockError,
  rememberedDevices,
  hasDeviceLogin,
} from "./deviceUnlock";
function incomingInvitation() {
  const code =
    new URLSearchParams(location.hash.slice(1)).get("invitation") || "";
  return /^[0-9a-f]{64}$/.test(code) ? code : "";
}
function Input({
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
function AccountDialog({
  children,
  labelId,
  onClose,
  busy = false,
}: {
  children: ReactNode;
  labelId: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={"account-dialog" + (busy ? " auth-pending" : "")}
      aria-busy={busy || undefined}
      ref={ref}
      aria-labelledby={labelId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
export default function AccountApp() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [store, setStore] = useState<CloudStore | null>(null),
    [scope, setScope] = useState(""),
    [identity, setIdentity] = useState<CryptoKey | null>(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [recovery, setRecovery] = useState(""),
    [recoveryCode, setRecoveryCode] = useState(""),
    [savedCode, setSavedCode] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "recover">(() =>
    incomingInvitation() ? "register" : "login",
  );
  const [invitation, setInvitation] = useState(incomingInvitation);
  const [inviteName, setInviteName] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteLink, setInviteLink] = useState("");
  const [legacy, setLegacy] = useState(false),
    [legacyPassword, setLegacyPassword] = useState(""),
    [notice, setNotice] = useState("");
  const [appPage, setAppPage] = useState<Page>("dashboard");
  const [authOpen, setAuthOpen] = useState(() => !!incomingInvitation());
  const epoch = useRef(0);
  const devicePrompt = useRef(false);
  const autoAttempted = useRef(false);
  const restoringSession = useRef(false);
  const [foreground, setForeground] = useState(() => !document.hidden);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [deviceSetup, setDeviceSetup] = useState(false);
  const [remembered, setRemembered] = useState(rememberedDevices);
  const [setupRequested, setSetupRequested] = useState(
    () => new URLSearchParams(location.search).get("setup") === "face-id",
  );
  useEffect(() => {
    if (loading) return;
    const receive = () => {
      const code = incomingInvitation();
      if (!code) return;
      history.replaceState(null, "", location.pathname + location.search);
      autoAttempted.current = true;
      setSetupRequested(false);
      if (profile) {
        setMode("login");
        setError(
          "Ce navigateur est déjà connecté à un compte. Ouvrez le lien d’invitation dans un onglet privé de Safari pour activer un autre compte.",
        );
        setAuthOpen(true);
        return;
      }
      epoch.current++;
      setInvitation(code);
      setMode("register");
      setPassword("");
      setConfirmation("");
      setError("");
      setAuthOpen(true);
    };
    receive();
    window.addEventListener("hashchange", receive);
    return () => window.removeEventListener("hashchange", receive);
  }, [loading, profile?.id]);
  useEffect(() => {
    if (!setupRequested || loading || busy || !profile || recoveryCode) return;
    setSetupRequested(false);
    const url = new URL(location.href);
    url.searchParams.delete("setup");
    history.replaceState(null, "", url.pathname + url.search);
    if (hasDeviceLogin(profile.id)) return;
    const token = epoch.current;
    void (async () => {
      try {
        const data = snapshot || (await request<Snapshot>("workspace"));
        if (epoch.current !== token) return;
        setSnapshot(data);
        openDeviceSetup();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [setupRequested, loading, busy, profile?.id, recoveryCode]);
  useEffect(() => {
    setDeviceEnabled(profile ? hasDeviceUnlock(profile.id) : false);
  }, [profile]);
  useEffect(() => {
    const visibility = () => {
      if (devicePrompt.current) return;
      setForeground(!document.hidden);
      if (document.hidden) autoAttempted.current = false;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (
      loading ||
      busy ||
      !foreground ||
      identity ||
      deviceSetup ||
      setupRequested ||
      mode === "register" ||
      autoAttempted.current
    )
      return;
    autoAttempted.current = true;
    const userId =
      profile && hasDeviceUnlock(profile.id)
        ? profile.id
        : !profile && remembered.length === 1
          ? remembered[0].id
          : undefined;
    if (userId) void enterWithDevice(userId);
  }, [
    loading,
    busy,
    foreground,
    identity,
    deviceSetup,
    setupRequested,
    mode,
    profile?.id,
    remembered,
  ]);
  function lock() {
    setAuthOpen(false);
    setAppPage("dashboard");
    autoAttempted.current = true;
    epoch.current++;
    setStore(null);
    setIdentity(null);
    setSnapshot(null);
    setLegacy(false);
    setLegacyPassword("");
    setPassword("");
    setConfirmation("");
    setRecovery("");
    setDeviceSetup(false);
    setError("");
  }
  async function restoreSession() {
    // The remembered credential does not grant access: Face ID and the login
    // endpoint still authenticate. Avoid a redundant account probe before it.
    const rememberedLogin = rememberedDevices();
    if (
      rememberedLogin.length === 1 &&
      !incomingInvitation() &&
      !setupRequested
    ) {
      setEmail(rememberedLogin[0].email);
      setLoading(false);
      return;
    }
    if (restoringSession.current) return;
    restoringSession.current = true;
    setLoading(true);
    try {
      // An absent cookie at startup is expected after logout; it must not
      // cancel the pending Face ID sign-in by dispatching a lock event.
      const result = await request<{ profile: Profile }>("account", undefined, {
        notifyExpiry: false,
      });
      setProfile(result.profile);
      setEmail(result.profile.email);
      setScope(result.profile.id);
    } catch (e) {
      if (!(e instanceof HttpError && [401, 403].includes(e.status)))
        setError((e as Error).message);
    } finally {
      restoringSession.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    void restoreSession();
    const expired = () => {
      lock();
      setRecoveryCode("");
      setSavedCode(false);
      setProfile(null);
    };
    window.addEventListener("app-tv-session-expired", expired);
    return () => window.removeEventListener("app-tv-session-expired", expired);
  }, []);
  useEffect(() => {
    if (!identity) return;
    return watchBackgroundLock(
      () => {
        lock();
        autoAttempted.current = false;
      },
      () => devicePrompt.current,
    );
  }, [identity]);
  async function loadWorkspace(
    key: CryptoKey,
    selected: string,
    ready?: Snapshot,
  ) {
    const token = epoch.current;
    const next = ready || (await request<Snapshot>("workspace"));
    const opened = await new CloudStore(next, key, selected).open();
    if (epoch.current !== token) return;
    setSnapshot(next);
    setStore(opened);
    setScope(opened.scope);
  }
  async function operate(fn: () => Promise<void>) {
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
  async function enter(e: FormEvent) {
    e.preventDefault();
    // Some password managers fill the DOM without firing React's change event.
    const fields = new FormData(e.currentTarget as HTMLFormElement);
    const enteredPassword = String(fields.get("password") ?? password);
    const enteredEmail = String(fields.get("username") ?? email);
    const enteredConfirmation = String(
      fields.get("password-confirmation") ?? confirmation,
    );
    await operate(async () => {
      const token = epoch.current;
      startOpen();
      const address = (profile?.email || enteredEmail).trim().toLowerCase();
      if (
        (mode === "register" || mode === "recover") &&
        enteredPassword !== enteredConfirmation
      )
        throw new Error("Les mots de passe ne correspondent pas.");
      let readySnapshot: Snapshot | undefined;
      if (!profile) {
        const credential = await loginCredential(address, enteredPassword);
        if (mode === "recover") {
          const proof = await recoveryProof(recovery);
          const { recovery_envelope } = await request<{
            recovery_envelope: import("./cloudCrypto").SecretBox;
          }>("account", { action: "recover-start", email: address, proof });
          const raw = await openSecret(recovery_envelope, recovery.trim());
          await request("account", {
            action: "recover-finish",
            email: address,
            proof,
            credential,
            password_box: await sealSecret(raw, enteredPassword),
          });
        } else {
          const response = await request<{ workspace?: Snapshot }>("account", {
            action: mode === "register" ? "register" : "login",
            email: address,
            credential,
            with_workspace: true,
            ...(mode === "register" ? { invitation } : {}),
          });
          readySnapshot = response.workspace;
        }
      }
      const data = readySnapshot || (await request<Snapshot>("workspace"));
      markOpen("serveur");
      if (epoch.current !== token) return;
      setProfile(data.profile);
      setEmail(data.profile.email);
      setSnapshot(data);
      let key: CryptoKey;
      if (data.keyring) {
        key = await importIdentity(
          await openSecret(data.keyring.password_envelope, enteredPassword),
        );
        markOpen("mot de passe");
      } else {
        const created = await createIdentity(enteredPassword);
        if (epoch.current !== token) return;
        await request("workspace", {
          action: "setup-keys",
          jwk: created.jwk,
          password_box: created.passwordBox,
          recovery_box: created.recoveryBox,
          recovery_hash: created.recoveryHash,
        });
        key = created.privateKey;
        setRecoveryCode(created.code);
        setSavedCode(false);
      }
      if (epoch.current !== token) return;
      setIdentity(key);
      setAuthOpen(false);
      setPassword("");
      setConfirmation("");
      setRecovery("");
      setInvitation("");
      setMode("login");
      await loadWorkspace(
        key,
        data.profile.id,
        data.keyring ? data : undefined,
      );
      markOpen("déchiffrement");
      finishOpen();
    });
  }
  async function logout() {
    autoAttempted.current = true;
    await operate(async () => {
      await request("account", { action: "logout" });
      setDeviceEnabled(false);
      lock();
      setProfile(null);
      setRecoveryCode("");
      setRemembered(rememberedDevices());
      setMode("login");
    });
  }
  function openDeviceSetup() {
    setAuthOpen(false);
    epoch.current++;
    setStore(null);
    setIdentity(null);
    setLegacy(false);
    setDeviceSetup(true);
    setError("");
  }
  async function completeDeviceSetup(key: CryptoKey) {
    if (!profile) return;
    autoAttempted.current = true;
    const token = epoch.current;
    setDeviceEnabled(hasDeviceUnlock(profile.id));
    setRemembered(rememberedDevices());
    await loadWorkspace(key, profile.id);
    if (epoch.current !== token) return;
    setIdentity(key);
    setDeviceSetup(false);
    setNotice(
      "Face ID est enregistré. Il sera proposé à la prochaine ouverture de cet espace.",
    );
  }
  async function enterWithDevice(userId = profile?.id) {
    if (!userId) return;
    await operate(async () => {
      const token = epoch.current;
      autoAttempted.current = true;
      devicePrompt.current = true;
      startOpen();
      // Réveille le serveur de connexion pendant que Face ID s’affiche.
      void fetch("/api/account", {
        method: "HEAD",
        cache: "no-store",
        credentials: "omit",
      }).catch(() => {});
      try {
        const unlocked = await unlockDevice(userId);
        markOpen("Face ID");
        let readySnapshot: Snapshot | undefined;
        if (epoch.current !== token) return;
        if (unlocked.credential && unlocked.email) {
          const result = await request<{
            profile: Profile;
            workspace?: Snapshot;
          }>("account", {
            action: "login",
            with_workspace: true,
            email: unlocked.email,
            credential: unlocked.credential,
          });
          markOpen("serveur");
          if (epoch.current !== token) return;
          if (result.profile.id !== userId)
            throw new Error(
              "La clé d’accès ne correspond pas au compte connecté.",
            );
          setProfile(result.profile);
          setEmail(result.profile.email);
          readySnapshot = result.workspace;
        } else if (!profile)
          throw new Error(
            "Reconnectez-vous avec votre mot de passe pour mettre à jour Face ID.",
          );
        // Fetching the workspace still verifies the live server session and role.
        await loadWorkspace(unlocked.privateKey, userId, readySnapshot);
        markOpen("déchiffrement");
        finishOpen();
        if (epoch.current !== token) return;
        setIdentity(unlocked.privateKey);
        setPassword("");
      } catch (e) {
        cancelOpen();
        if (e instanceof HttpError && e.status === 401)
          throw new Error(
            "La connexion Face ID doit être réactivée. Connectez-vous avec votre mot de passe puis ouvrez les réglages Face ID.",
          );
        throw deviceUnlockError(e);
      } finally {
        autoAttempted.current = true;
        devicePrompt.current = false;
        setForeground(!document.hidden);
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });
  }
  async function changeScope(value: string) {
    if (!identity) return;
    await operate(async () => {
      await loadWorkspace(identity, value);
    });
  }
  function downloadRecovery() {
    const file = new Blob(
      [
        `SCDR TV — Clé de récupération\nCompte : ${profile?.email}\n\n${recoveryCode}\n\nConservez cette clé hors de votre téléphone. Elle permet de récupérer votre compte et vos données chiffrées. Ne la partagez pas.\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scdr-tv-cle-recuperation.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function invite(e: FormEvent) {
    e.preventDefault();
    await operate(async () => {
      const result = await request<{ invitation: string; email: string }>(
        "account",
        { action: "invite", email: inviteEmail, name: inviteName },
      );
      setInviteLink(`${location.origin}/#invitation=${result.invitation}`);
      setInviteEmail("");
      setInviteName("");
      if (identity) await loadWorkspace(identity, scope);
    });
  }
  async function importLegacy(e: FormEvent) {
    e.preventDefault();
    await operate(async () => {
      const old = await loadEnvelope();
      if (!old)
        throw new Error(
          "Aucun ancien coffre sur cette adresse. Vous pouvez aussi restaurer un export chiffré depuis les paramètres.",
        );
      const { vault } = await decrypt(old, legacyPassword);
      if (!store) throw new Error("Déverrouillez votre compte.");
      await store.save({
        ...store.vault,
        clients: mergeClients(store.vault.clients, vault.clients, false),
      });
      setLegacy(false);
      setLegacyPassword("");
      setNotice(
        "Anciennes fiches importées et enregistrées sur le serveur. Le coffre local est conservé.",
      );
      if (identity) await loadWorkspace(identity, scope);
    });
  }
  const accountControls = profile && (
    <label className="clientele-filter">
      <Network size={18} aria-hidden="true" />
      {profile.role === "admin" ? (
        <select
          aria-label="Clientèle affichée"
          value={scope}
          onChange={(e) => void changeScope(e.target.value)}
          disabled={busy}
        >
          <option value="all">Toutes les clientèles</option>
          <option value="shared">Notre clientèle</option>
          {snapshot?.profiles
            .filter((p) => p.role === "reseller")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
                {!p.active ? " · suspendu" : ""}
              </option>
            ))}
        </select>
      ) : (
        <span>Ma clientèle</span>
      )}
      {profile.role === "admin" && (
        <ChevronDown
          className="clientele-chevron"
          size={17}
          aria-hidden="true"
        />
      )}
    </label>
  );
  const resellerView =
    profile?.role === "admin" ? (
      <section className="panel reseller-manager">
        {snapshot?.profiles
          .filter((p) => p.role === "reseller")
          .map((p) => (
            <div className="reseller-row" key={p.id}>
              <span>
                <strong>{p.display_name}</strong>
                <small>
                  {p.email} · {p.active ? "Actif" : "Suspendu"}
                </small>
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void operate(async () => {
                    await request("account", {
                      action: "set-active",
                      user_id: p.id,
                      active: !p.active,
                    });
                    if (identity) await loadWorkspace(identity, scope);
                  })
                }
              >
                {p.active ? "Suspendre" : "Réactiver"}
              </button>
            </div>
          ))}
        {snapshot?.invitations
          ?.filter((i) => i.role === "reseller")
          .map((i) => (
            <p key={i.id}>
              {i.display_name} · {i.email} · Invitation en attente
            </p>
          ))}
        <form onSubmit={invite}>
          <h3>Ajouter un sous-revendeur</h3>
          <Input
            label="Nom du sous-revendeur"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            required
            maxLength={120}
          />
          <Input
            label="Email du sous-revendeur"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <button className="primary full" disabled={busy}>
            <Plus size={17} />
            Créer son invitation
          </button>
        </form>
        {inviteLink && (
          <div className="invite-result">
            <p>
              Transmettez ce lien uniquement au sous-revendeur concerné. Valable
              7 jours.
            </p>
            <textarea
              readOnly
              aria-label="Lien d’invitation"
              value={inviteLink}
            />
            <button
              className="secondary"
              onClick={() =>
                void operate(async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setNotice("Lien copié.");
                })
              }
            >
              <Copy size={16} />
              Copier le lien
            </button>
          </div>
        )}
      </section>
    ) : undefined;
  const accountSettings = profile && (
    <>
      <section className="panel settings-panel account-profile">
        <h2>Compte</h2>
        <div className="account-profile-summary">
          <span className="avatar">
            {profile.display_name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{profile.display_name}</strong>
            <small>
              {profile.role === "admin" ? "Administrateur" : "Revendeur"}
            </small>
          </span>
        </div>
        <div className="setting setting-static">
          <Mail size={19} />
          <span>
            <strong>Adresse e-mail</strong>
            <small>{profile.email}</small>
          </span>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>Sécurité</h2>
        <Setting
          icon={<ScanFace size={19} />}
          title="Face ID"
          text={
            deviceEnabled
              ? "Activé sur cet appareil"
              : "Configurer sur cet appareil"
          }
          onClick={openDeviceSetup}
        />
        <div className="setting setting-static">
          <LockKeyhole size={19} />
          <span>
            <strong>Verrouillage automatique</strong>
            <small>Jamais dans l’app · Après 5 minutes en arrière-plan</small>
          </span>
        </div>
        <Setting
          icon={<LockKeyhole size={19} />}
          title="Verrouiller le coffre"
          text="Fermer votre espace sur cet appareil"
          onClick={lock}
        />
        <Setting
          icon={<RefreshCw size={19} />}
          title="Actualiser mes données"
          text="Recharger votre clientèle synchronisée"
          onClick={() => void changeScope(scope)}
        />
      </section>
    </>
  );
  const accountSessionActions = profile && (
    <section className="panel settings-panel session-actions">
      <button
        className="setting sign-out"
        disabled={busy}
        onClick={() => void logout()}
      >
        <LogOut size={19} />
        <span>
          <strong>Se déconnecter</strong>
        </span>
        <ChevronRight size={17} />
      </button>
    </section>
  );
  const deviceDialog = profile && deviceSetup && snapshot?.keyring && (
    <DeviceSetup
      profile={profile}
      passwordBox={snapshot.keyring.password_envelope}
      onClose={() => setDeviceSetup(false)}
      onComplete={completeDeviceSetup}
      onForget={() => {
        setDeviceEnabled(false);
        setRemembered(rememberedDevices());
      }}
    />
  );
  if (loading) return <LoginStage pending />;
  if (store && identity && !recoveryCode)
    return (
      <>
        <App
          initialPage={appPage}
          onPageChange={setAppPage}
          resellersContent={resellerView}
          settingsContent={accountSettings}
          settingsFooter={accountSessionActions}
          accountHeader={<div className="account-bar">{accountControls}</div>}
          accountNotices={
            <>
              {error && !deviceSetup && (
                <div role="alert" className="account-alert alert error">
                  {error}
                  <button
                    className="icon-button"
                    aria-label="Fermer l’erreur"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div role="status" className="account-alert alert">
                  {notice}
                </div>
              )}
              {!store.ready &&
                appPage !== "settings" &&
                appPage !== "resellers" && (
                  <div className="account-alert alert">
                    L’activation de votre associé est en attente. Elle est
                    nécessaire pour enregistrer vos clients.
                  </div>
                )}
            </>
          }
          key={store.key}
          cloud={{
            vault: store.vault,
            privateKey: identity,
            save: (next) => store.save(next),
            onLock: lock,
            profile: profile!,
            ownerLabel: (id) => store.ownerLabel(id),
            providerFor: (id) => store.providerFor(id),
            ownerFor: (id) => store.ownerFor(id),
            sealProviderContext: (client, meta) =>
              store.sealProviderContext(client, meta),
            ready: store.ready,
            viewOwners: store.viewOwners,
            sealMedia: (asset) => store.sealMedia(asset),
            syncReminders: () => store.syncReminders(),
            onRefresh: () => void changeScope(scope),
            onLegacyImport: () => {
              setLegacy(true);
              setError("");
            },
          }}
        />
        {deviceDialog}
        {legacy && (
          <AccountDialog
            labelId="legacy-title"
            onClose={() => {
              setLegacy(false);
              setLegacyPassword("");
            }}
          >
            <header>
              <h2 id="legacy-title">Retrouver mon ancien coffre</h2>
              <button
                className="icon-button"
                onClick={() => {
                  setLegacy(false);
                  setLegacyPassword("");
                }}
                aria-label="Fermer l’import"
              >
                <X />
              </button>
            </header>
            <p>
              Importe les fiches présentes dans ce navigateur vers la clientèle
              affichée. Les doublons sont conservés sans remplacement et la
              copie locale reste intacte.
            </p>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={importLegacy}>
              <Input
                label="Ancien mot de passe maître"
                type="password"
                autoComplete="off"
                required
                value={legacyPassword}
                onChange={(e) => setLegacyPassword(e.target.value)}
              />
              <button className="primary full" disabled={busy}>
                Importer et synchroniser
              </button>
            </form>
          </AccountDialog>
        )}
      </>
    );
  const faceIdUser =
    profile && deviceEnabled
      ? profile.id
      : !profile && remembered.length === 1
        ? remembered[0].id
        : undefined;
  const logoLabel = faceIdUser
    ? profile
      ? "Déverrouiller avec Face ID"
      : "Se connecter avec Face ID"
    : "Se connecter";
  const openLogin = () => {
    setError("");
    setAuthOpen(true);
  };
  return (
    <>
      <LoginStage
        pending={busy}
        label={authOpen || error ? "Relancer la connexion" : logoLabel}
        onEnter={() => {
          if (faceIdUser) void enterWithDevice(faceIdUser);
          else openLogin();
        }}
        onPassword={openLogin}
      />
      {recoveryCode && identity ? (
        <AccountDialog labelId="recovery-title" onClose={() => {}}>
          <div className="auth-form">
            <span className="lock-emblem">
              <ShieldCheck />
            </span>
            <span className="eyebrow">VOTRE COMPTE EST PRÊT</span>
            <h2 id="recovery-title">Gardez votre clé à l’abri.</h2>
            <p>
              Cette clé permet de récupérer votre compte et vos données
              chiffrées si vous oubliez votre mot de passe. Conservez-la sur un
              autre support.
            </p>
            <code className="recovery-code">{recoveryCode}</code>
            <button className="secondary full" onClick={downloadRecovery}>
              <Download size={17} />
              Télécharger ma clé
            </button>
            <label className="check-label">
              <input
                type="checkbox"
                checked={savedCode}
                onChange={(e) => setSavedCode(e.target.checked)}
              />
              <span>
                J’ai conservé ma clé de récupération dans un endroit sûr.
              </span>
            </label>
            <button
              className="primary full"
              disabled={!savedCode || busy}
              onClick={() => {
                setRecoveryCode("");
                setSavedCode(false);
              }}
            >
              Entrer dans mon espace
              <ArrowRight size={17} />
            </button>
          </div>
        </AccountDialog>
      ) : (authOpen || error) && !deviceSetup ? (
        <AccountDialog
          labelId="login-title"
          busy={busy}
          onClose={() => {
            if (busy) return;
            setAuthOpen(false);
            setError("");
            setPassword("");
            setConfirmation("");
            setRecovery("");
            setMode("login");
          }}
        >
          <header>
            <h2 id="login-title">
              {mode === "register"
                ? "Activer mon compte"
                : mode === "recover"
                  ? "Récupérer mon compte"
                  : "Connexion"}
            </h2>
            <button
              className="icon-button"
              aria-label="Fermer la connexion"
              disabled={busy}
              onClick={() => {
                setAuthOpen(false);
                setError("");
                setPassword("");
                setConfirmation("");
                setRecovery("");
                setMode("login");
              }}
            >
              <X size={20} />
            </button>
          </header>
          <div className="auth-form">
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            {profile && !deviceEnabled && (
              <button
                className="secondary full device-unlock"
                disabled={busy}
                onClick={() =>
                  void operate(async () => {
                    setSnapshot(await request<Snapshot>("workspace"));
                    openDeviceSetup();
                  })
                }
              >
                <ScanFace size={20} />
                Configurer Face ID
              </button>
            )}
            {profile && deviceEnabled && (
              <button
                className="secondary full device-unlock"
                disabled={busy}
                onClick={() => void enterWithDevice()}
              >
                <ScanFace size={20} />
                Déverrouiller avec Face ID
              </button>
            )}
            {!profile &&
              mode === "login" &&
              remembered.map((device) => (
                <div className="remembered-device" key={device.id}>
                  <button
                    className="secondary full device-unlock"
                    disabled={busy}
                    onClick={() => void enterWithDevice(device.id)}
                  >
                    <ScanFace size={20} />
                    <span>
                      Se connecter avec Face ID<small>{device.email}</small>
                    </span>
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      forgetDeviceUnlock(device.id);
                      setRemembered(rememberedDevices());
                    }}
                  >
                    Oublier ce compte sur cet appareil
                  </button>
                </div>
              ))}
            <form onSubmit={enter} id="account-login">
              {profile && (
                <Input
                  label="Adresse email"
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={profile.email}
                  readOnly
                />
              )}
              {!profile && (
                <Input
                  label="Adresse email"
                  type="email"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
              {mode === "register" && !invitation && (
                <Input
                  label="Code d’invitation"
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value.trim())}
                  required
                />
              )}
              {mode === "recover" && (
                <Input
                  label="Clé de récupération"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  autoComplete="off"
                  required
                />
              )}
              <Input
                label={
                  profile
                    ? "Mot de passe de déverrouillage"
                    : mode === "recover"
                      ? "Nouveau mot de passe"
                      : "Mot de passe"
                }
                type="password"
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode !== "login" && (
                <Input
                  label="Confirmer le mot de passe"
                  type="password"
                  name="password-confirmation"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Ouverture de votre espace…"
                  : profile
                    ? "Déverrouiller"
                    : mode === "register"
                      ? "Activer mon compte"
                      : mode === "recover"
                        ? "Récupérer mon compte"
                        : "Se connecter"}
                <ArrowRight size={17} />
              </button>
            </form>
            {!profile && (
              <div className="auth-links">
                <button
                  onClick={() => {
                    setMode(mode === "recover" ? "login" : "recover");
                    setError("");
                  }}
                >
                  {mode === "recover"
                    ? "Revenir à la connexion"
                    : "Mot de passe oublié ?"}
                </button>
                <button
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setError("");
                  }}
                >
                  {mode === "register"
                    ? "J’ai déjà un compte"
                    : "J’ai une invitation"}
                </button>
              </div>
            )}
            {profile && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void logout()}
              >
                Utiliser un autre compte
              </button>
            )}
          </div>
        </AccountDialog>
      ) : null}
      {deviceDialog}
    </>
  );
}

function LoginStage({
  pending = false,
  label = "Se connecter",
  onEnter,
  onPassword,
}: {
  pending?: boolean;
  label?: string;
  onEnter?: () => void;
  onPassword?: () => void;
}) {
  return (
    <main
      className="login-stage"
      aria-label="Connexion SCDR TV"
      aria-busy={pending}
    >
      <button
        className="login-logo"
        aria-label={label}
        disabled={pending}
        onClick={onEnter}
      >
        <AnimatedLogo active={pending} />
      </button>
      {pending && (
        <span className="sr-only" role="status">
          Connexion en cours
        </span>
      )}
      {onPassword && (
        <button
          className="login-password"
          aria-label="Connexion avec mot de passe"
          disabled={pending}
          onClick={onPassword}
        >
          <KeyRound size={22} />
        </button>
      )}
    </main>
  );
}
