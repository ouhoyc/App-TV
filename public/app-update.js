const status = document.getElementById("status");
const retry = document.getElementById("retry");
let running = false;
async function updateApp() {
  if (running) return;
  running = true;
  retry.hidden = true;
  status.textContent =
    "Mise à jour d’SCDR TV en cours… Vos données sont conservées.";
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });
      await registration.update();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "La mise à jour prend plus de temps que prévu. Réessayez avec une connexion internet.",
              ),
            ),
          15000,
        );
        const check = () => {
          const worker =
            registration.installing ||
            registration.waiting ||
            registration.active;
          if (!worker || worker.state === "redundant") return;
          if (worker.state === "installed")
            worker.postMessage({ type: "SKIP_WAITING" });
          if (worker.state === "activated") {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => {
              channel.port1.close();
              if (event.data?.networkNavigation) {
                clearTimeout(timer);
                resolve();
              }
            };
            worker.postMessage({ type: "APP_TV_UPDATE_CHECK" }, [
              channel.port2,
            ]);
          } else worker.addEventListener("statechange", check, { once: true });
        };
        registration.addEventListener("updatefound", check, { once: true });
        check();
      });
    }
    location.replace("/?setup=face-id");
  } catch (e) {
    status.textContent = e.message || "Connexion indisponible. Réessayez.";
    retry.hidden = false;
    running = false;
  }
}
retry.addEventListener("click", updateApp);
void updateApp();
