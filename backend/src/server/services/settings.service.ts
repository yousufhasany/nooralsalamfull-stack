import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { AppError } from "@/lib/errors";

const bool = (d: boolean) => z.boolean().default(d);

export const bookingSettingsSchema = z.object({
  /** If true, a guest can check in on the same day another guest checks out of that room. */
  sameDayTurnover: bool(true),
  minStay: z.number().int().min(1).default(1),
  maxStay: z.number().int().min(1).default(30),
  maxRoomsPerBooking: z.number().int().min(1).default(5),
  maxAdvanceDays: z.number().int().min(1).default(540),
  payAtHotelEnabled: bool(true),
  /** Minutes an unpaid online-payment reservation holds inventory before it expires. */
  holdMinutes: z.number().int().min(5).default(30),
  autoConfirmDirect: bool(true),
  cancellationFreeDays: z.number().int().min(0).default(2),
  cancellationPolicyEn: z.string().default(""),
  cancellationPolicyAr: z.string().default(""),
  cancellationPolicyBn: z.string().default(""),
  guestSelfCancelEnabled: bool(true),
  guestModificationRequestEnabled: bool(true),
});

export const taxRuleSchema = z.object({
  code: z.string().min(1).max(20),
  nameEn: z.string().min(1),
  nameAr: z.string().default(""),
  nameBn: z.string().default(""),
  /** Percentage, e.g. 15 means 15%. Configured by the hotel / accountant - never hard-coded. */
  rate: z.string().regex(/^\d+(\.\d{1,4})?$/),
  enabled: bool(true),
});
export type TaxRule = z.infer<typeof taxRuleSchema>;

export const taxSettingsSchema = z.object({
  rules: z.array(taxRuleSchema).default([]),
  /** true = displayed room prices already contain tax. */
  pricesIncludeTax: bool(false),
});

export const pricingSettingsSchema = z.object({
  /** ISO weekdays (1=Mon..7=Sun) that use the weekend price. Saudi weekend: Fri(5) + Sat(6). */
  weekendDays: z.array(z.number().int().min(1).max(7)).default([5, 6]),
});

export const guestSettingsSchema = z.object({
  requireNationality: bool(true),
  requireIdAtBooking: bool(false),
  idTypes: z.array(z.string()).default(["NATIONAL_ID", "IQAMA", "PASSPORT", "GCC_ID"]),
});

export const paymentSettingsSchema = z.object({
  /** none | moyasar | hyperpay | tap ... Only providers with an implemented adapter can be activated. */
  provider: z.string().default("none"),
});

export const notificationSettingsSchema = z.object({
  emailEnabled: bool(true),
  smsEnabled: bool(false),
  whatsappEnabled: bool(false),
  staffAlertEmail: z.string().default(""),
});

export const displaySettingsSchema = z.object({
  showHijriDates: bool(false),
  defaultLocale: z.enum(["en", "ar", "bn"]).default("en"),
});

export const settingGroups = {
  booking: bookingSettingsSchema,
  tax: taxSettingsSchema,
  pricing: pricingSettingsSchema,
  guest: guestSettingsSchema,
  payments: paymentSettingsSchema,
  notifications: notificationSettingsSchema,
  display: displaySettingsSchema,
} as const;

export type SettingGroup = keyof typeof settingGroups;
export type SettingsOf<G extends SettingGroup> = z.infer<(typeof settingGroups)[G]>;

export type AllSettings = { [G in SettingGroup]: SettingsOf<G> };

export async function getHotel(client: DbOrTx = db) {
  const hotel = await client.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotel) throw new AppError("NOT_CONFIGURED", "The hotel has not been configured yet.");
  return hotel;
}

export async function getAllSettings(hotelId: string, client: DbOrTx = db): Promise<AllSettings> {
  const rows = await client.hotelSetting.findMany({ where: { hotelId } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const [group, schema] of Object.entries(settingGroups)) {
    const parsed = schema.safeParse(byKey.get(group) ?? {});
    out[group] = parsed.success ? parsed.data : schema.parse({});
  }
  return out as AllSettings;
}

export async function getSettings<G extends SettingGroup>(
  hotelId: string,
  group: G,
  client: DbOrTx = db,
): Promise<SettingsOf<G>> {
  const row = await client.hotelSetting.findUnique({ where: { hotelId_key: { hotelId, key: group } } });
  const schema = settingGroups[group];
  const parsed = schema.safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as SettingsOf<G>;
}

export async function saveSettings<G extends SettingGroup>(
  hotelId: string,
  group: G,
  value: unknown,
  client: DbOrTx = db,
): Promise<SettingsOf<G>> {
  const data = settingGroups[group].parse(value);
  await client.hotelSetting.upsert({
    where: { hotelId_key: { hotelId, key: group } },
    create: { hotelId, key: group, value: data as object },
    update: { value: data as object },
  });
  return data as SettingsOf<G>;
}
