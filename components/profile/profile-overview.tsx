"use client";

import { LogOut, User } from "lucide-react";
import { TRAINING_LEVELS } from "@/lib/game/definitions/training-levels";
import type { PlayerGameProfile } from "@/lib/game/state/player-profile";

export function ProfileOverview({
  profile,
  username,
  onSignOut,
}: {
  profile: PlayerGameProfile;
  username: string;
  onSignOut: () => void;
}) {
  const trainingLevel = TRAINING_LEVELS.find(
    (level) => level.id === profile.selectedTrainingLevel,
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center gap-2 font-black text-white">
          <User aria-hidden="true" size={19} />
          Profil
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Spelare</dt>
            <dd className="mt-1 font-black text-white">{username}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Träningsnivå</dt>
            <dd className="mt-1 font-black text-white">
              {trainingLevel?.name ?? profile.selectedTrainingLevel}
            </dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Karaktär</dt>
            <dd className="mt-1 font-black text-white">Level {profile.characterLevel}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">XP</dt>
            <dd className="mt-1 font-black text-white">{profile.xp}</dd>
          </div>
        </dl>
      </section>

      <button
        type="button"
        className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#22303b] px-4 font-black text-white"
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" size={19} />
        Logga ut
      </button>
    </div>
  );
}
