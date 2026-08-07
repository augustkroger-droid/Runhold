"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScreenWakeLockStatus = "inactive" | "active" | "released" | "unsupported" | "error";

export function useScreenWakeLock(enabled: boolean) {
  const [status, setStatus] = useState<ScreenWakeLockStatus>("inactive");
  const enabledRef = useRef(enabled);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const releaseHandlerRef = useRef<EventListener | null>(null);

  const detachReleaseHandler = useCallback(() => {
    if (sentinelRef.current && releaseHandlerRef.current) {
      sentinelRef.current.removeEventListener("release", releaseHandlerRef.current);
    }

    releaseHandlerRef.current = null;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = sentinelRef.current;
    detachReleaseHandler();
    sentinelRef.current = null;

    if (sentinel && !sentinel.released) {
      await sentinel.release().catch(() => undefined);
    }

    setStatus("inactive");
  }, [detachReleaseHandler]);

  const requestWakeLock = useCallback(async () => {
    if (!enabledRef.current) return;

    if (!("wakeLock" in navigator) || !navigator.wakeLock) {
      setStatus("unsupported");
      return;
    }

    if (document.visibilityState !== "visible") {
      setStatus("released");
      return;
    }

    if (sentinelRef.current && !sentinelRef.current.released) {
      setStatus("active");
      return;
    }

    try {
      detachReleaseHandler();

      const sentinel = await navigator.wakeLock.request("screen");
      const handleRelease: EventListener = () => {
        sentinelRef.current = null;
        releaseHandlerRef.current = null;
        setStatus(enabledRef.current ? "released" : "inactive");
      };

      sentinel.addEventListener("release", handleRelease);
      sentinelRef.current = sentinel;
      releaseHandlerRef.current = handleRelease;
      setStatus("active");
    } catch {
      setStatus("error");
    }
  }, [detachReleaseHandler]);

  useEffect(() => {
    enabledRef.current = enabled;

    const timeoutId = window.setTimeout(() => {
      if (enabledRef.current) {
        void requestWakeLock();
        return;
      }

      void releaseWakeLock();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (!enabledRef.current) return;

      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        setStatus("released");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [requestWakeLock]);

  useEffect(() => {
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  return { status };
}
