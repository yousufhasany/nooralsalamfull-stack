/** Atmosphere photography used until the hotel uploads its own images in admin. */
export const SITE_PHOTOS = {
  hero: "/photos/hero.jpg",
  exterior: "/photos/exterior.jpg",
  lobby: "/photos/lobby.jpg",
  room: "/photos/room.jpg",
  deluxe: "/photos/deluxe.jpg",
  suite: "/photos/suite.jpg",
  family: "/photos/family.jpg",
  courtyard: "/photos/courtyard.jpg",
} as const;

export function photoForRoom(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes("family")) return SITE_PHOTOS.family;
  if (s.includes("suite")) return SITE_PHOTOS.suite;
  if (s.includes("deluxe") || s.includes("executive")) return SITE_PHOTOS.deluxe;
  return SITE_PHOTOS.room;
}

export function roomGallery(slug: string): string[] {
  const main = photoForRoom(slug);
  return [main, SITE_PHOTOS.lobby, SITE_PHOTOS.courtyard].filter((src, i, all) => all.indexOf(src) === i);
}

export const SITE_GALLERY: { id: string; url: string; category: "HOTEL" | "ROOMS" | "LOBBY" | "FACILITIES" | "EXTERIOR" }[] = [
  { id: "g-exterior", url: SITE_PHOTOS.exterior, category: "EXTERIOR" },
  { id: "g-hero", url: SITE_PHOTOS.hero, category: "LOBBY" },
  { id: "g-lobby", url: SITE_PHOTOS.lobby, category: "LOBBY" },
  { id: "g-room", url: SITE_PHOTOS.room, category: "ROOMS" },
  { id: "g-deluxe", url: SITE_PHOTOS.deluxe, category: "ROOMS" },
  { id: "g-suite", url: SITE_PHOTOS.suite, category: "ROOMS" },
  { id: "g-family", url: SITE_PHOTOS.family, category: "ROOMS" },
  { id: "g-court", url: SITE_PHOTOS.courtyard, category: "FACILITIES" },
  { id: "g-hotel", url: SITE_PHOTOS.exterior, category: "HOTEL" },
];
