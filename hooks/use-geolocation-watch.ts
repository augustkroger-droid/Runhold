"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Coordinate } from "@/lib/game/gps/position";

export type GeoReading = {
  position: Coordinate;
  accuracyM: number;
  timestamp: number;
};

const watchOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

export function useGeolocationWatch() {
  const watchIdRef = useRef<number | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatch = useCallback(
    ({
      onReading,
      onError,
    }: {
      onReading: (reading: GeoReading) => void;
      onError: (message: string) => void;
    }) => {
      if (!("geolocation" in navigator)) {
        onError("Din webbläsare saknar stöd för GPS via Geolocation API.");
        return;
      }

      stopWatch();
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          onReading({
            position: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            accuracyM: position.coords.accuracy,
            timestamp: position.timestamp,
          });
        },
        (error) => {
          const message =
            error.code === error.PERMISSION_DENIED
              ? "GPS-behörighet nekades. Tillåt platsåtkomst i webbläsaren och försök igen."
              : error.code === error.TIMEOUT
                ? "GPS tog för lång tid att svara. Gå gärna utomhus och försök igen."
                : "Kunde inte läsa din position just nu.";

          onError(message);
        },
        watchOptions,
      );
    },
    [stopWatch],
  );

  useEffect(() => stopWatch, [stopWatch]);

  return { startWatch, stopWatch };
}
