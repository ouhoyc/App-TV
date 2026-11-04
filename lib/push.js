import webpush from "web-push";
import { ApiError } from "./server.js";
export function pushConfig() {
  if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY)
    throw new ApiError(
      "Les notifications ne sont pas encore configurées.",
      503,
    );
  return {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
    subject: "https://app-tv-alpha.vercel.app",
  };
}
export function validPushSubscription(value) {
  let url;
  try {
    url = new URL(value?.endpoint);
  } catch {
    throw new ApiError("Adresse de notification invalide.");
  }
  if (
    url.protocol !== "https:" ||
    ![
      "web.push.apple.com",
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
    ].includes(url.hostname) ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.href.length > 4096
  )
    throw new ApiError("Service de notifications non reconnu.");
  const key = value?.keys?.p256dh,
    auth = value?.keys?.auth;
  if (
    typeof key !== "string" ||
    typeof auth !== "string" ||
    !/^[\w=-]+$/.test(key) ||
    !/^[\w=-]+$/.test(auth) ||
    Buffer.from(key, "base64url").length !== 65 ||
    Buffer.from(auth, "base64url").length !== 16
  )
    throw new ApiError("Clés de notification invalides.");
  return { endpoint: url.href, keys: { p256dh: key, auth } };
}
export async function sendNativePush(
  subscription,
  payload,
  sender = webpush.sendNotification,
) {
  try {
    const checked = validPushSubscription(subscription);
    const result = await sender(checked, JSON.stringify(payload), {
      vapidDetails: pushConfig(),
      TTL: 3600,
      urgency: "high",
      timeout: 10000,
    });
    return result.statusCode || 201;
  } catch (e) {
    return e instanceof ApiError ? 400 : Number(e.statusCode) || 0;
  }
}
