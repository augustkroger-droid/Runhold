"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Info, Satellite } from "lucide-react";
import { LocationPermissionCard } from "@/components/location-permission-card";
import { MapLoader } from "@/components/map/map-loader";
import { MissionControls } from "@/components/mission-controls";
import { MissionStatusPanel } from "@/components/mission-status";
import { PingOverlay } from "@/components/ping-overlay";
import { useAnonymousSession } from "@/hooks/use-anonymous-session";
import { type GeoReading, useGeolocationWatch } from "@/hooks/use-geolocation-watch";
import { useMissionPersistence } from "@/hooks/use-mission";
import { destinationPoint } from "@/lib/geo/destination-point";
import {
  haversineDistanceMeters,
  updateReachStreak,
} from "@/lib/geo/haversine";
import type { Coordinate, MissionStatus } from "@/lib/types/mission";

const REACH_RADIUS_M = 20;
const MAX_PING_ACCURACY_M = 40;

function formatDuration(from: number | null, to: number | null): string {
  if (!from || !to || to < from) return "--";
  const totalSeconds = Math.round((to - from) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

function errorFromPositionError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "GPS-behörighet nekades. Tillåt platsåtkomst och försök igen.";
  }

  if (error.code === error.TIMEOUT) {
    return "Det tog för lång tid att hitta positionen. Testa utomhus med fri sikt.";
  }

  return "Kunde inte hitta din position just nu.";
}

export function MissionApp() {
  const { userId, loading: sessionLoading, error: sessionError } = useAnonymousSession();
  const { createMission, updateMission } = useMissionPersistence(userId);
  const { startWatch, stopWatch } = useGeolocationWatch();

  const [status, setStatus] = useState<MissionStatus>("idle");
  const [start, setStart] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [current, setCurrent] = useState<Coordinate | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [destinationReachedAt, setDestinationReachedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [destinationPingAccuracyM, setDestinationPingAccuracyM] = useState<number | null>(null);
  const [returnPingAccuracyM, setReturnPingAccuracyM] = useState<number | null>(null);

  const statusRef = useRef(status);
  const startRef = useRef(start);
  const destinationRef = useRef(destination);
  const missionIdRef = useRef(missionId);
  const outboundStreakRef = useRef(0);
  const returnStreakRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    missionIdRef.current = missionId;
  }, [missionId]);

  const plannedDistanceM = useMemo(() => {
    if (!start || !destination) return null;
    return haversineDistanceMeters(start, destination);
  }, [destination, start]);

  const activeDistanceM = useMemo(() => {
    if (!current || !start) return null;
    if (status === "returning" || status === "completed") {
      return haversineDistanceMeters(current, start);
    }
    if (!destination) return null;
    return haversineDistanceMeters(current, destination);
  }, [current, destination, start, status]);

  const playPing = useCallback(() => {
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => undefined);
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.18);
    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.36);

    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 300]);
    }
  }, []);

  const initializeAudio = useCallback(async () => {
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    await audioContext.resume().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    await wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    if (status === "outbound" || status === "destination_reached" || status === "returning") {
      requestWakeLock();
      return () => {
        releaseWakeLock();
      };
    }

    releaseWakeLock();
  }, [releaseWakeLock, requestWakeLock, status]);

  const handleReachedDestination = useCallback(
    async (reading: GeoReading) => {
      setStatus("destination_reached");
      setDestinationReachedAt(Date.now());
      setDestinationPingAccuracyM(reading.accuracyM);
      setOverlay("Destination hittad!");
      playPing();

      if (missionIdRef.current) {
        try {
          await updateMission(missionIdRef.current, {
            status: "destination_reached",
            destination_reached_at: new Date().toISOString(),
            destination_accuracy_m: reading.accuracyM,
          });
        } catch (error) {
          setPersistenceError(
            error instanceof Error
              ? error.message
              : "Kunde inte spara destinationsträffen i Supabase.",
          );
        }
      }
    },
    [playPing, updateMission],
  );

  const handleCompleted = useCallback(
    async (reading: GeoReading) => {
      const now = Date.now();
      setStatus("completed");
      setCompletedAt(now);
      setReturnPingAccuracyM(reading.accuracyM);
      setOverlay("Uppdrag slutfört!");
      playPing();
      stopWatch();
      await releaseWakeLock();

      if (missionIdRef.current) {
        try {
          const timestamp = new Date().toISOString();
          await updateMission(missionIdRef.current, {
            status: "completed",
            returned_at: timestamp,
            completed_at: timestamp,
            return_accuracy_m: reading.accuracyM,
          });
        } catch (error) {
          setPersistenceError(
            error instanceof Error
              ? error.message
              : "Kunde inte spara slutfört uppdrag i Supabase.",
          );
        }
      }
    },
    [playPing, releaseWakeLock, stopWatch, updateMission],
  );

  const handleReading = useCallback(
    (reading: GeoReading) => {
      setCurrent(reading.position);
      setAccuracyM(reading.accuracyM);

      const activeStatus = statusRef.current;
      const targetDestination = destinationRef.current;
      const targetStart = startRef.current;

      if (activeStatus === "outbound" && targetDestination) {
        const result = updateReachStreak({
          previousStreak: outboundStreakRef.current,
          current: reading.position,
          target: targetDestination,
          accuracyM: reading.accuracyM,
          radiusM: REACH_RADIUS_M,
          maxAccuracyM: MAX_PING_ACCURACY_M,
        });
        outboundStreakRef.current = result.streak;

        if (result.reached) {
          outboundStreakRef.current = 0;
          handleReachedDestination(reading);
        }
      }

      if (activeStatus === "returning" && targetStart) {
        const result = updateReachStreak({
          previousStreak: returnStreakRef.current,
          current: reading.position,
          target: targetStart,
          accuracyM: reading.accuracyM,
          radiusM: REACH_RADIUS_M,
          maxAccuracyM: MAX_PING_ACCURACY_M,
        });
        returnStreakRef.current = result.streak;

        if (result.reached) {
          returnStreakRef.current = 0;
          handleCompleted(reading);
        }
      }
    },
    [handleCompleted, handleReachedDestination],
  );

  const locateStart = useCallback(() => {
    setPersistenceError(null);
    setMessage(null);

    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Din webbläsare saknar stöd för GPS via Geolocation API.");
      return;
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
        setAccuracyM(position.coords.accuracy);
        setDestination(null);
        setStatus("selecting_destination");
        setMessage("Startpunkt hittad. Tryck på kartan eller skapa ett testmål.");
      },
      (error) => {
        setStatus("error");
        setMessage(errorFromPositionError(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  }, []);

  const selectDestination = useCallback((point: Coordinate) => {
    setDestination(point);
    setStatus("ready");
    setMessage("Destination vald. Kontrollera avståndet och starta uppdraget.");
  }, []);

  const createTestDestination = useCallback(() => {
    if (!start) return;
    const bearing = Math.random() * 360;
    selectDestination(destinationPoint(start, bearing, 500));
  }, [selectDestination, start]);

  const startMission = useCallback(async () => {
    if (!start || !destination || !plannedDistanceM) return;

    setStarting(true);
    setPersistenceError(null);

    try {
      await initializeAudio();
      const mission = await createMission({
        start,
        destination,
        plannedDistanceM,
      });
      setMissionId(mission.id);
      setStartedAt(Date.now());
      setStatus("outbound");
      outboundStreakRef.current = 0;
      returnStreakRef.current = 0;
      startWatch({
        onReading: handleReading,
        onError: (error) => {
          setPersistenceError(error);
        },
      });
    } catch (error) {
      setPersistenceError(
        error instanceof Error ? error.message : "Kunde inte starta uppdraget.",
      );
    } finally {
      setStarting(false);
    }
  }, [
    createMission,
    destination,
    handleReading,
    initializeAudio,
    plannedDistanceM,
    start,
    startWatch,
  ]);

  const beginReturn = useCallback(async () => {
    setStatus("returning");
    returnStreakRef.current = 0;

    if (!missionId) return;

    try {
      await updateMission(missionId, { status: "returning" });
    } catch (error) {
      setPersistenceError(
        error instanceof Error ? error.message : "Kunde inte spara returfasen.",
      );
    }
  }, [missionId, updateMission]);

  const cancelMission = useCallback(async () => {
    stopWatch();
    await releaseWakeLock();
    setStatus("cancelled");

    if (!missionIdRef.current) return;

    try {
      await updateMission(missionIdRef.current, {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      });
    } catch (error) {
      setPersistenceError(
        error instanceof Error ? error.message : "Kunde inte spara avbrutet uppdrag.",
      );
    }
  }, [releaseWakeLock, stopWatch, updateMission]);

  const reset = useCallback(() => {
    stopWatch();
    setStatus("idle");
    setStart(null);
    setDestination(null);
    setCurrent(null);
    setAccuracyM(null);
    setMissionId(null);
    setMessage(null);
    setPersistenceError(null);
    setOverlay(null);
    setStartedAt(null);
    setDestinationReachedAt(null);
    setCompletedAt(null);
    setDestinationPingAccuracyM(null);
    setReturnPingAccuracyM(null);
    outboundStreakRef.current = 0;
    returnStreakRef.current = 0;
  }, [stopWatch]);

  const simulateDestinationReached = useCallback(() => {
    if (!destination) return;
    handleReading({ position: destination, accuracyM: 10, timestamp: Date.now() });
    handleReading({ position: destination, accuracyM: 10, timestamp: Date.now() });
  }, [destination, handleReading]);

  const simulateReturnReached = useCallback(() => {
    if (!start) return;
    setStatus("returning");
    handleReading({ position: start, accuracyM: 10, timestamp: Date.now() });
    handleReading({ position: start, accuracyM: 10, timestamp: Date.now() });
  }, [handleReading, start]);

  const canSelectDestination = status === "selecting_destination" || status === "ready";
  const showMap = Boolean(start);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#43d9ad]">
            GPS Field MVP
          </p>
          <h1 className="text-3xl font-black text-white">Runhold</h1>
        </div>
        <div className="grid size-11 place-items-center rounded-full bg-[#22303b] text-[#43d9ad]">
          <Satellite aria-hidden="true" size={24} />
        </div>
      </header>

      {!showMap ? (
        <LocationPermissionCard loading={status === "locating"} onLocate={locateStart} />
      ) : (
        <div className="grid gap-4">
          <div className="h-[52dvh] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-[#18232d] shadow-2xl">
            {start ? (
              <MapLoader
                start={start}
                destination={destination}
                current={current}
                canSelectDestination={canSelectDestination}
                showStartRadius={status === "returning" || status === "completed"}
                onDestinationSelect={selectDestination}
              />
            ) : null}
          </div>

          <MissionStatusPanel
            status={status}
            distanceM={activeDistanceM}
            accuracyM={accuracyM}
            plannedDistanceM={plannedDistanceM}
            sessionError={sessionLoading ? null : sessionError}
            persistenceError={persistenceError}
          />

          {message ? (
            <p className="rounded-md bg-[#22303b] p-3 text-sm leading-6 text-[#d7e1dd]">
              {message}
            </p>
          ) : null}

          <MissionControls
            status={status}
            hasDestination={Boolean(destination)}
            destinationDistanceM={plannedDistanceM}
            onCreateTestDestination={createTestDestination}
            onStartMission={startMission}
            onBeginReturn={beginReturn}
            onCancel={cancelMission}
            onReset={reset}
            starting={starting || sessionLoading}
          />
        </div>
      )}

      {status === "completed" ? (
        <section className="rounded-lg border border-[#43d9ad]/30 bg-[#16342d] p-4">
          <h2 className="text-xl font-black text-white">Sammanfattning</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Planerat avstånd</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {plannedDistanceM ? Math.round(plannedDistanceM) : "--"} m
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Tid till mål</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {formatDuration(startedAt, destinationReachedAt)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Tid tillbaka</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {formatDuration(destinationReachedAt, completedAt)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">Total tid</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {formatDuration(startedAt, completedAt)}
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">GPS vid mål</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {destinationPingAccuracyM ? Math.round(destinationPingAccuracyM) : "--"} m
              </dd>
            </div>
            <div className="rounded-md bg-[#0f211c] p-3">
              <dt className="text-[#a9cfc3]">GPS vid retur</dt>
              <dd className="mt-1 text-lg font-black text-white">
                {returnPingAccuracyM ? Math.round(returnPingAccuracyM) : "--"} m
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4 text-sm leading-6 text-[#c9d4d0]">
        <div className="flex items-center gap-2 font-bold text-white">
          <Info aria-hidden="true" size={18} />
          Testvillkor
        </div>
        <p className="mt-2">
          Håll appen öppen och skärmen aktiv under testet. Mobilens webbläsare kan
          pausa GPS-spårning när appen ligger i bakgrunden eller skärmen är låst.
        </p>
        <p className="mt-2">
          Appen behöver internet för kartan och Supabase. OpenStreetMap-cache lagras
          inte för offlinebruk.
        </p>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4 text-sm leading-6 text-[#c9d4d0]">
        <h2 className="font-bold text-white">Integritet</h2>
        <p className="mt-2">
          GPS används endast när du själv startar testet. Kontinuerliga GPS-punkter
          sparas inte. Endast uppdragets startpunkt, destination och resultat sparas.
          Du kan avbryta när som helst.
        </p>
      </section>

      {process.env.NODE_ENV === "development" && start ? (
        <section className="rounded-lg border border-[#6ea8fe]/40 bg-[#142337] p-4">
          <div className="flex items-center gap-2 font-bold text-white">
            <Bug aria-hidden="true" size={18} />
            Utvecklarläge
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#22303b] px-3 text-sm font-bold text-white"
              onClick={() => destination && setCurrent(destination)}
              disabled={!destination}
            >
              Simulera position vid mål
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#22303b] px-3 text-sm font-bold text-white"
              onClick={simulateDestinationReached}
              disabled={!destination || status !== "outbound"}
            >
              Simulera destination nådd
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-[#22303b] px-3 text-sm font-bold text-white"
              onClick={simulateReturnReached}
              disabled={status !== "returning" && status !== "destination_reached"}
            >
              Simulera återkomst
            </button>
          </div>
        </section>
      ) : null}

      <PingOverlay message={overlay} onDismiss={() => setOverlay(null)} />
    </main>
  );
}
