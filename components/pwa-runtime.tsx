"use client";
import { useEffect } from "react";
import { basePath } from "@/lib/navigation";
import { flushOffline, syncEvent } from "@/lib/offline-runtime";
export function PwaRuntime() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    let prompt: any;
    let reload = false;
    const install = (event: Event) => {
      event.preventDefault();
      prompt = event;
      window.dispatchEvent(
        new CustomEvent("little-board:pwa", { detail: { install: true } }),
      );
    };
    const requestInstall = async () => {
      if (prompt) {
        await prompt.prompt();
        await prompt.userChoice;
        prompt = undefined;
        window.dispatchEvent(
          new CustomEvent("little-board:pwa", { detail: { install: false } }),
        );
      }
    };
    const update = () => {
      if (registration?.waiting) {
        reload = true;
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };
    const status = () =>
      window.dispatchEvent(
        new CustomEvent("little-board:pwa", {
          detail: {
            install: Boolean(prompt),
            update: Boolean(registration?.waiting),
            offlineReady: Boolean(registration?.active),
          },
        }),
      );
    window.addEventListener("little-board:pwa-status", status);
    const controller = () => {
      if (reload) window.location.reload();
    };
    const sync = () => {
      syncEvent();
      void flushOffline();
    };
    const visible = () => {
      if (!document.hidden) {
        sync();
        void registration?.update();
      }
    };
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, {
          scope: `${basePath}/`,
          updateViaCache: "none",
        })
        .then((value) => {
          registration = value;
          const ready = () => {
            if (value.waiting)
              window.dispatchEvent(
                new CustomEvent("little-board:pwa", {
                  detail: { update: true },
                }),
              );
          };
          ready();
          value.addEventListener("updatefound", () =>
            value.installing?.addEventListener("statechange", ready),
          );
          void navigator.serviceWorker.ready.then(() =>
            window.dispatchEvent(
              new CustomEvent("little-board:pwa", {
                detail: { offlineReady: true },
              }),
            ),
          );
        })
        .catch(() => {});
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("little-board:install", requestInstall);
    window.addEventListener("little-board:update", update);
    window.addEventListener("online", sync);
    window.addEventListener("offline", syncEvent);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    navigator.serviceWorker?.addEventListener("controllerchange", controller);
    const timer = setInterval(() => {
      if (!document.hidden) void flushOffline();
    }, 10000);
    sync();
    return () => {
      window.removeEventListener("little-board:pwa-status", status);
      clearInterval(timer);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("little-board:install", requestInstall);
      window.removeEventListener("little-board:update", update);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", syncEvent);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controller,
      );
    };
  }, []);
  return null;
}
