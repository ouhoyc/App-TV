export const BACKGROUND_LOCK_DELAY = 5 * 60 * 1000;

// iOS can freeze timers in the background. Always check elapsed wall time on
// return as well as scheduling a timer; foreground inactivity never locks.
export function watchBackgroundLock(
  onLock: () => void,
  suspended: () => boolean = () => false,
) {
  let hiddenAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expire = () => {
    clearTimeout(timer);
    hiddenAt = null;
    onLock();
  };
  const hide = () => {
    if (suspended() || hiddenAt !== null) return;
    hiddenAt = Date.now();
    timer = setTimeout(expire, BACKGROUND_LOCK_DELAY);
  };
  const sync = () => {
    if (suspended()) return;
    if (document.hidden) return hide();
    if (hiddenAt !== null && Date.now() - hiddenAt >= BACKGROUND_LOCK_DELAY)
      expire();
    else {
      clearTimeout(timer);
      hiddenAt = null;
    }
  };
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", sync);
  sync();
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", sync);
  };
}
