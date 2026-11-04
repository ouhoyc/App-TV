import {
  prepare,
  sessionClient,
  check,
  ApiError,
  respondError,
} from "../lib/server.js";
const category = (value) => ["ads", "tutorials"].includes(value);
const validThumbnail = (value) =>
  !!value && typeof value === "object" && JSON.stringify(value).length < 115000;
const uuid = (s) =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s);
export default async function handler(req, res) {
  try {
    prepare(req, res);
    const { db, profile } = await sessionClient(req, res);
    if (req.method === "GET") {
      if (req.query.id) {
        if (!uuid(req.query.id)) throw new ApiError("Image invalide.");
        const { data, error } = await db
          .from("app_tv_media")
          .select("id,owner_id,payload,created_at")
          .eq("id", req.query.id)
          .maybeSingle();
        check(error);
        if (!data) throw new ApiError("Image inaccessible.", 404);
        return res.json(data);
      }
      const owners = String(req.query.owners || profile.id).split(",");
      if (owners.length > 100 || owners.some((v) => !uuid(v)))
        throw new ApiError("Clientèle invalide.");
      let query = db
        .from("app_tv_media")
        .select("id,owner_id,created_at,category,thumbnail")
        .in("owner_id", owners)
        .order("created_at", { ascending: false })
        .limit(24);
      if (req.query.category) {
        if (!category(req.query.category))
          throw new ApiError("Catégorie invalide.");
        query = query.eq("category", req.query.category);
      }
      if (req.query.before)
        query = query.lt("created_at", String(req.query.before));
      const { data, error } = await query;
      check(error);
      return res.json({ images: data });
    }
    const b = req.body || {};
    if (b.action === "upload") {
      if (
        !uuid(b.ownerId) ||
        !b.payload ||
        JSON.stringify(b.payload).length > 3100000
      )
        throw new ApiError("Image trop volumineuse ou invalide.");
      if (b.thumbnail && !validThumbnail(b.thumbnail))
        throw new ApiError("Vignette invalide.");
      if (profile.role !== "admin" && b.ownerId !== profile.id)
        throw new ApiError("Clientèle refusée.", 403);
      const { data, error } = await db
        .from("app_tv_media")
        .insert({
          owner_id: b.ownerId,
          payload: b.payload,
          category: category(b.category) ? b.category : "ads",
          ...(b.thumbnail ? { thumbnail: b.thumbnail } : {}),
        })
        .select("id,owner_id,created_at,category,thumbnail")
        .single();
      check(error);
      return res.json(data);
    }
    if (["thumbnail", "category"].includes(b.action)) {
      if (
        !uuid(b.id) ||
        (b.action === "thumbnail" && !validThumbnail(b.thumbnail)) ||
        (b.action === "category" && !category(b.category))
      )
        throw new ApiError("Photo ou catégorie invalide.");
      const { data, error } = await db
        .from("app_tv_media")
        .update(
          b.action === "thumbnail"
            ? { thumbnail: b.thumbnail }
            : { category: b.category },
        )
        .eq("id", b.id)
        .select("id,owner_id,created_at,category,thumbnail")
        .maybeSingle();
      check(error);
      if (!data) throw new ApiError("Image inaccessible.", 404);
      return res.json(data);
    }
    if (b.action === "delete") {
      if (!uuid(b.id)) throw new ApiError("Image invalide.");
      const { error } = await db.from("app_tv_media").delete().eq("id", b.id);
      check(error);
      return res.json({ ok: true });
    }
    throw new ApiError("Action inconnue.");
  } catch (e) {
    respondError(res, e);
  }
}
