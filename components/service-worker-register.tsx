"use client";

import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function ServiceWorkerRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstallCard, setShowInstallCard] = useState(false);
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  });
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("runhold-install-dismissed") === "true";
  });

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure should not block the GPS test.
      });
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!dismissed) {
        setShowInstallCard(true);
      }
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    const timer = window.setTimeout(() => {
      if (!dismissed) {
        setShowInstallCard(true);
      }
    }, 2_400);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.clearTimeout(timer);
    };
  }, [dismissed]);

  if (isStandalone || dismissed || !showInstallCard) {
    return null;
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-md rounded-lg border border-[#43d9ad]/40 bg-[#111b22]/95 p-4 text-white shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#43d9ad] text-[#07110d]">
          <Smartphone aria-hidden="true" size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black">Lägg Runhold på hemskärmen</h2>
          <p className="mt-1 text-sm leading-5 text-[#c9d4d0]">
            Installera som PWA för snabb åtkomst när du är ute. På iPhone: använd
            Dela-knappen och välj Lägg till på hemskärmen.
          </p>
        </div>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white"
          aria-label="Stäng installationsrutan"
          onClick={() => {
            window.localStorage.setItem("runhold-install-dismissed", "true");
            setDismissed(true);
          }}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {installPrompt ? (
        <button
          type="button"
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#43d9ad] px-4 font-black text-[#07110d]"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
            setShowInstallCard(false);
          }}
        >
          <Download aria-hidden="true" size={18} />
          Installera appen
        </button>
      ) : null}
    </aside>
  );
}
