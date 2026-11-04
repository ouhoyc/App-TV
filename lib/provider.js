import { ApiError } from "./server.js";
import { PROVIDER_URL, normalizeProviderKey } from "./providerInput.js";

function failure(message, status, code) {
  const error = new ApiError(message, status);
  error.providerCode = code;
  return error;
}
function flag(value) {
  if (typeof value === "string") value = value.trim().toLowerCase();
  if ([true, 1, "1", "true", "success", "ok"].includes(value)) return true;
  if ([false, 0, "0", "false", "error", "failed"].includes(value)) return false;
  return null;
}
function responseShape(data) {
  const record = Array.isArray(data) ? data[0] : data;
  return {
    kind: Array.isArray(data) ? "array" : data === null ? "null" : typeof data,
    ...(Array.isArray(data) ? { rows: data.length } : {}),
    fields:
      record && typeof record === "object"
        ? [
            "status",
            "username",
            "credits",
            "enabled",
            "error",
            "message",
            "data",
            "result",
            "reseller",
          ].filter((name) => Object.hasOwn(record, name))
        : [],
  };
}

// GOLD PANEL 1.81: only read-only reseller info. No arbitrary URL/action and no
// upstream messages reflected: they may contain credentials.
export function providerKey(body) {
  let key;
  try {
    key = normalizeProviderKey(body.key);
  } catch (error) {
    throw failure(error.message, 400, "INPUT_INVALID");
  }
  return key;
}
export async function providerCall(parameters, fetcher = fetch) {
  const url = new URL(PROVIDER_URL);
  url.search = new URLSearchParams(parameters).toString();
  let data;
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if (response.status === 429)
        throw failure(
          "Le fournisseur limite les tentatives. Attendez un moment avant de réessayer.",
          502,
          "UPSTREAM_RATE_LIMIT",
        );
      if ([401, 403].includes(response.status))
        throw failure(
          "Le fournisseur bloque l’accès à son API. La clé, les autorisations API ou une restriction d’adresse IP peuvent être en cause.",
          502,
          "UPSTREAM_HTTP_DENIED",
        );
      throw failure(
        "Le service API du fournisseur est momentanément indisponible.",
        502,
        "UPSTREAM_HTTP_ERROR",
      );
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > (parameters.action === "bouquet" ? 1048576 : 65536))
          throw failure(
            "La réponse du fournisseur est trop volumineuse.",
            502,
            "UPSTREAM_FORMAT",
          );
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    try {
      data = JSON.parse(
        Buffer.concat(chunks)
          .toString("utf8")
          .replace(/^\uFEFF/, ""),
      );
    } catch {
      throw failure(
        "Le fournisseur n’a pas renvoyé les informations API attendues. Vérifiez que l’accès API est activé sur ce panel.",
        502,
        "UPSTREAM_FORMAT",
      );
    }
  } catch (error) {
    if (error.providerCode) throw error;
    throw failure(
      "Le fournisseur ne répond pas correctement. Réessayez dans un instant.",
      502,
      "UPSTREAM_NETWORK",
    );
  }
  const account = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    parameters.action === "bouquet" &&
    Array.isArray(data) &&
    !data.some((v) => v && Object.hasOwn(v, "status"))
  )
    return data;
  if (
    !account ||
    typeof account !== "object" ||
    Array.isArray(account) ||
    flag(account.status) === null
  ) {
    const error = failure(
      "Le format de réponse du fournisseur n’est pas reconnu. Cela ne signifie pas que votre clé est incorrecte.",
      502,
      "UPSTREAM_FORMAT",
    );
    error.providerShape = responseShape(data);
    throw error;
  }
  if (flag(account.status) === false) {
    // Classify allowlisted reasons; never send/log the provider's raw text.
    const reason = [account.message, account.messasge, account.error]
      .filter((v) => typeof v === "string")
      .join(" ")
      .slice(0, 2000);
    if (
      /\bip\b.*(not allowed|blocked|denied|whitelist|unauthori[sz]ed)|(?:allow|white)list.*\bip\b/i.test(
        reason,
      )
    )
      throw failure(
        "Le fournisseur refuse l’adresse IP de notre serveur. L’accès API doit être autorisé côté panel.",
        422,
        "UPSTREAM_IP_DENIED",
      );
    if (
      /api.*(?:disabled|not enabled)|(?:disabled|not enabled).*api/i.test(
        reason,
      )
    )
      throw failure(
        "L’accès API est désactivé sur ce panel. Activez-le auprès du fournisseur.",
        422,
        "UPSTREAM_API_DISABLED",
      );
    if (
      /(?:invalid|wrong|incorrect|unknown).{0,20}(?:api[ _-]?)?key|(?:api[ _-]?)?key.{0,20}(?:invalid|wrong|incorrect|not found)/i.test(
        reason,
      )
    )
      throw failure(
        "Ce panel indique que la clé API n’est pas reconnue. Recopiez la clé depuis ce même panel.",
        422,
        "UPSTREAM_KEY_DENIED",
      );
    throw failure(
      "Le panel refuse la connexion. Vérifiez que cette clé appartient à ce panel et que son accès API est activé.",
      422,
      "UPSTREAM_REJECTED",
    );
  }
  return account;
}
export async function testProviderAccount(body, fetcher = fetch) {
  if (body?.action !== "test") throw new ApiError("Action non autorisée.");
  const account = await providerCall(
    { action: "reseller", api_key: providerKey(body) },
    fetcher,
  );
  // An explicit upstream success is distinct from optional account metadata.
  // Some panels omit enabled/name or put the same documented fields in data.
  // Unknown values remain null; never invent a zero balance or active status.
  const nested =
    Array.isArray(account.data) && account.data.length === 1
      ? account.data[0]
      : account.data;
  const records = [account, nested].filter(
    (v) => v && typeof v === "object" && !Array.isArray(v),
  );
  const username = records
    .map((v) => v.username)
    .find((v) => typeof v === "string" && v.trim() && v.length <= 160);
  const credits = records
    .map((v) => v.credits)
    .filter(
      (v) =>
        typeof v === "number" || (typeof v === "string" && v.trim() !== ""),
    )
    .map(Number)
    .find(Number.isFinite);
  const enabled = records.map((v) => flag(v.enabled)).find((v) => v !== null);
  const result = {
    name: username?.trim() || null,
    credits: credits ?? null,
    enabled: enabled ?? null,
  };
  if (
    result.name === null ||
    result.credits === null ||
    result.enabled === null
  ) {
    // Shape and presence only. No provider values, raw text, URL or credentials.
    console.info("scdr-provider-test", {
      code: "ACCOUNT_METADATA_PARTIAL",
      shape: responseShape(account),
      available: {
        name: result.name !== null,
        credits: result.credits !== null,
        enabled: result.enabled !== null,
      },
    });
  }
  return result;
}

const text = (value, max = 1000) =>
  typeof value === "string" && value.length <= max ? value : "";
export function providerIdentity(body) {
  if (body.type === "mag") {
    const mac = text(body.mac, 30).replace(/[:-]/g, "").toUpperCase();
    if (!/^[0-9A-F]{12}$/.test(mac))
      throw new ApiError("Adresse MAC invalide.");
    return { mac: mac.match(/.{2}/g).join(":") };
  }
  if (
    body.type !== "m3u" ||
    !text(body.username, 200).trim() ||
    !text(body.password, 200)
  )
    throw new ApiError(
      "Renseignez l’identifiant et le mot de passe M3U, ou l’adresse MAC pour MAG.",
    );
  return { username: body.username, password: body.password };
}
function apiDate(value) {
  const date = text(value, 40).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
    ? date
    : null;
}
function apiUrl(value) {
  try {
    const url = new URL(text(value, 4096));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function deviceFromRecord(record, body) {
  const identity = providerIdentity(body);
  if (
    identity.username &&
    record.username &&
    String(record.username) !== identity.username
  )
    throw failure(
      "Le panel a renvoyé un autre identifiant. Aucune fiche n’a été remplacée.",
      502,
      "DEVICE_MISMATCH",
    );
  return {
    type: body.type,
    username: text(record.username, 200) || identity.username || "",
    password: text(record.password, 200) || identity.password || "",
    mac: identity.mac || "",
    userId:
      typeof record.user_id === "number"
        ? String(record.user_id)
        : text(record.user_id, 80),
    expires: apiDate(record.expire),
    enabled: flag(record.enabled),
    server: apiUrl(record.url),
    country: text(record.country, 10),
    notes: text(record.note || record.notes),
    m3u: "",
  };
}
export async function providerDevice(body, fetcher = fetch) {
  const identity = providerIdentity(body);
  const record = await providerCall(
    { action: "device_info", ...identity, api_key: providerKey(body) },
    fetcher,
  );
  return deviceFromRecord(record, body);
}
export async function providerPackages(body, fetcher = fetch) {
  const data = await providerCall(
    { action: "bouquet", api_key: providerKey(body) },
    fetcher,
  );
  if (!Array.isArray(data) || data.length > 5000)
    throw failure(
      "La liste des bouquets du panel n’est pas reconnue.",
      502,
      "PACKAGES_FORMAT",
    );
  return data
    .map((p) => ({ id: String(p?.id ?? ""), name: text(p?.name, 200) }))
    .filter((p) => /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) && p.name);
}
export function mutationParameters(body) {
  const api_key = providerKey(body);
  if (!["create", "renew", "status"].includes(body.action))
    throw new ApiError("Action fournisseur inconnue.");
  if (body.action !== "status" && ![1, 3, 6, 12].includes(body.months))
    throw new ApiError("Choisissez 1, 3, 6 ou 12 mois.");
  if (body.action === "create") {
    if (
      !["m3u", "mag"].includes(body.type) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(String(body.pack || ""))
    )
      throw new ApiError("Choisissez un type et un bouquet valides.");
    const country = text(body.country, 3).toUpperCase();
    if (country && !/^(?:[A-Z]{2}|ALL)$/.test(country))
      throw new ApiError(
        "Le pays doit être un code de deux lettres, ou ALL pour VPN.",
      );
    const mac = body.type === "mag" ? providerIdentity(body).mac : null;
    return {
      action: "new",
      type: body.type,
      sub: String(body.months),
      pack: String(body.pack),
      ...(mac ? { user: mac } : {}),
      ...(country ? { country } : {}),
      ...(text(body.notes, 500) ? { notes: body.notes } : {}),
      api_key,
    };
  }
  if (body.action === "renew")
    return {
      action: "renew",
      type: body.type,
      ...providerIdentity(body),
      sub: String(body.months),
      api_key,
    };
  if (typeof body.enabled !== "boolean")
    throw new ApiError("Choisissez activer ou suspendre.");
  providerIdentity(body);
  return {
    action: "device_status",
    status: body.enabled ? "enable" : "disable",
    api_key,
  };
}
export async function executeProviderMutation(
  body,
  parameters,
  before,
  fetcher = fetch,
) {
  const record = await providerCall(parameters, fetcher);
  let identity = body;
  let created = null;
  if (body.action === "create") {
    const m3u = body.type === "m3u" ? apiUrl(record.url) : "";
    let username = text(record.username, 200),
      password = text(record.password, 200);
    if (m3u) {
      const url = new URL(m3u);
      username ||= url.searchParams.get("username") || "";
      password ||= url.searchParams.get("password") || "";
    }
    identity = { ...body, username, password };
    if (body.type === "mag" || (username && password))
      created = {
        ...deviceFromRecord({ ...record, username, password }, identity),
        m3u,
      };
  }
  let device = created;
  try {
    device = {
      ...created,
      ...(await providerDevice(identity, fetcher)),
      ...(created?.m3u ? { m3u: created.m3u } : {}),
    };
  } catch {
    /* The mutation succeeded. A failed follow-up read must never repeat it. */
  }
  return {
    action: body.action,
    confirmed: true,
    device,
    before,
    months: body.months || null,
    enabled: body.action === "status" ? body.enabled : null,
    needsSync:
      !device?.expires ||
      (body.action === "renew" &&
        before?.expires &&
        device.expires <= before.expires) ||
      (body.action === "status" && device?.enabled !== body.enabled),
    completedAt: new Date().toISOString(),
  };
}

// Account activation (enabled), subscription validity and API success (status)
// never prove that a stream is being watched. Missing live fields stay unknown.
export function presenceFromRecord(record) {
  const values = [record, record?.user_info].filter(
    (v) => v && typeof v === "object" && !Array.isArray(v),
  );
  let online = null,
    connections = null;
  for (const value of values) {
    for (const key of ["active_cons", "active_connections"]) {
      const raw = value[key];
      if (Array.isArray(raw)) {
        connections = raw.length;
        break;
      }
      if (
        (typeof raw === "number" ||
          (typeof raw === "string" && raw.trim() !== "")) &&
        Number.isInteger(Number(raw)) &&
        Number(raw) >= 0 &&
        Number(raw) <= 10000
      ) {
        connections = Number(raw);
        break;
      }
    }
    for (const key of ["online", "is_online", "connected"]) {
      const result = flag(value[key]);
      if (result !== null) {
        online = result;
        break;
      }
    }
    if (connections !== null) online = connections > 0;
    if (online !== null) break;
  }
  const titles = [];
  if (online === true) {
    for (const value of values) {
      for (const key of ["stream_name", "channel_name", "current_channel"]) {
        if (typeof value[key] === "string") titles.push(value[key]);
      }
      if (value.current_stream && typeof value.current_stream === "object")
        titles.push(value.current_stream.name || value.current_stream.title);
      if (Array.isArray(value.active_connections))
        for (const stream of value.active_connections)
          titles.push(
            stream?.stream_name || stream?.channel_name || stream?.name,
          );
    }
  }
  return {
    online,
    connections,
    watching: [
      ...new Set(
        titles
          .filter((v) => typeof v === "string")
          .map((v) => v.replace(/[\u0000-\u001f]/g, " ").trim())
          .filter((v) => v && !/https?:\/\/|password=|api_key=/i.test(v))
          .map((v) => v.slice(0, 200)),
      ),
    ].slice(0, 10),
  };
}
export async function providerPresence(body, fetcher = fetch) {
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 6
  )
    throw new ApiError("Vérifiez au maximum six abonnements à la fois.");
  const key = providerKey(body),
    output = [];
  let index = 0;
  async function worker() {
    while (index < body.items.length) {
      const item = body.items[index++];
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[a-z0-9_-]{1,100}$/i.test(item.id)
      )
        throw new ApiError("Abonnement invalide.");
      try {
        const identity = providerIdentity(item),
          record = await providerCall(
            { action: "device_info", ...identity, api_key: key },
            fetcher,
          );
        deviceFromRecord(record, item);
        output.push({ id: item.id, ...presenceFromRecord(record) });
      } catch (error) {
        output.push({
          id: item.id,
          online: null,
          connections: null,
          watching: [],
          error: error.status
            ? error.message
            : "Statut momentanément indisponible.",
        });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return { items: output, checkedAt: new Date().toISOString() };
}
