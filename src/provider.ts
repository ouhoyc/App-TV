import { request } from "./cloudStore";
import { normalizeProviderKey } from "../lib/providerInput.js";

export { PROVIDER_URL, normalizeProviderKey } from "../lib/providerInput.js";
export interface ProviderAccount {
  name: string | null;
  credits: number | null;
  enabled: boolean | null;
}
export function testProviderConnection(key: string) {
  return request<ProviderAccount>("provider", {
    action: "test",
    acceptPartial: true,
    key: normalizeProviderKey(key),
  });
}
