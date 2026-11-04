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
export function CustomerTable({
  clients,
  onOpen,
  onPaid,
  busy,
  panelName = (client: Client, sub: Subscription) => sub.provider,
}: {
  clients: Client[];
  onOpen: (id: string) => void;
  onPaid: (client: Client, subscription: Subscription) => void;
  busy: boolean;
  panelName?: (client: Client, sub: Subscription) => string;
}) {
  return (
    <div
      className="customer-table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Tableau clients"
    >
      <table className="customer-table">
        <thead>
          <tr>
            {[
              "Pseudo",
              "Mot de passe",
              "Lien",
              "Durée",
              "Expiration",
              "Contact",
              "Application",
              "Prix de vente",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customerRows(clients).map(({ client: c, subscription: s }) => {
            const contact = customerContact(c),
              url = contactUrl(contact.platform, contact.value);
            const pseudo = clientPseudo(c, s || undefined);
            return (
              <tr key={c.id + ":" + (s?.id || "empty")}>
                <td>
                  <span className="pseudo-cell">
                    <button
                      type="button"
                      className={
                        "table-pseudo " + panelAccent(s ? panelName(c, s) : "")
                      }
                      title={s ? panelName(c, s) : undefined}
                      onClick={() => onOpen(c.id)}
                    >
                      {pseudo}
                    </button>
                    {s && s.paid !== true && (
                      <button
                        type="button"
                        className="unpaid-icon"
                        disabled={busy}
                        title="Pas encore réglé"
                        aria-label={`Non réglé : ${pseudo}. Marquer comme réglé`}
                        onClick={() => onPaid(c, s)}
                      >
                        <Coins size={19} />
                      </button>
                    )}
                  </span>
                </td>
                <td className="table-plain-secret">{s?.password || "—"}</td>
                <td className="table-server">
                  {s ? serverAddress(s) || "—" : "—"}
                </td>
                <td>{s ? planLabels[planOf(s)] : "—"}</td>
                <td>
                  {s
                    ? new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        ...(s.plan === "trial24"
                          ? { timeStyle: "short" as const }
                          : {}),
                      }).format(
                        new Date(s.expiresAt || s.expires + "T12:00:00"),
                      )
                    : "—"}
                </td>
                <td>
                  {contact.value ? (
                    <>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {contact.value}
                        </a>
                      ) : (
                        contact.value
                      )}
                      <small>{contact.platform}</small>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{s?.player || "—"}</td>
                <td>
                  {s?.sale !== undefined && s.sale !== "" ? money(s.sale) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
                  <th>Panel</th>
                  <th>Vente</th>
                  <th>Achat</th>
                  <th>Bénéfice</th>
                </tr>
              </thead>
              <tbody>
                {[...totals.records]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.at).toLocaleDateString("fr-FR")}</td>
                      <td>
                        {panels.find((p) => p.id === s.panelId)?.name || "—"}
                      </td>
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
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
