import Image from "next/image";
import { SITE_PHOTOS } from "@/lib/site-photos";
import { cn } from "@/lib/utils";

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function PageHero({ title, intro, eyebrow, image = SITE_PHOTOS.exterior }: { title: string; intro?: string; eyebrow?: string; image?: string }) {
  return (
    <section className="relative min-h-[46vh] overflow-hidden text-white">
      <Image src={image} alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-brand-950/35 to-brand-950/20" aria-hidden />
      <Container className="relative flex min-h-[46vh] flex-col justify-end py-14 sm:py-16">
        {eyebrow ? <p className="text-sm font-medium uppercase tracking-[0.25em] text-gold-400">{eyebrow}</p> : null}
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
        {intro ? <p className="mt-4 max-w-2xl text-lg text-white/85">{intro}</p> : null}
      </Container>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, intro, align = "start" }: { eyebrow?: string; title: string; intro?: string; align?: "start" | "center" }) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold-600">{eyebrow}</p> : null}
      <h2 className="mt-2 font-display text-3xl font-semibold text-brand-900 sm:text-4xl">{title}</h2>
      {intro ? <p className="mt-3 text-ink-500">{intro}</p> : null}
    </div>
  );
}
