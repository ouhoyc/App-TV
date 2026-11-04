try {
  const target = new URL(decodeURIComponent(location.hash.slice(1)));
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error();
  history.replaceState(null, "", location.pathname);
  const link = document.getElementById("continue");
  link.href = target.href;
  link.hidden = false;
  location.replace(target.href);
} catch {
  document.getElementById("status").textContent =
    "Le lien du panel est invalide. Corrigez-le dans les réglages de SCDR TV.";
}
