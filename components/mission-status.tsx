import { AlertTriangle, CheckCircle2, Navigation, Radio } from "lucide-react";
import type { MissionStatus } from "@/lib/types/mission";

const phaseLabels: Record<MissionStatus, string> = {
  idle: "Redo",
  locating: "Letar GPS",
  selecting_destination: "Välj mål",
  ready: "Klar att starta",
  outbound: "Mot destinationen",
  destination_reached: "Målet hämtat",
  returning: "Tillbaka till start",
  completed: "Målet hämtat",
  cancelled: "Avbrutet",
  error: "Fel",
};

export function MissionStatusPanel({
  status,
  distanceM,
  accuracyM,
  plannedDistanceM,
  sessionError,
  persistenceError,
}: {
  status: MissionStatus;
  distanceM: number | null;
  accuracyM: number | null;
  plannedDistanceM: number | null;
  sessionError: string | null;
  persistenceError: string | null;
}) {
  const weakGps = accuracyM !== null && accuracyM > 40;

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d]/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#43d9ad]">
            Fas
          </p>
          <h2 className="mt-1 text-xl font-black text-white">{phaseLabels[status]}</h2>
        </div>
        <div className="grid size-11 place-items-center rounded-full bg-[#22303b]">
          {status === "completed" ? (
            <CheckCircle2 aria-hidden="true" className="text-[#43d9ad]" size={24} />
          ) : (
            <Navigation aria-hidden="true" className="text-[#6ea8fe]" size={24} />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-[#22303b] p-3">
          <p className="text-xs text-[#aeb9b6]">Avstånd</p>
          <p className="mt-1 text-3xl font-black text-white">
            {distanceM === null ? "--" : Math.round(distanceM)}
            <span className="ml-1 text-base text-[#aeb9b6]">m</span>
          </p>
        </div>
        <div className="rounded-md bg-[#22303b] p-3">
          <p className="text-xs text-[#aeb9b6]">GPS-noggrannhet</p>
          <p className="mt-1 text-3xl font-black text-white">
            {accuracyM === null ? "--" : Math.round(accuracyM)}
            <span className="ml-1 text-base text-[#aeb9b6]">m</span>
          </p>
        </div>
      </div>

      {plannedDistanceM !== null ? (
        <p className="mt-3 text-sm leading-6 text-[#c9d4d0]">
          Planerat fågelvägsavstånd: {Math.round(plannedDistanceM)} meter.
        </p>
      ) : null}

      {weakGps ? (
        <div className="mt-3 flex gap-2 rounded-md border border-[#f5b84b]/50 bg-[#3d3017] p-3 text-sm text-[#ffe6ad]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
          GPS-noggrannheten är sämre än 40 meter. Pingen väntar på stabilare
          mätningar.
        </div>
      ) : null}

      {sessionError || persistenceError ? (
        <div className="mt-3 flex gap-2 rounded-md border border-[#ff6b6b]/50 bg-[#3a1d21] p-3 text-sm text-[#ffd4d4]">
          <Radio aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
          {sessionError ?? persistenceError}
        </div>
      ) : null}
    </section>
  );
}
