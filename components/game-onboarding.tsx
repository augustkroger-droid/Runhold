"use client";

import { Dumbbell, Flame, LogOut } from "lucide-react";
import { useState } from "react";
import {
  TRAINING_LEVELS,
  type TrainingLevelId,
} from "@/lib/game/definitions/training-levels";

export function GameOnboarding({
  username,
  loading,
  error,
  onStart,
  onSignOut,
}: {
  username: string;
  loading: boolean;
  error: string | null;
  onStart: (trainingLevel: TrainingLevelId) => Promise<void>;
  onSignOut: () => void;
}) {
  const [selectedTrainingLevel, setSelectedTrainingLevel] =
    useState<TrainingLevelId>("normal");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleStart() {
    setLocalError(null);

    try {
      await onStart(selectedTrainingLevel);
    } catch (startError) {
      setLocalError(
        startError instanceof Error
          ? startError.message
          : "Kunde inte starta spelet just nu.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#43d9ad]">
            {username}
          </p>
          <h1 className="text-3xl font-black text-white">Starta Runhold</h1>
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full bg-[#22303b] text-[#c9d4d0]"
          aria-label="Logga ut"
          onClick={onSignOut}
        >
          <LogOut aria-hidden="true" size={20} />
        </button>
      </header>

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-md bg-[#2b2414] text-[#f5b84b]">
            <Flame aria-hidden="true" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Din första lägerprofil</h2>
            <p className="mt-2 text-sm leading-6 text-[#c9d4d0]">
              Välj ungefär hur mycket du planerar att springa. Det här sparas som
              din första spelprofil och blir senare grunden för balans, raids och
              progression.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        {TRAINING_LEVELS.map((level) => {
          const selected = selectedTrainingLevel === level.id;

          return (
            <button
              type="button"
              key={level.id}
              className={`rounded-lg border p-4 text-left transition ${
                selected
                  ? "border-[#43d9ad] bg-[#14342d]"
                  : "border-white/10 bg-[#18232d]"
              }`}
              onClick={() => setSelectedTrainingLevel(level.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Dumbbell
                    aria-hidden="true"
                    size={18}
                    className={selected ? "text-[#43d9ad]" : "text-[#aeb9b6]"}
                  />
                  <h3 className="font-black text-white">{level.name}</h3>
                </div>
                <span className="rounded-md bg-black/20 px-2 py-1 text-xs font-bold text-[#c9d4d0]">
                  ca {level.weeklyRunsTarget}/vecka
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#c9d4d0]">
                {level.description}
              </p>
            </button>
          );
        })}
      </section>

      {error || localError ? (
        <p className="rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {localError ?? error}
        </p>
      ) : null}

      <button
        type="button"
        className="min-h-12 rounded-md bg-[#3f7f45] px-4 font-black text-white disabled:cursor-wait disabled:opacity-70"
        disabled={loading}
        onClick={handleStart}
      >
        {loading ? "Startar..." : "Skapa spelprofil"}
      </button>
    </main>
  );
}
