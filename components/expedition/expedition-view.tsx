"use client";

import { LocateFixed, Radar, Square, Footprints, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GeoReading, useGeolocationWatch } from "@/hooks/use-geolocation-watch";
import { useMapObjects } from "@/hooks/use-map-objects";
import { usePlayerExpeditions } from "@/hooks/use-player-expeditions";
import { usePlayerTech } from "@/hooks/use-player-tech";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { MapLoader } from "@/components/map/map-loader";
import { useI18n } from "@/components/i18n-provider";
import type { Coordinate } from "@/lib/game/gps/position";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import {
  EXPEDITION_CONFIG,
  calculateExpeditionXp,
} from "@/lib/game/systems/expedition";
import { MAP_OBJECT_CONFIG } from "@/lib/game/definitions/map-objects";
import { resourceName } from "@/lib/i18n";

function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceM)} m`;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function positionErrorKey(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "expedition.permissionDenied" as const;
  }

  if (error.code === error.TIMEOUT) {
    return "expedition.timeout" as const;
  }

  return "expedition.positionError" as const;
}

export function ExpeditionView({
  userId,
  onProfileChanged,
}: {
  userId: string;
  onProfileChanged: () => Promise<void>;
}) {
  const { startWatch, stopWatch } = useGeolocationWatch();
  const { language, t } = useI18n();
  const {
    startExpedition: createExpedition,
    completeExpedition,
    starting,
    saving,
    error: saveError,
  } = usePlayerExpeditions(userId);
  const {
    objects: mapObjects,
    scanning,
    error: mapObjectError,
    scanObjects,
    collectObject,
  } = useMapObjects();
  const { unlockedTechIds } = usePlayerTech(userId);
  const [status, setStatus] = useState<"idle" | "locating" | "ready" | "active" | "done">(
    "idle",
  );
  const isActive = status === "active";
  const { status: wakeLockStatus } = useScreenWakeLock(isActive);
  const [start, setStart] = useState<Coordinate | null>(null);
  const [current, setCurrent] = useState<Coordinate | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [lastResult, setLastResult] = useState<{
    distanceM: number;
    durationSeconds: number;
    xpEarned: number;
    resourceHaul: Record<string, number>;
  } | null>(null);
  const [currentHaul, setCurrentHaul] = useState<Record<string, number>>({});

  const lastReadingRef = useRef<Coordinate | null>(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);
  const mapObjectsRef = useRef(mapObjects);
  const collectingObjectIdsRef = useRef<Set<string>>(new Set());
  const expeditionIdRef = useRef<string | null>(null);

  const scannerRadiusM = unlockedTechIds.has("improved_scanner")
    ? 2500
    : EXPEDITION_CONFIG.scannerRadiusM;
  const durationMs = startedAt ? elapsedNow - startedAt : 0;
  const estimatedXp = useMemo(
    () =>
      calculateExpeditionXp({
        distanceM,
        durationSeconds: Math.round(durationMs / 1000),
      }),
    [distanceM, durationMs],
  );

  useEffect(() => {
    mapObjectsRef.current = mapObjects;
  }, [mapObjects]);

  const handleReading = useCallback(
    (reading: GeoReading) => {
      setCurrent(reading.position);
      setAccuracyM(reading.accuracyM);

      if (startedAtRef.current !== null) {
        for (const object of mapObjectsRef.current) {
          if (collectingObjectIdsRef.current.has(object.id)) continue;

          const objectDistanceM = haversineDistanceMeters(
            reading.position,
            object.position,
          );

          if (objectDistanceM <= MAP_OBJECT_CONFIG.collectRadiusM) {
            collectingObjectIdsRef.current.add(object.id);
            const expeditionId = expeditionIdRef.current;
            if (!expeditionId) continue;

            void collectObject({
              objectId: object.id,
              position: reading.position,
              expeditionId,
            })
              .then((collected) => {
                const pickedResourceId = collected.resourceId || object.resourceId;
                const pickedQuantity = collected.quantity || object.quantity;
                setCurrentHaul((current) => ({
                  ...current,
                  [pickedResourceId]: (current[pickedResourceId] ?? 0) + pickedQuantity,
                }));
                setMessage(
                  `+${pickedQuantity} ${resourceName(language, pickedResourceId)}`,
                );
              })
              .catch((error) => {
                setMessage(
                  error instanceof Error ? error.message : t("expedition.pickupError"),
                );
              })
              .finally(() => {
                collectingObjectIdsRef.current.delete(object.id);
              });
          }
        }
      }

      if (reading.accuracyM > EXPEDITION_CONFIG.maxAccurateReadingM) return;

      const previous = lastReadingRef.current;
      lastReadingRef.current = reading.position;

      if (!previous || startedAtRef.current === null) return;

      const delta = haversineDistanceMeters(previous, reading.position);
      if (delta <= 0 || delta > 300) return;

      distanceRef.current += delta;
      setDistanceM(distanceRef.current);
    },
    [collectObject, language, t],
  );

  function clearElapsedTimer() {
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }

  const locate = useCallback(() => {
    setMessage(null);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setStart(point);
        setCurrent(point);
        setAccuracyM(position.coords.accuracy);
        lastReadingRef.current = point;
        setStatus("ready");
        setMessage(t("expedition.positionReady"));
      },
      (error) => {
        setStatus("idle");
        setMessage(t(positionErrorKey(error)));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, [t]);

  const scan = useCallback(async () => {
    if (!current) {
      setMessage(t("expedition.needPosition"));
      return;
    }

    try {
      const scannedObjects = await scanObjects({
        center: current,
        scanRadiusM: scannerRadiusM,
      });
      setScanActive(true);
      setMessage(
        t("expedition.scanActive", {
          radius: formatDistance(scannerRadiusM),
          count: scannedObjects.length,
        }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("expedition.scanError"));
    }
  }, [current, scanObjects, scannerRadiusM, t]);

  const startActiveWatch = useCallback(() => {
    startWatch({
      onReading: handleReading,
      onError: setMessage,
    });
  }, [handleReading, startWatch]);

  const startExpedition = useCallback(async () => {
    if (!current) {
      locate();
      return;
    }

    try {
      const expedition = await createExpedition();
      expeditionIdRef.current = expedition.id;
      setStatus("active");
      setStart(current);
      setDistanceM(0);
      setCurrentHaul({});
      setLastResult(null);
      distanceRef.current = 0;
      lastReadingRef.current = current;
      const now = Date.now();
      setStartedAt(now);
      setElapsedNow(now);
      startedAtRef.current = now;
      clearElapsedTimer();
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedNow(Date.now());
      }, 1000);
      setMessage(t("expedition.started"));

      startActiveWatch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("expedition.saveError"));
    }
  }, [createExpedition, current, locate, startActiveWatch, t]);

  useEffect(() => {
    if (!isActive) return;

    function resumeActiveWatch() {
      if (document.visibilityState !== "visible") return;
      startActiveWatch();
      setElapsedNow(Date.now());
    }

    document.addEventListener("visibilitychange", resumeActiveWatch);
    window.addEventListener("focus", resumeActiveWatch);

    return () => {
      document.removeEventListener("visibilitychange", resumeActiveWatch);
      window.removeEventListener("focus", resumeActiveWatch);
    };
  }, [isActive, startActiveWatch]);

  const stopExpedition = useCallback(async () => {
    stopWatch();
    clearElapsedTimer();
    const endedAt = Date.now();
    const started = startedAtRef.current ?? endedAt;
    const durationSeconds = Math.max(0, Math.round((endedAt - started) / 1000));
    const finalDistanceM = distanceRef.current;
    const expeditionId = expeditionIdRef.current;

    startedAtRef.current = null;
    expeditionIdRef.current = null;
    setStartedAt(null);
    setStatus("done");

    if (!expeditionId) {
      setMessage(t("expedition.saveError"));
      return;
    }

    try {
      const result = await completeExpedition({
        expeditionId,
        distanceM: finalDistanceM,
        durationSeconds,
      });
      setLastResult({
        distanceM: result.expedition.distanceM,
        durationSeconds: result.expedition.durationSeconds,
        xpEarned: result.expedition.xpEarned,
        resourceHaul: result.expedition.resourceHaul,
      });
      setCurrentHaul({});
      setMessage(t("expedition.done", { xp: result.expedition.xpEarned }));
      await onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("expedition.saveError"));
    }
  }, [completeExpedition, onProfileChanged, stopWatch, t]);

  const reset = useCallback(() => {
    stopWatch();
    clearElapsedTimer();
    setStatus("idle");
    setStart(null);
    setCurrent(null);
    setAccuracyM(null);
    setDistanceM(0);
    setStartedAt(null);
    setElapsedNow(Date.now());
    setMessage(null);
    setScanActive(false);
    setLastResult(null);
    setCurrentHaul({});
    lastReadingRef.current = null;
    distanceRef.current = 0;
    startedAtRef.current = null;
    expeditionIdRef.current = null;
  }, [stopWatch]);

  return (
    <section className="grid gap-4">
      <div className="h-[52dvh] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#18232d] shadow-2xl">
        {current ? (
          <MapLoader
            start={start ?? current}
            destination={null}
            current={current}
            canSelectDestination={false}
            showStartRadius={false}
            scanRadiusM={scanActive ? scannerRadiusM : null}
            mapObjects={scanActive ? mapObjects : []}
            onDestinationSelect={() => undefined}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-[#c9d4d0]">
            <div>
              <LocateFixed aria-hidden="true" className="mx-auto text-[#43d9ad]" size={34} />
              <p className="mt-3 font-bold">{t("expedition.findPosition")}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-[#18232d] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            {t("expedition.distance")}
          </p>
          <p className="mt-1 text-xl font-black text-white">{formatDistance(distanceM)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#18232d] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            {t("expedition.time")}
          </p>
          <p className="mt-1 text-xl font-black text-white">{formatElapsed(durationMs)}</p>
        </div>
        <div className="rounded-lg border border-[#f5b84b]/30 bg-[#2b2414] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f5b84b]">
            XP
          </p>
          <p className="mt-1 text-xl font-black text-white">{estimatedXp}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black text-white">
            <Footprints aria-hidden="true" size={19} />
            {t("expedition.title")}
          </div>
          <span className="text-sm font-bold text-[#aeb9b6]">
            {wakeLockStatus === "active" ? `${t("expedition.awake")} · ` : ""}
            GPS {accuracyM ? `${Math.round(accuracyM)} m` : "--"}
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          {status === "idle" || status === "locating" ? (
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#315f36] px-4 font-black text-white disabled:cursor-wait disabled:opacity-60"
              disabled={status === "locating"}
              onClick={locate}
            >
              <LocateFixed aria-hidden="true" size={19} />
              {status === "locating" ? t("expedition.locating") : t("expedition.locate")}
            </button>
          ) : null}

          {status === "ready" || status === "done" ? (
            <>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[#43d9ad]/50 bg-[#16342d] px-4 font-black text-[#d7fff0]"
                onClick={scan}
                disabled={scanning}
              >
                <Radar aria-hidden="true" size={19} />
                {scanning ? t("expedition.scanning") : t("expedition.scan")}
              </button>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#43d9ad] px-4 font-black text-[#07110d]"
                onClick={startExpedition}
                disabled={starting}
              >
                <Play aria-hidden="true" size={21} />
                {t("expedition.start")}
              </button>
            </>
          ) : null}

          {status === "active" ? (
            <button
              type="button"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#5f2f2f] px-4 font-black text-white disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              onClick={stopExpedition}
            >
              <Square aria-hidden="true" size={19} />
              {t("expedition.stop")}
            </button>
          ) : null}

          {status === "done" ? (
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#22303b] px-4 font-black text-white"
              onClick={reset}
            >
              {t("expedition.new")}
            </button>
          ) : null}
        </div>
      </div>

      {lastResult ? (
        <section className="rounded-lg border border-[#43d9ad]/30 bg-[#14342d] p-4">
          <h2 className="text-lg font-black text-white">{t("expedition.result")}</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">{t("expedition.distance")}</dt>
              <dd className="mt-1 font-black text-white">
                {formatDistance(lastResult.distanceM)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">{t("expedition.time")}</dt>
              <dd className="mt-1 font-black text-white">
                {formatElapsed(lastResult.durationSeconds * 1000)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">XP</dt>
              <dd className="mt-1 font-black text-white">+{lastResult.xpEarned}</dd>
            </div>
          </dl>
          <div className="mt-3 rounded-md bg-[#0f211c] p-3">
            <h3 className="font-black text-white">{t("expedition.haul")}</h3>
            {Object.keys(lastResult.resourceHaul).length > 0 ? (
              <div className="mt-2 grid gap-2">
                {Object.entries(lastResult.resourceHaul).map(([resourceId, quantity]) => (
                  <div
                    key={resourceId}
                    className="flex items-center justify-between text-sm font-bold text-[#c9d4d0]"
                  >
                    <span>{resourceName(language, resourceId)}</span>
                    <span className="text-white">+{quantity}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#a9cfc3]">{t("expedition.noHaul")}</p>
            )}
          </div>
        </section>
      ) : null}

      {status === "active" && Object.keys(currentHaul).length > 0 ? (
        <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
          <h2 className="font-black text-white">{t("expedition.haul")}</h2>
          <div className="mt-2 grid gap-2">
            {Object.entries(currentHaul).map(([resourceId, quantity]) => (
              <div
                key={resourceId}
                className="flex items-center justify-between text-sm font-bold text-[#c9d4d0]"
              >
                <span>{resourceName(language, resourceId)}</span>
                <span className="text-white">+{quantity}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {message || saveError || mapObjectError ? (
        <p className="rounded-md bg-[#22303b] p-3 text-sm leading-6 text-[#d7e1dd]">
          {message ?? saveError ?? mapObjectError}
        </p>
      ) : null}
    </section>
  );
}
