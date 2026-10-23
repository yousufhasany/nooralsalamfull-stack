import { MessageCircle } from "lucide-react";

export function WhatsAppButton({ number, label }: { number: string; label: string }) {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="no-print fixed bottom-5 end-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105"
    >
      <MessageCircle size={26} aria-hidden />
    </a>
  );
}
