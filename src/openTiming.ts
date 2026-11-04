// Mesure locale de la durée d’ouverture, gardée en mémoire seulement
// (aucun stockage, aucun envoi) pour l’afficher dans Paramètres.
type Step = { label: string; ms: number; detail?: string };
let current: { start: number; last: number; steps: Step[] } | null = null;
let last: { steps: Step[]; total: number; launch?: number } | null = null;
let firstOpen = true;

export function startOpen() {
  const now = performance.now();
  current = { start: now, last: now, steps: [] };
}
export function markOpen(label: string, detail?: string) {
  if (!current) return;
  const now = performance.now();
  current.steps.push({ label, ms: now - current.last, detail });
  current.last = now;
}
export function finishOpen() {
  if (!current) return;
  last = {
    steps: current.steps,
    total: current.last - current.start,
    ...(firstOpen ? { launch: current.start } : {}),
  };
  firstOpen = false;
  current = null;
}
export function cancelOpen() {
  current = null;
}
const seconds = (ms: number) =>
  (ms / 1000).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + " s";
export function lastOpenSummary() {
  if (!last) return "";
  return [
    ...(last.launch !== undefined ? [`démarrage ${seconds(last.launch)}`] : []),
    ...last.steps.map(
      (s) => `${s.label} ${seconds(s.ms)}${s.detail ? ` (${s.detail})` : ""}`,
    ),
    `total ${seconds(last.total + (last.launch || 0))}`,
  ].join(" · ");
}

// Détail serveur transmis par l’en-tête Server-Timing (durées uniquement).
export function serverDetail(path: string) {
  try {
    const entries = performance.getEntriesByName(
      location.origin + path,
    ) as PerformanceResourceTiming[];
    const timing = entries[entries.length - 1]?.serverTiming || [];
    const names: Record<string, string> = {
      auth: "connexion",
      profil: "profil",
      donnees: "données",
    };
    const parts = timing
      .filter((t) => names[t.name])
      .map((t) => `${names[t.name]} ${seconds(t.duration)}`);
    return parts.length ? parts.join(", ") : undefined;
  } catch {
    return undefined;
  }
}
