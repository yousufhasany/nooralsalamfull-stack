import Image from "next/image";
import { cn } from "@/lib/utils";

/** Shown only when neither an uploaded image nor a site photo is available. */
export function PlaceholderImage({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("pattern-islamic relative grid place-items-center overflow-hidden text-center", className)} role="img" aria-label={label ?? "Placeholder"}>
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/60 to-transparent" aria-hidden />
      {label ? <span className="relative z-10 max-w-[80%] rounded-full border border-gold-500/40 bg-brand-950/50 px-3 py-1 text-xs text-gold-300">{label}</span> : null}
    </div>
  );
}

export function HotelImage({
  src,
  alt,
  placeholderLabel,
  className,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  priority,
}: {
  src?: string | null;
  alt: string;
  placeholderLabel?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (!src) return <PlaceholderImage label={placeholderLabel} className={className} />;
  if (/^https?:\/\//i.test(src)) {
    return (
      <div className={cn("relative overflow-hidden bg-sand-200", className)}>
        {/* Remote hotel photos are loaded by the browser so the pasted link is shown as-is. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-sand-200", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}
