import { MapPin, ShieldCheck } from "lucide-react";

export function LocationPermissionCard({
  loading,
  onLocate,
}: {
  loading: boolean;
  onLocate: () => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#43d9ad] text-[#08120e]">
          <MapPin aria-hidden="true" size={23} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-normal text-white">Runhold</h1>
          <p className="mt-1 text-sm leading-6 text-[#c9d4d0]">
            Välj ett mål ungefär 500 meter bort, gå dit och hämta hem resurser
            till ditt läger.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-[#22303b] p-3 text-sm leading-6 text-[#d7e1dd]">
        <div className="flex items-center gap-2 font-bold text-white">
          <ShieldCheck aria-hidden="true" size={18} />
          Varför GPS behövs
        </div>
        <p className="mt-2">
          GPS används först när du trycker på knappen. Appen sparar inte löpande
          positionshistorik, bara startpunkt, destination och uppdragsresultat.
        </p>
      </div>

      <button
        type="button"
        className="mt-5 flex min-h-14 w-full items-center justify-center rounded-md bg-[#43d9ad] px-5 text-base font-black text-[#07110d] shadow-lg shadow-[#43d9ad]/20 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onLocate}
        disabled={loading}
      >
        {loading ? "Hämtar position..." : "Hämta min position"}
      </button>
    </section>
  );
}
