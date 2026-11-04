import { useEffect, useRef, useState } from "react";
import { Radio, ChevronRight, RefreshCw, X } from "lucide-react";
import type { Client, Subscription } from "./model";
import { providerPanels } from "./model";
import { clientPseudo, panelAccent } from "./commerce";
import { providerRequest, subscriptionIdentity } from "./providerWorkflow";
import type { CloudWorkspace } from "./App";
interface Presence {
  online: boolean | null;
  connections: number | null;
  watching: string[];
  error?: string;
}
interface Task {
  client: Client;
  sub: Subscription;
  key: string;
  ownerId: string;
  panel: string;
  identity: ReturnType<typeof subscriptionIdentity>;
}
interface Group {
  key: string;
  ownerId: string;
  tasks: Task[];
}
function LiveDialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current!.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className="live-dialog"
      ref={ref}
      aria-label="Clients en ligne"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="modal-head">
        <h2>Clients en ligne</h2>
        <button
          className="icon-button"
          aria-label="Fermer les connexions"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export default function LiveClients({
  clients,
  cloud,
}: {
  clients: Client[];
  cloud: CloudWorkspace;
}) {
  const [results, setResults] = useState(new Map<string, Presence>()),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [checked, setChecked] = useState(""),
    [error, setError] = useState("");
  const running = useRef(false),
    epoch = useRef(0),
    supported = useRef(new Set<string>());
  const tasks: Task[] = [],
    groups: Group[] = [];
  for (const client of clients) {
    const settings = cloud.providerFor(client.id);
    for (const sub of client.subscriptions) {
      const panel = providerPanels(settings).find((p) => p.id === sub.panelId);
      if (!panel?.key) continue;
      try {
        const task = {
          client,
          sub,
          key: panel.key,
          ownerId: cloud.ownerFor(client.id),
          panel: panel.name,
          identity: subscriptionIdentity(sub),
        };
        tasks.push(task);
        let group = groups.find(
          (g) => g.key === task.key && g.ownerId === task.ownerId,
        );
        if (!group) {
          group = { key: task.key, ownerId: task.ownerId, tasks: [] };
          groups.push(group);
        }
        group.tasks.push(task);
      } catch {
        /* A record without provider credentials is unverified, never offline. */
      }
    }
  }
  async function refresh(full = false) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const token = epoch.current,
      latest = new Map<string, Presence>();
    try {
      for (const group of groups) {
        const groupId = group.ownerId + ":" + group.key,
          scanAll = full || supported.current.has(groupId);
        const chunks: Task[][] = scanAll
          ? Array.from({ length: Math.ceil(group.tasks.length / 6) }, (_, i) =>
              group.tasks.slice(i * 6, i * 6 + 6),
            )
          : [group.tasks.slice(0, 1)];
        for (let at = 0; at < chunks.length; at++) {
          if (epoch.current !== token) return;
          const batch = chunks[at];
          const response = await providerRequest<{
            items: (Presence & { id: string })[];
            checkedAt: string;
          }>("presence", group.key, {
            ownerId: group.ownerId,
            items: batch.map((task) => ({ id: task.sub.id, ...task.identity })),
          });
          if (epoch.current !== token) return;
          if (response.items.some((item) => item.online !== null))
            supported.current.add(groupId);
          for (const item of response.items) latest.set(item.id, item);
          setResults(new Map(latest));
          setChecked(response.checkedAt);
          if (
            response.items.length &&
            response.items.every((item) => item.error)
          )
            break;
          // When a panel explicitly supplies connection fields, finish the account
          // scan. Without them, do not bombard it or invent an offline count.
          if (!scanAll && at === 0 && supported.current.has(groupId))
            for (let offset = 1; offset < group.tasks.length; offset += 6)
              chunks.push(group.tasks.slice(offset, offset + 6));
        }
      }
    } catch (e) {
      if (epoch.current === token) setError((e as Error).message);
    } finally {
      running.current = false;
      if (epoch.current === token) setBusy(false);
    }
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void refreshRef.current();
    });
    const timer = setInterval(() => {
      if (!document.hidden && supported.current.size > 0)
        void refreshRef.current();
    }, 60000);
    return () => {
      active = false;
      epoch.current++;
      clearInterval(timer);
    };
  }, []);
  const rows = clients.map((client) => {
    const values = client.subscriptions.map((s) => results.get(s.id));
    const online = values.some((v) => v?.online === true)
      ? true
      : values.length && values.every((v) => v?.online === false)
        ? false
        : null;
    return {
      client,
      online,
      requestError: values.find((value) => value?.error)?.error || "",
      watching: [
        ...new Set(
          values.flatMap((v) => (v?.online === true ? v.watching : [])),
        ),
      ],
      details: tasks.filter((t) => t.client.id === client.id),
    };
  });
  const connected = rows.filter((row) => row.online === true).length,
    unknown = rows.filter((row) => row.online === null).length,
    percentage =
      clients.length && !unknown
        ? Math.round((connected / clients.length) * 100)
        : null;
  return (
    <>
      <button
        type="button"
        className="live-card"
        aria-label="Voir les clients en ligne"
        onClick={() => {
          setOpen(true);
          if (!busy) void refresh(true);
        }}
      >
        <span className="live-card-label">
          <Radio size={18} />
          En ligne
          {checked && (
            <small>
              ·{" "}
              {new Date(checked).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          )}
        </span>
        <strong>{percentage === null ? "—" : `${percentage}%`}</strong>
        <span className="live-card-detail">
          {busy
            ? "Vérification…"
            : unknown
              ? connected
                ? `${connected} connecté(s) confirmé(s) · ${unknown} non vérifié(s)`
                : !tasks.length
                  ? "Panel et identifiants à renseigner"
                  : error || rows.some((r) => r.requestError)
                    ? "Connexion au panel à vérifier"
                    : "Connexions non fournies par le panel"
              : `${connected} / ${clients.length} clients`}
          <ChevronRight size={17} />
        </span>
      </button>
      {open && (
        <LiveDialog onClose={() => setOpen(false)}>
          <div className="live-toolbar">
            <span>
              {checked
                ? `Vérifié à ${new Date(checked).toLocaleTimeString("fr-FR")}`
                : "Statuts non vérifiés"}
            </span>
            <button
              className="secondary"
              disabled={busy || !tasks.length}
              onClick={() => void refresh(true)}
            >
              <RefreshCw size={16} />
              {busy ? "Vérification…" : "Actualiser"}
            </button>
          </div>
          {unknown > 0 && !busy && (
            <p className="alert">
              {tasks.length
                ? "Certaines connexions ne sont pas communiquées par le panel."
                : "Renseignez le panel et les identifiants dans les fiches à vérifier."}
            </p>
          )}
          {rows
            .sort(
              (a, b) => Number(b.online === true) - Number(a.online === true),
            )
            .map(({ client, online, watching, details, requestError }) => (
              <section className="live-client" key={client.id}>
                <div>
                  <strong className={panelAccent(details[0]?.panel || "")}>
                    {clientPseudo(client)}
                  </strong>
                  <span
                    className={
                      online === true ? "live-status is-online" : "live-status"
                    }
                  >
                    {online === true
                      ? "En ligne"
                      : online === false
                        ? "Hors ligne"
                        : "Non fourni"}
                  </span>
                </div>
                <p>
                  {online === true
                    ? watching.length
                      ? watching.join(" · ")
                      : "Chaîne non communiquée par le panel"
                    : online === false
                      ? "Aucune connexion en cours"
                      : requestError ||
                        (!details.length
                          ? "Panel ou identifiants non renseignés"
                          : "Statut en ligne non communiqué par le panel")}
                </p>
              </section>
            ))}
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {!clients.length && <p>Aucun client.</p>}
        </LiveDialog>
      )}
    </>
  );
}
