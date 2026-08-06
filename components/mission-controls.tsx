import { Flag, LocateFixed, Play, RotateCcw, Square, Target } from "lucide-react";
import type { MissionStatus } from "@/lib/types/mission";

export function MissionControls({
  status,
  hasDestination,
  destinationDistanceM,
  onCreateTestDestination,
  onStartMission,
  onBeginReturn,
  onCancel,
  onReset,
  starting,
}: {
  status: MissionStatus;
  hasDestination: boolean;
  destinationDistanceM: number | null;
  onCreateTestDestination: () => void;
  onStartMission: () => void;
  onBeginReturn: () => void;
  onCancel: () => void;
  onReset: () => void;
  starting: boolean;
}) {
  const canStart = hasDestination && status === "ready";
  const outsideRange =
    destinationDistanceM !== null &&
    (destinationDistanceM < 400 || destinationDistanceM > 600);

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      {status === "selecting_destination" || status === "ready" ? (
        <div className="space-y-3">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[#43d9ad]/50 bg-[#16342d] px-4 font-bold text-[#d7fff0]"
            onClick={onCreateTestDestination}
          >
            <Target aria-hidden="true" size={20} />
            Skapa testmål 500 m bort
          </button>
          <p className="text-sm leading-6 text-[#c9d4d0]">
            Du kan också trycka på kartan för att flytta målet. 500 meter avser
            fågelvägen, inte en gångrutt.
          </p>
          {outsideRange ? (
            <p className="rounded-md border border-[#f5b84b]/50 bg-[#3d3017] p-3 text-sm text-[#ffe6ad]">
              Målet bör ligga mellan 400 och 600 meter bort för testet.
            </p>
          ) : null}
          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#43d9ad] px-5 text-base font-black text-[#07110d] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onStartMission}
            disabled={!canStart || starting}
          >
            <Play aria-hidden="true" size={21} />
            {starting ? "Startar..." : "Starta uppdrag"}
          </button>
        </div>
      ) : null}

      {status === "outbound" || status === "returning" ? (
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[#ff6b6b]/60 bg-[#3a1d21] px-4 font-bold text-[#ffd4d4]"
          onClick={onCancel}
        >
          <Square aria-hidden="true" size={18} />
          Avbryt uppdrag
        </button>
      ) : null}

      {status === "destination_reached" ? (
        <button
          type="button"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[#43d9ad] px-5 text-base font-black text-[#07110d]"
          onClick={onBeginReturn}
        >
          <Flag aria-hidden="true" size={21} />
          Börja gå tillbaka
        </button>
      ) : null}

      {status === "completed" || status === "cancelled" ? (
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#22303b] px-4 font-bold text-white"
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" size={19} />
          Starta om
        </button>
      ) : null}

      {status === "locating" ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-[#c9d4d0]">
          <LocateFixed aria-hidden="true" className="animate-pulse text-[#43d9ad]" size={18} />
          Väntar på GPS-svar...
        </div>
      ) : null}
    </section>
  );
}
