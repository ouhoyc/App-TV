// Aucun protocole ni paramètre d’authentification inventé en l’absence de la documentation 1.81.
export interface ProviderReadAdapter {
  testConnection(
    signal?: AbortSignal,
  ): Promise<{ name: string; credits: number }>;
  deviceInfo(identifier: string, signal?: AbortSignal): Promise<unknown>;
}
export const providerAvailability = {
  reads: false,
  writes: false,
  reason:
    "En attente de la documentation Strong 8K 1.81 et de la vérification HTTPS / CORS. Aucun appel réseau n’est effectué.",
} as const;
