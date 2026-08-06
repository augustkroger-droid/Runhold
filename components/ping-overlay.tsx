import { CheckCircle2 } from "lucide-react";

export function PingOverlay({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-center bg-[#07110d]/90 p-5">
      <div className="w-full max-w-sm rounded-lg border border-[#43d9ad]/60 bg-[#18232d] p-6 text-center shadow-2xl">
        <CheckCircle2 aria-hidden="true" className="mx-auto text-[#43d9ad]" size={64} />
        <p className="mt-5 text-4xl font-black text-white">PING!</p>
        <p className="mt-3 text-2xl font-black text-[#43d9ad]">{message}</p>
        <button
          type="button"
          className="mt-6 min-h-12 w-full rounded-md bg-[#43d9ad] px-4 font-black text-[#07110d]"
          onClick={onDismiss}
        >
          Okej
        </button>
      </div>
    </div>
  );
}
