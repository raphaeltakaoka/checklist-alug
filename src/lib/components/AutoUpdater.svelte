<script>
  import { onMount } from "svelte";
  import { page, updated } from "$app/state";
  import { beforeNavigate } from "$app/navigation";

  let registration = null;
  let updatePending = false;
  let refreshing = false;
  let updateTimeout = null;

  const isInspection = $derived(page.url.pathname.startsWith("/dashboard/new"));

  function reloadPage(targetUrl) {
    if (refreshing) return;
    refreshing = true;
    if (targetUrl) {
      window.location.href = targetUrl;
    } else {
      window.location.reload();
    }
  }

  function applyUpdate(targetUrl) {
    if (isInspection) {
      updatePending = true;
      return;
    }

    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => reloadPage(targetUrl), 1000);
    } else {
      reloadPage(targetUrl);
    }
  }

  function scheduleAutoUpdate() {
    updatePending = true;

    if (isInspection) return;

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      applyUpdate();
      return;
    }

    if (!updateTimeout) {
      updateTimeout = setTimeout(() => {
        updateTimeout = null;
        if (!isInspection) {
          applyUpdate();
        }
      }, 4000);
    }
  }

  beforeNavigate(({ willUnload, to }) => {
    if (willUnload || !to?.url) return;

    if (to.url.pathname.startsWith("/dashboard/new")) return;

    if (updatePending || updated.current) {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
      applyUpdate(to.url.href);
    }
  });

  $effect(() => {
    if (updated.current) {
      updatePending = true;
    }
  });

  onMount(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!isInspection) {
        reloadPage();
      } else {
        updatePending = true;
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && updatePending && !isInspection) {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
          updateTimeout = null;
        }
        applyUpdate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    navigator.serviceWorker.ready.then(reg => {
      registration = reg;

      if (reg.waiting) {
        scheduleAutoUpdate();
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              scheduleAutoUpdate();
            }
          });
        }
      });
    });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
    };
  });
</script>
