import { Flag, LocateFixed, MapPinned, Play, RotateCcw, Square } from "lucide-react";
import type { MissionStatus } from "@/lib/types/mission";

export function MissionControls({
  status,
  hasDestination,
  destinationDistanceM,
  onCreateTestDestination,
  creatingDestination,
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
  creatingDestination: boolean;
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
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-[#43d9ad]/50 bg-[#16342d] px-4 font-bold text-[#d7fff0] disabled:cursor-wait disabled:opacity-75"
            onClick={onCreateTestDestination}
            disabled={creatingDestination}
          >
            {creatingDestination ? (
              <LocateFixed aria-hidden="true" className="animate-pulse" size={20} />
            ) : (
              <MapPinned aria-hidden="true" size={20} />
            )}
            {creatingDestination ? "Letar mål..." : "Slumpa mål cirka 500 m bort"}
          </button>
          <p className="text-sm leading-6 text-[#c9d4d0]">
            Appen försöker hitta en OpenStreetMap-punkt nära gångbar väg. Om det
            inte fungerar skapas ett vanligt 500-metersmål. Du kan alltid flytta
            målet genom att trycka på kartan.
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
            {starting ? "Startar..." : "Starta hämta-uppdrag"}
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
