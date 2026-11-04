import { planOf } from "./commerce";
import type { Client } from "./model";

export interface Reminder {
  id: string;
  client_id: string;
  subscription_id: string;
  kind: "trial24" | "annual";
  due_at: string;
  expires_at: string;
}
export async function remindersFor(
  clients: Client[],
  instant = Date.now(),
): Promise<Reminder[]> {
  const output: Reminder[] = [];
  for (const client of clients) {
    if (client.archived) continue;
    for (const sub of client.subscriptions) {
      const plan = planOf(sub);
      if (sub.status !== "enabled" || !["trial24", "year1"].includes(plan))
        continue;
      const end = Date.parse(sub.expiresAt || sub.expires + "T09:00:00Z");
      if (!Number.isFinite(end) || end < instant - 7 * 86400000) continue;
      const kind = plan === "trial24" ? "trial24" : "annual";
      const due = kind === "trial24" ? end : end - 14 * 86400000;
      const data = new TextEncoder().encode(
        `scdr-reminder:${client.id}:${sub.id}:${kind}:${end}`,
      );
      const id = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      output.push({
        id,
        client_id: client.id,
        subscription_id: sub.id,
        kind,
        due_at: new Date(due).toISOString(),
        expires_at: new Date(end).toISOString(),
      });
    }
  }
  return output;
}
