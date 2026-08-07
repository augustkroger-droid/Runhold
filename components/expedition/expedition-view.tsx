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
import type { ExpeditionRoutePoint } from "@/lib/game/state/player-expeditions";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import {
  EXPEDITION_CONFIG,
  calculateExpeditionXp,
} from "@/lib/game/systems/expedition";
import { MAP_OBJECT_CONFIG } from "@/lib/game/definitions/map-objects";
import { itemName, resourceName } from "@/lib/i18n";

const DEFAULT_MAP_CENTER: Coordinate = { lat: 57.7815, lng: 14.1562 };
const MAP_CENTER_STORAGE_KEY = "runhold.expedition.mapCenter";

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

function formatPace(distanceM: number, durationSeconds: number): string {
  if (distanceM < 100 || durationSeconds <= 0) return "--";

  const totalSecondsPerKm = Math.round(durationSeconds / (distanceM / 1000));
  const minutes = Math.floor(totalSecondsPerKm / 60);
  const seconds = totalSecondsPerKm % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

function movementThresholdM(accuracyM: number, baseThresholdM: number): number {
  return Math.max(baseThresholdM, Math.min(accuracyM * 0.35, 22));
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

function loadStoredMapCenter(): Coordinate {
  if (typeof window === "undefined") return DEFAULT_MAP_CENTER;

  const storedCenter = window.localStorage.getItem(MAP_CENTER_STORAGE_KEY);
  if (!storedCenter) return DEFAULT_MAP_CENTER;

  try {
    const parsed = JSON.parse(storedCenter) as Partial<Coordinate>;
    if (
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    return DEFAULT_MAP_CENTER;
  }

  return DEFAULT_MAP_CENTER;
}

function formatExpeditionDate(value: string | null, language: string): string {
  if (!value) return "";

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ExpeditionView({
  userId,
  onProfileChanged,
  onActiveChange,
  onExpeditionFinished,
  visible,
  hidden = false,
}: {
  userId: string;
  onProfileChanged: () => Promise<void>;
  onActiveChange?: (active: boolean) => void;
  onExpeditionFinished?: () => void;
  visible: boolean;
  hidden?: boolean;
}) {
  const { startWatch, stopWatch } = useGeolocationWatch();
  const { language, t } = useI18n();
  const {
    startExpedition: createExpedition,
    completeExpedition,
    starting,
    saving,
    loadingHistory,
    history,
    loadHistory,
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
  const [mapCenter, setMapCenter] = useState<Coordinate>(() => loadStoredMapCenter());
  const [showResultSummary, setShowResultSummary] = useState(false);
  const [lastResult, setLastResult] = useState<{
    distanceM: number;
    durationSeconds: number;
    xpEarned: number;
    resourceHaul: Record<string, number>;
    itemHaul: Record<string, number>;
    routePoints: ExpeditionRoutePoint[];
  } | null>(null);
  const [currentHaul, setCurrentHaul] = useState<Record<string, number>>({});
  const [currentItemHaul, setCurrentItemHaul] = useState<Record<string, number>>({});
  const [routePoints, setRoutePoints] = useState<ExpeditionRoutePoint[]>([]);

  const lastReadingRef = useRef<Coordinate | null>(null);
  const lastDisplayPositionRef = useRef<Coordinate | null>(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);
  const mapObjectsRef = useRef(mapObjects);
  const collectingObjectIdsRef = useRef<Set<string>>(new Set());
  const expeditionIdRef = useRef<string | null>(null);
  const routePointsRef = useRef<ExpeditionRoutePoint[]>([]);
  const autoScanInFlightRef = useRef(false);
  const lastAutoScanAtRef = useRef(0);
  const autoLocatedRef = useRef(false);

  const scannerRadiusM = unlockedTechIds.has("improved_scanner")
    ? 2500
    : EXPEDITION_CONFIG.scannerRadiusM;
  const durationMs = startedAt ? elapsedNow - startedAt : 0;
  const durationSeconds = Math.round(durationMs / 1000);
  const estimatedXp = useMemo(
    () =>
      calculateExpeditionXp({
        distanceM,
        durationSeconds,
      }),
    [distanceM, durationSeconds],
  );
  const currentPace = formatPace(distanceM, durationSeconds);

  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  useEffect(() => {
    mapObjectsRef.current = mapObjects;
  }, [mapObjects]);

  useEffect(() => {
    void loadHistory().catch(() => undefined);
  }, [loadHistory]);

  const saveViewedMapCenter = useCallback((center: Coordinate) => {
    setMapCenter(center);
    window.localStorage.setItem(MAP_CENTER_STORAGE_KEY, JSON.stringify(center));
  }, []);

  const appendRoutePoint = useCallback((reading: GeoReading) => {
    if (reading.accuracyM > EXPEDITION_CONFIG.maxAccurateReadingM) return;

    const point: ExpeditionRoutePoint = {
      lat: reading.position.lat,
      lng: reading.position.lng,
      timestamp: reading.timestamp,
      accuracyM: reading.accuracyM,
    };
    const previousPoint = routePointsRef.current.at(-1);

    if (
      previousPoint &&
      haversineDistanceMeters(previousPoint, reading.position) <
        movementThresholdM(
          reading.accuracyM,
          EXPEDITION_CONFIG.minRoutePointDistanceM,
        )
    ) {
      return;
    }

    const nextPoints = [...routePointsRef.current, point].slice(-5000);
    routePointsRef.current = nextPoints;
    setRoutePoints(nextPoints);
  }, []);

  const handleReading = useCallback(
    (reading: GeoReading) => {
      setAccuracyM(reading.accuracyM);
      const previousDisplayPosition = lastDisplayPositionRef.current;
      const displayDeltaM = previousDisplayPosition
        ? haversineDistanceMeters(previousDisplayPosition, reading.position)
        : Number.POSITIVE_INFINITY;

      if (
        !previousDisplayPosition ||
        displayDeltaM >= movementThresholdM(reading.accuracyM, EXPEDITION_CONFIG.minMovementM)
      ) {
        lastDisplayPositionRef.current = reading.position;
        setCurrent(reading.position);
      }

      if (startedAtRef.current !== null) {
        appendRoutePoint(reading);

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
                const pickedItemId = collected.itemId;
                const pickedItemQuantity = collected.itemQuantity;

                if (pickedResourceId && pickedQuantity > 0) {
                  setCurrentHaul((current) => ({
                    ...current,
                    [pickedResourceId]:
                      (current[pickedResourceId] ?? 0) + pickedQuantity,
                  }));
                  setMessage(
                    `+${pickedQuantity} ${resourceName(language, pickedResourceId)}`,
                  );
                }

                if (pickedItemId && pickedItemQuantity > 0) {
                  setCurrentItemHaul((current) => ({
                    ...current,
                    [pickedItemId]: (current[pickedItemId] ?? 0) + pickedItemQuantity,
                  }));
                  setMessage(
                    `+${pickedItemQuantity} ${itemName(language, pickedItemId)}`,
                  );
                }
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
      if (
        delta < movementThresholdM(reading.accuracyM, EXPEDITION_CONFIG.minMovementM) ||
        delta > 300
      ) {
        return;
      }

      distanceRef.current += delta;
      setDistanceM(distanceRef.current);
    },
    [appendRoutePoint, collectObject, language, t],
  );

  function clearElapsedTimer() {
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }

  const locate = useCallback(({ silent = false }: { silent?: boolean } = {}) => {
    if (!("geolocation" in navigator)) {
      setMessage(t("expedition.positionError"));
      return;
    }

    if (!silent) {
      setMessage(null);
    }
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setStart(point);
        setCurrent(point);
        setMapCenter(point);
        window.localStorage.setItem(MAP_CENTER_STORAGE_KEY, JSON.stringify(point));
        setAccuracyM(position.coords.accuracy);
        lastReadingRef.current = point;
        lastDisplayPositionRef.current = point;
        setStatus("ready");
        if (!silent) {
          setMessage(t("expedition.positionReady"));
        }
      },
      (error) => {
        setStatus("idle");
        setMessage(t(positionErrorKey(error)));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, [t]);

  useEffect(() => {
    if (!visible || isActive || autoLocatedRef.current || status !== "idle") return;

    autoLocatedRef.current = true;
    locate({ silent: true });
  }, [isActive, locate, status, visible]);

  const runScan = useCallback(
    async (center: Coordinate, { silent = false }: { silent?: boolean } = {}) => {
      try {
        const scannedObjects = await scanObjects({
          center,
          scanRadiusM: scannerRadiusM,
        });
        setScanActive(true);

        if (!silent) {
          setMessage(
            t("expedition.scanActive", {
              radius: formatDistance(scannerRadiusM),
              count: scannedObjects.length,
            }),
          );
        }

        return scannedObjects;
      } catch (error) {
        if (!silent) {
          setMessage(
            error instanceof Error ? error.message : t("expedition.scanError"),
          );
        }

        throw error;
      }
    },
    [scanObjects, scannerRadiusM, t],
  );

  const scan = useCallback(async () => {
    if (!current) {
      setMessage(t("expedition.needPosition"));
      return;
    }

    await runScan(current, { silent: false }).catch(() => undefined);
  }, [current, runScan, t]);

  useEffect(() => {
    if (!current || (!visible && !isActive) || (status !== "ready" && status !== "active")) {
      return;
    }

    let cancelled = false;

    async function autoScan() {
      if (!current || autoScanInFlightRef.current) return;

      const now = Date.now();
      if (now - lastAutoScanAtRef.current < 30_000) return;

      autoScanInFlightRef.current = true;
      lastAutoScanAtRef.current = now;

      try {
        await runScan(current, { silent: true });
      } catch {
        // Manual scan still surfaces errors; auto scan stays quiet.
      } finally {
        if (!cancelled) {
          autoScanInFlightRef.current = false;
        }
      }
    }

    void autoScan();
    const intervalId = window.setInterval(() => {
      void autoScan();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      autoScanInFlightRef.current = false;
    };
  }, [current, isActive, runScan, status, visible]);

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
      setCurrentItemHaul({});
      setLastResult(null);
      setShowResultSummary(false);
      distanceRef.current = 0;
      lastReadingRef.current = current;
      lastDisplayPositionRef.current = current;
      const now = Date.now();
      const initialRoutePoint = {
        lat: current.lat,
        lng: current.lng,
        timestamp: now,
        accuracyM: accuracyM ?? 0,
      };
      routePointsRef.current = [initialRoutePoint];
      setRoutePoints([initialRoutePoint]);
      setStartedAt(now);
      setElapsedNow(now);
      startedAtRef.current = now;
      clearElapsedTimer();
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedNow(Date.now());
      }, 1000);
      setMessage(t("expedition.started"));
      void runScan(current, { silent: true }).catch(() => undefined);

      startActiveWatch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("expedition.saveError"));
    }
  }, [accuracyM, createExpedition, current, locate, runScan, startActiveWatch, t]);

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
        routePoints: routePointsRef.current,
      });
      setLastResult({
        distanceM: result.expedition.distanceM,
        durationSeconds: result.expedition.durationSeconds,
        xpEarned: result.expedition.xpEarned,
        resourceHaul: result.expedition.resourceHaul,
        itemHaul: result.expedition.itemHaul,
        routePoints: result.expedition.routePoints,
      });
      setCurrentHaul({});
      setCurrentItemHaul({});
      setRoutePoints(result.expedition.routePoints);
      setShowResultSummary(true);
      onExpeditionFinished?.();
      setMessage(t("expedition.done", { xp: result.expedition.xpEarned }));
      await onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("expedition.saveError"));
    }
  }, [completeExpedition, onExpeditionFinished, onProfileChanged, stopWatch, t]);

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
    setShowResultSummary(false);
    setLastResult(null);
    setCurrentHaul({});
    setCurrentItemHaul({});
    setRoutePoints([]);
    lastReadingRef.current = null;
    lastDisplayPositionRef.current = null;
    distanceRef.current = 0;
    startedAtRef.current = null;
    expeditionIdRef.current = null;
    routePointsRef.current = [];
  }, [stopWatch]);

  if (hidden) {
    return <section className="hidden" aria-hidden="true" />;
  }

  if (isActive) {
    return (
      <section className="fixed inset-0 z-[1200] overflow-hidden bg-[#071018]">
        <div className="h-dvh w-full">
          {current ? (
            <MapLoader
              start={start ?? current}
              destination={null}
              current={current}
              canSelectDestination={false}
              showStartRadius={false}
              scanRadiusM={scanActive ? scannerRadiusM : null}
              mapObjects={scanActive ? mapObjects : []}
              routePoints={routePoints}
              centerLabel={t("expedition.centerMap")}
              centerControlClassName="bottom-44 right-4"
              onViewChange={saveViewedMapCenter}
              onDestinationSelect={() => undefined}
            />
          ) : null}
        </div>

        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1300] grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-white/10 bg-[#071018]/88 p-2 backdrop-blur">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#aeb9b6]">
              {t("expedition.distance")}
            </p>
            <p className="text-base font-black text-white">{formatDistance(distanceM)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#071018]/88 p-2 backdrop-blur">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#aeb9b6]">
              {t("expedition.time")}
            </p>
            <p className="text-base font-black text-white">{formatElapsed(durationMs)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#071018]/88 p-2 backdrop-blur">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#aeb9b6]">
              {t("expedition.pace")}
            </p>
            <p className="text-base font-black text-white">{currentPace}</p>
          </div>
          <div className="rounded-lg border border-[#f5b84b]/30 bg-[#2b2414]/90 p-2 backdrop-blur">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#f5b84b]">
              XP
            </p>
            <p className="text-base font-black text-white">{estimatedXp}</p>
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-[max(0.8rem,env(safe-area-inset-bottom))] z-[1300] rounded-lg border border-white/10 bg-[#071018]/90 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold text-[#aeb9b6]">
            <span>
              {wakeLockStatus === "active" ? `${t("expedition.awake")} · ` : ""}
              GPS {accuracyM ? `${Math.round(accuracyM)} m` : "--"}
            </span>
            <button
              type="button"
              className="rounded-md border border-[#43d9ad]/40 px-3 py-2 font-black text-[#d7fff0]"
              onClick={scan}
              disabled={scanning}
            >
              {scanning ? t("expedition.scanning") : t("expedition.scan")}
            </button>
          </div>

          {Object.keys(currentHaul).length > 0 || Object.keys(currentItemHaul).length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(currentHaul).map(([resourceId, quantity]) => (
                <span
                  key={resourceId}
                  className="rounded-full bg-[#14342d] px-3 py-1 text-sm font-black text-[#d7fff0]"
                >
                  +{quantity} {resourceName(language, resourceId)}
                </span>
              ))}
              {Object.entries(currentItemHaul).map(([itemId, quantity]) => (
                <span
                  key={itemId}
                  className="rounded-full bg-[#2b2414] px-3 py-1 text-sm font-black text-[#ffe5ad]"
                >
                  +{quantity} {itemName(language, itemId)}
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#5f2f2f] px-4 font-black text-white disabled:cursor-wait disabled:opacity-60"
            disabled={saving}
            onClick={stopExpedition}
          >
            <Square aria-hidden="true" size={19} />
            {t("expedition.stop")}
          </button>
          {message || saveError || mapObjectError ? (
            <p className="mt-3 text-sm leading-6 text-[#d7e1dd]">
              {message ?? saveError ?? mapObjectError}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      {showResultSummary && lastResult ? (
        <div className="fixed inset-0 z-[1400] grid place-items-end bg-black/58 p-3 backdrop-blur-sm">
          <section className="w-full rounded-lg border border-[#43d9ad]/30 bg-[#101820] p-4 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#43d9ad]">
              {t("expedition.summary")}
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {t("expedition.result")}
            </h2>

            <dl className="mt-4 grid grid-cols-4 gap-2 text-sm">
              <div className="rounded-md bg-[#18232d] p-3">
                <dt className="text-[#a9cfc3]">{t("expedition.distance")}</dt>
                <dd className="mt-1 font-black text-white">
                  {formatDistance(lastResult.distanceM)}
                </dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-3">
                <dt className="text-[#a9cfc3]">{t("expedition.time")}</dt>
                <dd className="mt-1 font-black text-white">
                  {formatElapsed(lastResult.durationSeconds * 1000)}
                </dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-3">
                <dt className="text-[#a9cfc3]">{t("expedition.pace")}</dt>
                <dd className="mt-1 font-black text-white">
                  {formatPace(lastResult.distanceM, lastResult.durationSeconds)}
                </dd>
              </div>
              <div className="rounded-md bg-[#2b2414] p-3">
                <dt className="text-[#f5b84b]">XP</dt>
                <dd className="mt-1 font-black text-white">+{lastResult.xpEarned}</dd>
              </div>
            </dl>

            <div className="mt-3 grid gap-2">
              {Object.keys(lastResult.resourceHaul).length > 0 ? (
                <div className="rounded-md bg-[#18232d] p-3">
                  <h3 className="font-black text-white">{t("expedition.haul")}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(lastResult.resourceHaul).map(
                      ([resourceId, quantity]) => (
                        <span
                          key={resourceId}
                          className="rounded-full bg-[#14342d] px-3 py-1 text-sm font-black text-[#d7fff0]"
                        >
                          +{quantity} {resourceName(language, resourceId)}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {Object.keys(lastResult.itemHaul).length > 0 ? (
                <div className="rounded-md bg-[#18232d] p-3">
                  <h3 className="font-black text-white">{t("expedition.items")}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(lastResult.itemHaul).map(([itemId, quantity]) => (
                      <span
                        key={itemId}
                        className="rounded-full bg-[#2b2414] px-3 py-1 text-sm font-black text-[#ffe5ad]"
                      >
                        +{quantity} {itemName(language, itemId)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="mt-4 min-h-12 w-full rounded-md bg-[#43d9ad] px-4 font-black text-[#07110d]"
              onClick={() => setShowResultSummary(false)}
            >
              {t("common.done")}
            </button>
          </section>
        </div>
      ) : null}

      <div className="h-[52dvh] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#18232d] shadow-2xl">
        <MapLoader
          start={start ?? current ?? mapCenter}
          destination={null}
          current={current}
          canSelectDestination={false}
          showStartRadius={false}
          scanRadiusM={scanActive ? scannerRadiusM : null}
          mapObjects={scanActive ? mapObjects : []}
          routePoints={lastResult?.routePoints ?? routePoints}
          centerLabel={t("expedition.centerMap")}
          onViewChange={saveViewedMapCenter}
          onDestinationSelect={() => undefined}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
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
        <div className="rounded-lg border border-white/10 bg-[#18232d] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            {t("expedition.pace")}
          </p>
          <p className="mt-1 text-lg font-black text-white">{currentPace}</p>
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
              onClick={() => locate()}
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
          <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
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
              <dt className="text-[#a9cfc3]">{t("expedition.pace")}</dt>
              <dd className="mt-1 font-black text-white">
                {formatPace(lastResult.distanceM, lastResult.durationSeconds)}
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
          {Object.keys(lastResult.itemHaul).length > 0 ? (
            <div className="mt-3 rounded-md bg-[#0f211c] p-3">
              <h3 className="font-black text-white">{t("expedition.items")}</h3>
              <div className="mt-2 grid gap-2">
                {Object.entries(lastResult.itemHaul).map(([itemId, quantity]) => (
                  <div
                    key={itemId}
                    className="flex items-center justify-between text-sm font-bold text-[#c9d4d0]"
                  >
                    <span>{itemName(language, itemId)}</span>
                    <span className="text-white">+{quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {message || saveError || mapObjectError ? (
        <p className="rounded-md bg-[#22303b] p-3 text-sm leading-6 text-[#d7e1dd]">
          {message ?? saveError ?? mapObjectError}
        </p>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-white">{t("expedition.history")}</h2>
          {loadingHistory ? (
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
              {t("common.loading")}
            </span>
          ) : null}
        </div>

        {history.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {history.map((expedition) => (
              <article
                key={expedition.id}
                className="rounded-md border border-white/10 bg-[#101820] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#aeb9b6]">
                      {formatExpeditionDate(expedition.endedAt, language)}
                    </p>
                    <h3 className="mt-1 font-black text-white">
                      {formatDistance(expedition.distanceM)}
                    </h3>
                  </div>
                  <div className="rounded-md bg-[#2b2414] px-3 py-2 text-right">
                    <p className="text-xs font-black text-[#f5b84b]">XP</p>
                    <p className="font-black text-white">+{expedition.xpEarned}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-md bg-[#18232d] p-2">
                    <dt className="text-[#a9cfc3]">{t("expedition.time")}</dt>
                    <dd className="font-black text-white">
                      {formatElapsed(expedition.durationSeconds * 1000)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-[#18232d] p-2">
                    <dt className="text-[#a9cfc3]">{t("expedition.pace")}</dt>
                    <dd className="font-black text-white">
                      {formatPace(expedition.distanceM, expedition.durationSeconds)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-[#18232d] p-2">
                    <dt className="text-[#a9cfc3]">{t("expedition.routePoints")}</dt>
                    <dd className="font-black text-white">
                      {expedition.routePoints.length}
                    </dd>
                  </div>
                </dl>

                {Object.keys(expedition.resourceHaul).length > 0 ||
                Object.keys(expedition.itemHaul).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(expedition.resourceHaul).map(
                      ([resourceId, quantity]) => (
                        <span
                          key={resourceId}
                          className="rounded-full bg-[#14342d] px-3 py-1 text-xs font-black text-[#d7fff0]"
                        >
                          +{quantity} {resourceName(language, resourceId)}
                        </span>
                      ),
                    )}
                    {Object.entries(expedition.itemHaul).map(([itemId, quantity]) => (
                      <span
                        key={itemId}
                        className="rounded-full bg-[#2b2414] px-3 py-1 text-xs font-black text-[#ffe5ad]"
                      >
                        +{quantity} {itemName(language, itemId)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-[#101820] p-3 text-sm text-[#aeb9b6]">
            {t("expedition.historyEmpty")}
          </p>
        )}
      </section>
    </section>
  );
}
