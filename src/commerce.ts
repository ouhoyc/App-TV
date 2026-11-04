import {
  addMonths,
  today,
  type Client,
  type Plan,
  type ProviderPanel,
  type Sale,
  type Subscription,
} from "./model";

export const money = (value: number | string) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(value) || 0,
  );
export const planLabels: Record<Plan, string> = {
  trial24: "Test 24 h",
  month1: "1 mois",
  month3: "3 mois",
  month6: "6 mois",
  year1: "1 an",
  custom: "Personnalisée",
};
export const planMonths = (plan?: Plan) =>
  plan === "year1"
    ? 12
    : plan === "month6"
      ? 6
      : plan === "month3"
        ? 3
        : plan === "month1"
          ? 1
          : 0;
export function planOf(s: Subscription): Plan {
  if (s.plan && s.plan !== "custom") return s.plan;
  if (s.start && s.expires === addMonths(s.start, 12)) return "year1";
  return "custom";
}
export function applyPlan(
  s: Subscription,
  plan: Plan,
  instant = new Date(),
): Subscription {
  if (plan === "trial24") {
    const end = new Date(instant.getTime() + 86400000);
    const local = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      ...s,
      plan,
      start: local(instant),
      trialStartedAt: instant.toISOString(),
      expiresAt: end.toISOString(),
      expires: local(end),
    };
  }
  const months = planMonths(plan);
  return {
    ...s,
    plan,
    trialStartedAt: undefined,
    expiresAt: undefined,
    ...(months ? { expires: addMonths(s.start || today(), months) } : {}),
  };
}
export function panelCost(panel: ProviderPanel | undefined, months = 12) {
  return panel?.annualCost !== undefined && panel.annualCost !== ""
    ? ((Number(panel.annualCost) * months) / 12).toFixed(2)
    : "";
}
export function invoice(
  s: Subscription,
  id: string = crypto.randomUUID(),
  at = s.renewals.length ? new Date().toISOString() : s.start + "T12:00:00Z",
): Subscription {
  if (s.sales?.some((v) => v.id === id)) return s;
  const sale: Sale = {
    id,
    at,
    sale: s.sale,
    cost: s.cost,
    paid: s.paid === true,
    months: planMonths(planOf(s)),
    panelId: s.panelId || "",
    plan: planOf(s),
  };
  return { ...s, sales: [...(s.sales || []), sale] };
}
export function paidSubscription(s: Subscription, paid: boolean): Subscription {
  const withHistory = s.sales?.length
    ? s
    : invoice(s, "legacy:" + s.id, s.start + "T12:00:00Z");
  return {
    ...withHistory,
    paid,
    sales: withHistory.sales!.map((v, i, all) =>
      i === all.length - 1 ? { ...v, paid } : v,
    ),
  };
}
export function prepareClient(
  previous: Client | undefined,
  next: Client,
): Client {
  return {
    ...next,
    subscriptions: next.subscriptions.map((s) => {
      const before = previous?.subscriptions.find((v) => v.id === s.id);
      if (!before && !s.sales?.length) return invoice(s);
      if (
        before &&
        s.renewals.length > before.renewals.length &&
        s.sales?.length === before.sales?.length
      ) {
        const prior = before.sales?.length
          ? before.sales
          : invoice(before, "legacy:" + before.id, before.start + "T12:00:00Z")
              .sales;
        return invoice({ ...s, sales: prior, paid: false });
      }
      if (
        before &&
        s.sales?.length &&
        (s.sale !== before.sale ||
          s.cost !== before.cost ||
          s.panelId !== before.panelId ||
          planOf(s) !== planOf(before))
      )
        return {
          ...s,
          sales: s.sales.map((v, i, all) =>
            i === all.length - 1
              ? {
                  ...v,
                  sale: s.sale,
                  cost: s.cost,
                  panelId: s.panelId || "",
                  plan: planOf(s),
                  months: planMonths(planOf(s)),
                }
              : v,
          ),
        };
      return s;
    }),
  };
}
export function financialSummary(clients: Client[]) {
  const records = clients.flatMap((c) =>
    c.subscriptions.flatMap((s) =>
      s.sales?.length
        ? s.sales.map((sale, index) =>
            index === 0 ? { ...sale, at: s.start + "T12:00:00Z" } : sale,
          )
        : [
            {
              id: s.id,
              at: s.start,
              sale: s.sale,
              cost: s.cost,
              paid: s.paid === true,
              months: planMonths(planOf(s)),
              plan: planOf(s),
              panelId: s.panelId || "",
            },
          ],
    ),
  );
  const collected = records.reduce(
    (n, s) => n + (s.paid ? Number(s.sale) || 0 : 0),
    0,
  );
  const purchases = records.reduce((n, s) => n + (Number(s.cost) || 0), 0);
  const outstanding = records.reduce(
    (n, s) => n + (!s.paid ? Number(s.sale) || 0 : 0),
    0,
  );
  const annual = records.filter((s) => s.months === 12);
  const monthly = annual.reduce(
    (n, s) =>
      n + ((s.paid ? Number(s.sale) || 0 : 0) - (Number(s.cost) || 0)) / 12,
    0,
  );
  return {
    records,
    collected,
    purchases,
    outstanding,
    profit: collected - purchases,
    monthly,
    incomplete: records.filter((s) => s.sale === "" || s.cost === "").length,
    annualIncomplete: annual.some((s) => s.sale === "" || s.cost === ""),
  };
}
export function customerContact(client: Client) {
  return (
    client.contact ||
    (client.whatsapp
      ? { platform: "WhatsApp", value: client.whatsapp }
      : { platform: "Téléphone", value: client.phone })
  );
}
export function contactUrl(platform: string, value: string) {
  const v = value.trim(),
    username = v.replace(/^@/, "");
  if (!v) return "";
  if (platform === "Téléphone") return "tel:" + v.replace(/[^+\d]/g, "");
  if (platform === "WhatsApp") return "https://wa.me/" + v.replace(/\D/g, "");
  if (platform === "Telegram")
    return "https://t.me/" + encodeURIComponent(username);
  if (platform === "Snapchat")
    return "https://www.snapchat.com/add/" + encodeURIComponent(username);
  return "";
}

export function clientPseudo(client: Client, sub = client.subscriptions[0]) {
  if (sub?.username) return sub.username;
  if (sub?.m3u)
    try {
      const value = new URL(sub.m3u).searchParams.get("username");
      if (value) return value;
    } catch {}
  return client.name;
}
export function serverAddress(sub: Subscription) {
  if (sub.server) return sub.server;
  try {
    return sub.m3u ? new URL(sub.m3u).origin : "";
  } catch {
    return "";
  }
}
export function clientNotes(client: Client) {
  return [
    ...new Set(
      [client.notes, ...client.subscriptions.map((s) => s.notes)]
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].join("\n\n");
}
export function customerRows(clients: Client[]) {
  return clients
    .flatMap((client) =>
      (client.subscriptions.length ? client.subscriptions : [null]).map(
        (subscription) => ({ client, subscription }),
      ),
    )
    .sort((a, b) => {
      const expiry = (s: Subscription | null) =>
        s?.expiresAt || (s?.expires ? s.expires + "T23:59:59Z" : "");
      return (
        Number(b.subscription?.plan === "trial24") -
          Number(a.subscription?.plan === "trial24") ||
        expiry(b.subscription).localeCompare(expiry(a.subscription)) ||
        b.client.createdAt.localeCompare(a.client.createdAt) ||
        a.client.id.localeCompare(b.client.id)
      );
    });
}

export function panelAccent(name: string) {
  const value = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return value.includes("diogo")
    ? "panel-diogo"
    : /poye?land/.test(value)
      ? "panel-poyeland"
      : "";
}
