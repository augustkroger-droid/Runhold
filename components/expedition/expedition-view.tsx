"use client";

import { LocateFixed, Radar, Square, Footprints, Play } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { type GeoReading, useGeolocationWatch } from "@/hooks/use-geolocation-watch";
import { usePlayerExpeditions } from "@/hooks/use-player-expeditions";
import { usePlayerTech } from "@/hooks/use-player-tech";
import { MapLoader } from "@/components/map/map-loader";
import type { Coordinate } from "@/lib/game/gps/position";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import {
  EXPEDITION_CONFIG,
  calculateExpeditionXp,
} from "@/lib/game/systems/expedition";

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

function positionErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "GPS-behörighet nekades.";
  }

  if (error.code === error.TIMEOUT) {
    return "Det tog för lång tid att hitta positionen.";
  }

  return "Kunde inte hitta positionen.";
}

export function ExpeditionView({
  userId,
  onProfileChanged,
}: {
  userId: string;
  onProfileChanged: () => Promise<void>;
}) {
  const { startWatch, stopWatch } = useGeolocationWatch();
  const { completeExpedition, saving, error: saveError } = usePlayerExpeditions(userId);
  const { unlockedTechIds } = usePlayerTech(userId);
  const [status, setStatus] = useState<"idle" | "locating" | "ready" | "active" | "done">(
    "idle",
  );
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
  } | null>(null);

  const lastReadingRef = useRef<Coordinate | null>(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);

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

  const handleReading = useCallback((reading: GeoReading) => {
    setCurrent(reading.position);
    setAccuracyM(reading.accuracyM);

    if (reading.accuracyM > EXPEDITION_CONFIG.maxAccurateReadingM) return;

    const previous = lastReadingRef.current;
    lastReadingRef.current = reading.position;

    if (!previous || startedAtRef.current === null) return;

    const delta = haversineDistanceMeters(previous, reading.position);
    if (delta <= 0 || delta > 300) return;

    distanceRef.current += delta;
    setDistanceM(distanceRef.current);
  }, []);

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
        setMessage("Position hittad. Du kan scanna området eller starta expeditionen.");
      },
      (error) => {
        setStatus("idle");
        setMessage(positionErrorMessage(error));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, []);

  const scan = useCallback(() => {
    if (!current) {
      setMessage("Hämta position först.");
      return;
    }

    setScanActive(true);
    setMessage(`Scanner aktiv: ${formatDistance(scannerRadiusM)} radie.`);
  }, [current, scannerRadiusM]);

  const startExpedition = useCallback(() => {
    if (!current) {
      locate();
      return;
    }

    setStatus("active");
    setStart(current);
    setDistanceM(0);
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
    setMessage("Expeditionen är igång.");

    startWatch({
      onReading: handleReading,
      onError: setMessage,
    });
  }, [current, handleReading, locate, startWatch]);

  const stopExpedition = useCallback(async () => {
    stopWatch();
    clearElapsedTimer();
    const endedAt = Date.now();
    const started = startedAtRef.current ?? endedAt;
    const durationSeconds = Math.max(0, Math.round((endedAt - started) / 1000));
    const finalDistanceM = distanceRef.current;

    startedAtRef.current = null;
    setStartedAt(null);
    setStatus("done");

    try {
      const result = await completeExpedition({
        distanceM: finalDistanceM,
        durationSeconds,
      });
      setLastResult({
        distanceM: result.expedition.distanceM,
        durationSeconds: result.expedition.durationSeconds,
        xpEarned: result.expedition.xpEarned,
      });
      setMessage(`Expedition avslutad. +${result.expedition.xpEarned} XP.`);
      await onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Expeditionen kunde inte sparas.");
    }
  }, [completeExpedition, onProfileChanged, stopWatch]);

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
    lastReadingRef.current = null;
    distanceRef.current = 0;
    startedAtRef.current = null;
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
            onDestinationSelect={() => undefined}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-[#c9d4d0]">
            <div>
              <LocateFixed aria-hidden="true" className="mx-auto text-[#43d9ad]" size={34} />
              <p className="mt-3 font-bold">Hämta position för att öppna kartan.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-[#18232d] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            Distans
          </p>
          <p className="mt-1 text-xl font-black text-white">{formatDistance(distanceM)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#18232d] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            Tid
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
            Expedition
          </div>
          <span className="text-sm font-bold text-[#aeb9b6]">
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
              {status === "locating" ? "Hämtar position..." : "Hämta position"}
            </button>
          ) : null}

          {status === "ready" || status === "done" ? (
            <>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[#43d9ad]/50 bg-[#16342d] px-4 font-black text-[#d7fff0]"
                onClick={scan}
              >
                <Radar aria-hidden="true" size={19} />
                Scanna område
              </button>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#43d9ad] px-4 font-black text-[#07110d]"
                onClick={startExpedition}
              >
                <Play aria-hidden="true" size={21} />
                Starta expedition
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
              Avsluta expedition
            </button>
          ) : null}

          {status === "done" ? (
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#22303b] px-4 font-black text-white"
              onClick={reset}
            >
              Ny expedition
            </button>
          ) : null}
        </div>
      </div>

      {lastResult ? (
        <section className="rounded-lg border border-[#43d9ad]/30 bg-[#14342d] p-4">
          <h2 className="text-lg font-black text-white">Resultat</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Distans</dt>
              <dd className="mt-1 font-black text-white">
                {formatDistance(lastResult.distanceM)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Tid</dt>
              <dd className="mt-1 font-black text-white">
                {formatElapsed(lastResult.durationSeconds * 1000)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">XP</dt>
              <dd className="mt-1 font-black text-white">+{lastResult.xpEarned}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {message || saveError ? (
        <p className="rounded-md bg-[#22303b] p-3 text-sm leading-6 text-[#d7e1dd]">
          {message ?? saveError}
        </p>
      ) : null}
    </section>
  );
}
