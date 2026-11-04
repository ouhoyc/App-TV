import { check } from "./server.js";
export async function workspaceSnapshot(db, profile) {
  const tables = [
    ["profiles", db.from("app_tv_profiles").select("*").order("created_at")],
    ["keys", db.from("app_tv_public_keys").select("user_id,public_jwk")],
    [
      "keyring",
      db
        .from("app_tv_keyrings")
        .select("password_envelope,recovery_envelope")
        .eq("user_id", profile.id)
        .maybeSingle(),
    ],
    ["vaults", db.from("app_tv_vaults").select("*")],
  ];
  if (profile.role === "admin")
    tables.push([
      "invitations",
      db
        .from("app_tv_invitations")
        .select("id,email,display_name,role,expires_at,consumed_at")
        .is("consumed_at", null),
    ]);
  const results = await Promise.all(
    tables.map(async ([key, query]) => {
      const { data, error } = await query;
      check(error);
      return [key, data];
    }),
  );
  return { profile, ...Object.fromEntries(results) };
}
