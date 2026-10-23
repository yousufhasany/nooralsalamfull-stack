import {
  Accessibility,
  Baby,
  Bath,
  BedDouble,
  Building2,
  Bus,
  Car,
  Check,
  Clock,
  Coffee,
  ConciergeBell,
  Dumbbell,
  KeyRound,
  Shirt,
  ShieldCheck,
  Sparkles,
  Tv,
  Utensils,
  Waves,
  Wifi,
  Wind,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  wifi: Wifi,
  utensils: Utensils,
  car: Car,
  coffee: Coffee,
  dumbbell: Dumbbell,
  waves: Waves,
  shield: ShieldCheck,
  concierge: ConciergeBell,
  clock: Clock,
  key: KeyRound,
  bed: BedDouble,
  tv: Tv,
  wind: Wind,
  bath: Bath,
  shirt: Shirt,
  bus: Bus,
  baby: Baby,
  accessible: Accessibility,
  building: Building2,
  check: Check,
};

export const ICON_KEYS = Object.keys(ICONS);

export function FacilityIcon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon size={size} className={className} aria-hidden />;
}
