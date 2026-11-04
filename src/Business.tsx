import { useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Link2 } from "lucide-react";
import ContactIcon from "./ContactIcon";
import Coins from "./StackedCoins";
import {
  financialSummary,
  customerContact,
  contactUrl,
  money,
  planLabels,
  planOf,
  clientPseudo,
  serverAddress,
  customerRows,
  panelAccent,
  clientNotes,
  calendarMonthProfit,
} from "./commerce";
import type { Client, ProviderPanel, Subscription } from "./model";

export function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export type CustomerOrder = "access" | "due";
type PanelFilter = "all" | "panel-diogo" | "panel-poyeland";
function expiryTime(s: Subscription) {
  return Date.parse(s.expiresAt || s.expires + "T23:59:59");
}
function dueLabel(s: Subscription, now = Date.now()) {
  if (s.status === "disabled") return "Suspendu";
  const left = expiryTime(s) - now;
  if (left < 0) return "Expiré";
  if (s.plan === "trial24") {
    const hours = Math.max(1, Math.ceil(left / 36e5));
    return hours >= 24 ? "Test 24 h" : `Encore ${hours} h`;
  }
  const days = Math.floor(left / 864e5);
  return days === 0 ? "Aujourd’hui" : `Dans ${days} j`;
}
function shortDate(s: Subscription) {
  const d = new Date(s.expiresAt || s.expires + "T12:00:00");
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear()
      ? { year: "2-digit" as const }
      : {}),
    ...(s.plan === "trial24"
      ? { hour: "2-digit" as const, minute: "2-digit" as const }
      : {}),
  }).format(d);
}
// Texte trop long (note ou pseudo) : il défile doucement puis revient.
// Mesure sur la largeur réelle du texte (fiable sur Safari iOS) et animation
// par Web Animations, sans valeur calculée dans les @keyframes CSS.
function useMarquee(text: string) {
  const box = useRef<HTMLElement>(null),
    inner = useRef<HTMLSpanElement>(null),
    [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current,
        i = inner.current;
      if (!b || !i) return;
      const style = getComputedStyle(b);
      const room =
        b.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const overflow = Math.ceil(i.getBoundingClientRect().width - room);
      setShift(overflow > 1 ? overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    if (inner.current) observer.observe(inner.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [text]);
  useLayoutEffect(() => {
    const i = inner.current;
    if (!i || !shift || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const end = `translateX(-${shift + 4}px)`;
    const animation = i.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: 0.22 },
        { transform: end, offset: 0.62 },
        { transform: end, offset: 0.8 },
        { transform: "translateX(0)", offset: 1 },
      ],
      {
        duration: Math.max(5000, 3000 + shift * 55),
        iterations: Infinity,
        easing: "ease-in-out",
      },
    );
    return () => animation.cancel();
  }, [shift]);
  return { box, inner, scrolling: shift > 0 };
}
function ScrollingNote({ text }: { text: string }) {
  const { box, inner, scrolling } = useMarquee(text);
  return (
    <span
      ref={box as React.RefObject<HTMLSpanElement>}
      className={"customer-note" + (scrolling ? " scrolling" : "")}
      title={text}
    >
      <span ref={inner}>{text}</span>
    </span>
  );
}
function ScrollingPseudo({
  text,
  className,
  title,
  onClick,
}: {
  text: string;
  className: string;
  title?: string;
  onClick: () => void;
}) {
  const { box, inner, scrolling } = useMarquee(text);
  return (
    <button
      ref={box as React.RefObject<HTMLButtonElement>}
      type="button"
      className={className + (scrolling ? " scrolling" : "")}
      title={title}
      aria-label={text}
      onClick={onClick}
    >
      <span ref={inner}>{text}</span>
    </button>
  );
}
export function accessText(pseudo: string, sub: Subscription) {
  return [
    ["Pseudo", pseudo],
    ["Mot de passe", sub.password],
    ["Lien", serverAddress(sub)],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} : ${v}`)
    .join("\n");
}
export function CustomerTable({
  clients,
  onOpen,
  onPaid,
  onCopy,
  busy,
  order = "access",
  panelName = (client: Client, sub: Subscription) => sub.provider,
}: {
  clients: Client[];
  onOpen: (id: string) => void;
  onPaid: (client: Client, subscription: Subscription) => void;
  onCopy: (value: string, message?: string) => void;
  busy: boolean;
  order?: CustomerOrder;
  panelName?: (client: Client, sub: Subscription) => string;
}) {
  const [filter, setFilter] = useState<PanelFilter>("all"),
    [copied, setCopied] = useState("");
  const rows = customerRows(clients).map((row) => ({
    ...row,
    accent: (row.subscription
      ? panelAccent(panelName(row.client, row.subscription))
      : "") as PanelFilter | "",
  }));
  if (order === "due")
    rows.sort(
      (a, b) =>
        Number(!a.subscription) - Number(!b.subscription) ||
        (a.subscription && b.subscription
          ? expiryTime(a.subscription) - expiryTime(b.subscription)
          : 0),
    );
  const counts = {
    "panel-diogo": rows.filter((r) => r.accent === "panel-diogo").length,
    "panel-poyeland": rows.filter((r) => r.accent === "panel-poyeland").length,
  };
  const shown =
    filter === "all" ? rows : rows.filter((r) => r.accent === filter);
  return (
    <>
      {(counts["panel-diogo"] > 0 || counts["panel-poyeland"] > 0) && (
        <div
          className="panel-filters"
          role="group"
          aria-label="Filtrer par panel"
        >
          {(
            [
              ["all", "Tous", rows.length],
              ["panel-diogo", "Diogo", counts["panel-diogo"]],
              ["panel-poyeland", "Poyeland", counts["panel-poyeland"]],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              className={(filter === id ? "selected " : "") + id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {id !== "all" && <i aria-hidden="true" />}
              {label} <span>{n}</span>
            </button>
          ))}
        </div>
      )}
      <p className="copy-hint">
        <Copy size={13} aria-hidden="true" />
        Touchez le mot de passe ou le lien pour le copier
      </p>
      <ul className="customer-cards" aria-label="Liste des clients">
        {shown.map(({ client: c, subscription: s, accent }) => {
          const contact = customerContact(c),
            url = contactUrl(contact.platform, contact.value);
          const pseudo = clientPseudo(c, s || undefined);
          const server = s ? serverAddress(s) : "";
          const note = clientNotes(c).split("\n")[0].trim();
          const key = c.id + ":" + (s?.id || "empty");
          const copyCell = (
            field: "password" | "server",
            value: string,
            label: string,
          ) => (
            <button
              type="button"
              className={
                "copy-cell " + field + (copied === key + field ? " copied" : "")
              }
              disabled={!value}
              aria-label={`Copier ${label} de ${pseudo}`}
              onClick={() => {
                onCopy(value);
                setCopied(key + field);
                window.setTimeout(
                  () => setCopied((v) => (v === key + field ? "" : v)),
                  1400,
                );
              }}
            >
              {copied === key + field ? (
                <Check size={14} aria-hidden="true" />
              ) : field === "password" ? (
                <KeyRound size={14} aria-hidden="true" />
              ) : (
                <Link2 size={14} aria-hidden="true" />
              )}
              <code
                className={
                  field === "password" ? "table-plain-secret" : "table-server"
                }
              >
                {value || "—"}
              </code>
            </button>
          );
          return (
            <li className={"customer-card " + accent} key={key}>
              <div className="customer-card-head">
                <ScrollingPseudo
                  text={pseudo}
                  className={"table-pseudo " + accent}
                  title={s ? panelName(c, s) : undefined}
                  onClick={() => onOpen(c.id)}
                />
                {s && s.paid !== true && (
                  <button
                    type="button"
                    className="unpaid-icon"
                    disabled={busy}
                    title="Pas encore réglé"
                    aria-label={`Non réglé : ${pseudo}. Marquer comme réglé`}
                    onClick={() => onPaid(c, s)}
                  >
                    <Coins size={18} />
                  </button>
                )}
                {note && <ScrollingNote text={note} />}
                {s && (
                  <span className="customer-due">
                    <strong>{dueLabel(s)}</strong>
                    <small>{shortDate(s)}</small>
                  </span>
                )}
              </div>
              {s && (
                <>
                  <div className="customer-copy">
                    {copyCell("password", s.password, "le mot de passe")}
                    {copyCell("server", server, "le lien")}
                  </div>
                  <div className="customer-card-foot">
                    <span className="customer-tags">
                      {s.player && (
                        <span className="customer-tag app">{s.player}</span>
                      )}
                      <span className="customer-tag">
                        {planLabels[planOf(s)]}
                      </span>
                      {contact.value &&
                        (url ? (
                          <a
                            className="customer-tag contact"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ContactIcon platform={contact.platform} />
                            {contact.value}
                          </a>
                        ) : (
                          <span className="customer-tag contact">
                            <ContactIcon platform={contact.platform} />
                            {contact.value}
                          </span>
                        ))}
                    </span>
                    <button
                      type="button"
                      className="copy-access"
                      aria-label={"Copier les accès de " + pseudo}
                      onClick={() => {
                        const text = accessText(pseudo, s);
                        onCopy(text, `Accès de ${pseudo} copiés\n${text}`);
                      }}
                    >
                      <Copy size={15} aria-hidden="true" />
                      Accès
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
export function FinancialDashboard({
  clients,
  panels,
}: {
  clients: Client[];
  panels: ProviderPanel[];
}) {
  const totals = financialSummary(clients);
  const months = [...new Set(totals.records.map((r) => r.at.slice(0, 7)))]
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      const label = new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(new Date(year, month - 1, 1));
      return {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        result: calendarMonthProfit(totals.records, year, month - 1),
      };
    });
  return (
    <div className="financial-dashboard">
      <div className="financial-cards">
        {[
          ["Bénéfice", totals.profit],
          ["Bénéfice / mois", totals.monthly],
        ].map(([label, value]) => (
          <section className="panel financial-card" key={label}>
            <Coins size={20} />
            <span>{label}</span>
            <strong>
              {(label === "Bénéfice" && totals.incomplete) ||
              (label === "Bénéfice / mois" && totals.annualIncomplete)
                ? "À compléter"
                : money(value as number)}
            </strong>
          </section>
        ))}
      </div>
      {!!totals.incomplete && (
        <p className="alert">
          {totals.incomplete} vente(s) : prix de vente ou coût à compléter.
        </p>
      )}
      <section className="panel">
        <h2>Par panel</h2>
        {panels.map((p) => {
          const rows = totals.records.filter((s) => s.panelId === p.id);
          const revenue = rows.reduce(
              (n, s) => n + (s.paid ? Number(s.sale) || 0 : 0),
              0,
            ),
            costs = rows.reduce((n, s) => n + (Number(s.cost) || 0), 0);
          return (
            <div className="balance-panel-row" key={p.id}>
              <span>{p.name}</span>
              <strong>
                {rows.some((s) => s.sale === "" || s.cost === "")
                  ? "À compléter"
                  : money(revenue - costs)}
              </strong>
            </div>
          );
        })}
      </section>
      <section className="panel month-history">
        <h2>Bénéfice par mois</h2>
        {!months.length ? (
          <p>Aucune vente.</p>
        ) : (
          months.map(({ key, label, result }) => (
            <div className="balance-month-row" key={key}>
              <span>
                <strong>{label}</strong>
                <small>
                  {result.sales} vente(s)
                  {result.unpaid ? ` · ${result.unpaid} à encaisser` : ""}
                </small>
              </span>
              <strong>
                {result.incomplete ? "À compléter" : money(result.profit)}
              </strong>
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Ventes et renouvellements</h2>
        {!totals.records.length ? (
          <p>Aucune vente.</p>
        ) : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Panel</th>
                  <th>Vente</th>
                  <th>Achat</th>
                  <th>Bénéfice</th>
                </tr>
              </thead>
              <tbody>
                {[...totals.records]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((s) => {
                    const panel =
                      panels.find((p) => p.id === s.panelId)?.name ||
                      s.provider ||
                      "";
                    return (
                      <tr key={s.id} className={panelAccent(panel)}>
                        <td>{new Date(s.at).toLocaleDateString("fr-FR")}</td>
                        <td className={"sale-client " + panelAccent(panel)}>
                          {s.clientPseudo}
                        </td>
                        <td>{panel || "—"}</td>
                        <td>
                          {s.sale === "" ? "—" : money(s.sale)}
                          {!s.paid && (
                            <span className="unpaid-text"> À encaisser</span>
                          )}
                        </td>
                        <td>{s.cost === "" ? "—" : money(s.cost)}</td>
                        <td>
                          {s.sale === "" || s.cost === ""
                            ? "—"
                            : money(
                                (s.paid ? Number(s.sale) || 0 : 0) -
                                  (Number(s.cost) || 0),
                              )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
