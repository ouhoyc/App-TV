export const PROVIDER_URL = "https://8k.online-cms.ru/api/api.php";

// A pasted API link is input, never a request to execute its action or URL.
export function normalizeProviderKey(value) {
  let key = typeof value === "string" ? value.trim() : "";
  if (/^https?:\/\//i.test(key)) {
    let url;
    try {
      url = new URL(key);
    } catch {
      throw new Error(
        "Le lien API est incomplet. Copiez la clé API seule depuis votre panel.",
      );
    }
    if (
      url.origin + url.pathname !== PROVIDER_URL ||
      url.username ||
      url.password
    )
      throw new Error(
        "Ce lien utilise une autre adresse API. Copiez la clé seule ou vérifiez l’adresse de votre panel.",
      );
    if (url.searchParams.getAll("api_key").length !== 1)
      throw new Error(
        "Ce lien ne contient pas une clé API unique. Copiez la clé seule depuis votre panel.",
      );
    key = url.searchParams.get("api_key").trim();
  }
  if (!key || key.length > 512 || /[\s\x00-\x1f\x7f]/.test(key))
    throw new Error("Saisissez votre clé API personnelle, sans espace.");
  return key;
}
