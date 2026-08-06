"use client";

import dynamic from "next/dynamic";

export const MapLoader = dynamic(
  () => import("@/components/map/mission-map").then((mod) => mod.MissionMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[360px] place-items-center rounded-lg bg-[#18232d] text-sm text-[#c9d4d0]">
        Laddar karta...
      </div>
    ),
  },
);
