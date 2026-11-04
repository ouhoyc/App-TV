import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanFace, ShieldCheck, X } from "lucide-react";
import {
  importIdentity,
  loginCredential,
  openSecret,
  type SecretBox,
} from "./cloudCrypto";
import {
  deviceUnlockError,
  forgetDeviceUnlock,
  hasDeviceLogin,
  hasDeviceUnlock,
  prepareDeviceEnrollment,
  type DeviceEnrollment,
} from "./deviceUnlock";
import type { Profile } from "./cloudStore";

export default function DeviceSetup({
  profile,
  passwordBox,
  onClose,
  onComplete,
  onForget,
}: {
  profile: Profile;
  passwordBox: SecretBox;
  onClose(): void;
  onComplete(key: CryptoKey): Promise<void>;
  onForget(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const prepared = useRef<{
    enrollment: DeviceEnrollment;
    key: CryptoKey;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const ceremony = useRef(false);
  const [stage, setStage] = useState<
    "password" | "create" | "confirm" | "enabled"
  >(hasDeviceLogin(profile.id) ? "enabled" : "password");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function clear() {
    clearTimeout(timer.current);
    prepared.current?.enrollment.destroy();
    prepared.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    dialog.current!.showModal();
    const hide = () => {
      if (!document.hidden || ceremony.current || !prepared.current) return;
      clear();
      setStage("password");
      setError(
        "L’activation a été interrompue. Votre mot de passe permet de reprendre.",
      );
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      clear();
      dialog.current?.close();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError((deviceUnlockError(e) as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("password") || "");
    await run(async () => {
      let raw: Uint8Array<ArrayBuffer> | undefined;
      try {
        raw = await openSecret(passwordBox, value);
        const key = await importIdentity(raw);
        const credential = await loginCredential(profile.email, value);
        if (!mounted.current) return;
        if (document.hidden)
          throw new Error("Revenez dans SCDR TV pour poursuivre l’activation.");
        clear();
        prepared.current = {
          key,
          enrollment: prepareDeviceEnrollment(profile, raw, credential),
        };
        setPassword("");
        setStage("create");
        timer.current = setTimeout(() => {
          clear();
          if (!mounted.current) return;
          setStage("password");
          setError(
            "L’activation a expiré. Recommencez avec votre mot de passe.",
          );
        }, 120000);
      } finally {
        raw?.fill(0);
      }
    });
  }
  async function nativeStep() {
    const current = prepared.current;
    if (!current) return;
    ceremony.current = true;
    await run(async () => {
      try {
        if (
          stage === "create" &&
          (await current.enrollment.begin()) === "confirm"
        ) {
          if (mounted.current) setStage("confirm");
          return;
        }
        if (stage === "confirm") await current.enrollment.finish();
        clearTimeout(timer.current);
        if (!mounted.current) return;
        setStage("enabled");
        await onComplete(current.key);
      } finally {
        ceremony.current = false;
        if (document.hidden && mounted.current) {
          clear();
          setStage("password");
        }
      }
    });
  }
  return (
    <dialog
      className="account-dialog"
      ref={dialog}
      aria-labelledby="device-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="device-title">Activer Face ID</h2>
        <button
          className="icon-button"
          aria-label="Fermer Face ID"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <p>
        Une clé d’accès Apple permettra d’ouvrir votre espace. Face ID sera
        demandé à l’ouverture ; le code de l’iPhone reste un secours proposé par
        Apple.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {stage === "enabled" ? (
        <>
          <p role="status">
            <ShieldCheck size={18} /> La connexion Face ID est enregistrée sur
            ce navigateur.
          </p>
          <button
            className="secondary full"
            disabled={busy}
            onClick={() => {
              forgetDeviceUnlock(profile.id);
              onForget();
              setStage("password");
            }}
          >
            Désactiver sur cet appareil
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              clear();
              setStage("password");
            }}
          >
            Réparer l’activation avec mon mot de passe
          </button>
        </>
      ) : stage === "password" ? (
        <form onSubmit={prepare}>
          <p>
            1. Confirmez votre mot de passe. La création de la clé Apple vient
            juste après.
          </p>
          <label className="field">
            <span>Adresse email</span>
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={profile.email}
              readOnly
            />
          </label>
          <label className="field">
            <span>Votre mot de passe actuel</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Vérification…" : "Continuer"}
          </button>
        </form>
      ) : (
        <>
          <p role="status">
            {stage === "create"
              ? "2. Votre mot de passe est confirmé. Appuyez ci-dessous pour ouvrir la fenêtre Apple et créer votre clé d’accès."
              : "3. La clé Apple est créée. Une dernière validation Face ID termine son enregistrement dans SCDR TV."}
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void nativeStep()}
          >
            <ScanFace size={20} />
            {busy
              ? "Validation Apple en cours…"
              : stage === "create"
                ? hasDeviceUnlock(profile.id)
                  ? "Valider ma clé d’accès"
                  : "Créer ma clé d’accès"
                : "Terminer avec Face ID"}
          </button>
        </>
      )}
    </dialog>
  );
}
