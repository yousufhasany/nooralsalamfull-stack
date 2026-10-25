import { db, type DbOrTx } from "@/server/db/client";
import type { ReservationSource, AdjustmentType, PricingRuleType } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, Decimal, round2, toDb, ZERO, type MoneyInput } from "@/lib/money";
import { addDays, diffDays, eachNight, isoWeekday, toDate, todayIn, type DateStr } from "@/lib/dates";
import { getHotel, getSettings, type TaxRule } from "./settings.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PricingRoomType {
  id: string;
  basePrice: MoneyInput;
  weekendPrice: MoneyInput | null;
}

export interface PricingRatePlan {
  id: string;
  adjustmentType: AdjustmentType;
  adjustmentValue: MoneyInput;
}

export interface PricingRate {
  startDate: Date;
  endDate: Date;
  price: MoneyInput;
  daysOfWeek: number[];
  priority: number;
  ratePlanId: string | null;
  isActive: boolean;
}

export interface PricingRuleData {
  type: PricingRuleType;
  source: ReservationSource | null;
  roomTypeId: string | null;
  ratePlanId: string | null;
  adjustmentType: AdjustmentType;
  adjustmentValue: MoneyInput;
  minNights: number | null;
  maxNights: number | null;
  startDate: Date | null;
  endDate: Date | null;
  priority: number;
  isActive: boolean;
}

export interface PromotionData {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  amount: MoneyInput;
  startDate: Date;
  endDate: Date;
  usageLimit: number | null;
  usedCount: number;
  minNights: number | null;
  isActive: boolean;
  roomTypeIds: string[];
}

export interface PricingContext {
  roomType: PricingRoomType;
  ratePlan: PricingRatePlan | null;
  rates: PricingRate[];
  rules: PricingRuleData[];
  weekendDays: number[];
}

export interface NightPrice {
  date: DateStr;
  price: string;
}

export interface TaxLine {
  code: string;
  name: string;
  rate: string;
  taxableAmount: string;
  amount: string;
}

export interface QuoteBreakdown {
  currency: string;
  checkIn: DateStr;
  checkOut: DateStr;
  nights: number;
  rooms: number;
  nightly: NightPrice[];
  /** Price of one room for the whole stay. */
  perRoomTotal: string;
  /** Rooms subtotal before discount and tax, exactly as displayed to the guest (gross if prices include tax). */
  displaySubtotal: string;
  discount: string;
  promotionCode: string | null;
  promotionId: string | null;
  taxes: TaxLine[];
  taxTotal: string;
  pricesIncludeTax: boolean;
  /** Ledger view: net room charge (excludes extracted tax). */
  netRoomsSubtotal: string;
  /** Ledger view: net discount (excludes extracted tax). */
  netDiscount: string;
  total: string;
}

// ---------------------------------------------------------------------------
// Pure calculation
// ---------------------------------------------------------------------------

function applyAdjustment(price: Decimal, type: AdjustmentType, value: MoneyInput): Decimal {
  const v = D(value);
  const next = type === "PERCENT" ? price.mul(D(1).plus(v.div(100))) : price.plus(v);
  return round2(next.isNegative() ? ZERO : next);
}

function dateCovers(d: DateStr, start: Date | null, end: Date | null, endInclusive = true): boolean {
  const t = toDate(d).getTime();
  if (start && t < start.getTime()) return false;
  if (end && (endInclusive ? t > end.getTime() : t >= end.getTime())) return false;
  return true;
}

export function nightlyPrice(ctx: PricingContext, date: DateStr, stayNights: number, source: ReservationSource): Decimal {
  const { roomType, ratePlan, rates, rules, weekendDays } = ctx;
  const weekday = isoWeekday(date);
  const isWeekend = weekendDays.includes(weekday);

  let price = D(isWeekend && roomType.weekendPrice != null ? roomType.weekendPrice : roomType.basePrice);

  const matchingRates = rates
    .filter(
      (r) =>
        r.isActive &&
        dateCovers(date, r.startDate, r.endDate) &&
        (r.daysOfWeek.length === 0 || r.daysOfWeek.includes(weekday)) &&
        (r.ratePlanId === null || r.ratePlanId === ratePlan?.id),
    )
    .sort((a, b) => b.priority - a.priority || Number(b.ratePlanId !== null) - Number(a.ratePlanId !== null));
  if (matchingRates[0]) price = D(matchingRates[0].price);

  if (ratePlan) price = applyAdjustment(price, ratePlan.adjustmentType, ratePlan.adjustmentValue);

  const applicable = rules
    .filter(
      (r) =>
        r.isActive &&
        (r.source === null || r.source === source) &&
        (r.roomTypeId === null || r.roomTypeId === roomType.id) &&
        (r.ratePlanId === null || r.ratePlanId === ratePlan?.id) &&
        (r.minNights === null || stayNights >= r.minNights) &&
        (r.maxNights === null || stayNights <= r.maxNights) &&
        dateCovers(date, r.startDate, r.endDate),
    )
    .sort((a, b) => a.priority - b.priority);
  for (const rule of applicable) price = applyAdjustment(price, rule.adjustmentType, rule.adjustmentValue);

  return round2(price);
}

export interface TaxComputation {
  taxes: TaxLine[];
  taxTotal: Decimal;
}

/**
 * Compute taxes for `amount`.
 * - exclusive: taxes are added on top of `amount`.
 * - inclusive: `amount` already contains the taxes; they are extracted.
 * Each rule is applied to the same net base (no compounding). Compounding rules, if the hotel's
 * tax advisor requires them, belong in this single function.
 */
export function computeTaxes(amount: MoneyInput, rules: TaxRule[], inclusive: boolean): TaxComputation {
  const active = rules.filter((r) => r.enabled && D(r.rate).greaterThan(0));
  const gross = D(amount);
  if (active.length === 0 || gross.isZero()) return { taxes: [], taxTotal: ZERO };
  const totalRate = active.reduce((acc, r) => acc.plus(D(r.rate)), ZERO);
  const net = inclusive ? gross.div(D(1).plus(totalRate.div(100))) : gross;
  const taxes: TaxLine[] = active.map((r) => ({
    code: r.code,
    name: r.nameEn,
    rate: D(r.rate).toString(),
    taxableAmount: toDb(net),
    amount: toDb(net.mul(D(r.rate)).div(100)),
  }));
  let taxTotal = taxes.reduce((acc, t) => acc.plus(D(t.amount)), ZERO);
  if (inclusive) {
    // Keep invariant: net + taxes === gross by absorbing rounding in the last tax line.
    const drift = round2(gross.minus(round2(net)).minus(taxTotal));
    if (!drift.isZero() && taxes.length > 0) {
      const last = taxes[taxes.length - 1];
      last.amount = toDb(D(last.amount).plus(drift));
      taxTotal = taxTotal.plus(drift);
    }
    for (const t of taxes) t.taxableAmount = toDb(gross.minus(taxTotal));
  }
  return { taxes, taxTotal: round2(taxTotal) };
}

export interface PromotionResult {
  discount: Decimal;
  promotionId: string;
  code: string;
}

export function evaluatePromotion(
  promo: PromotionData,
  args: { roomTypeId: string; nights: number; subtotal: MoneyInput; today: DateStr },
): PromotionResult {
  const invalid = (msg: string) => new AppError("INVALID_INPUT", msg);
  if (!promo.isActive) throw invalid("This promotion code is not active.");
  if (!dateCovers(args.today, promo.startDate, promo.endDate)) throw invalid("This promotion code has expired or is not yet valid.");
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) throw invalid("This promotion code has reached its usage limit.");
  if (promo.minNights !== null && args.nights < promo.minNights) throw invalid(`This promotion requires a minimum stay of ${promo.minNights} nights.`);
  if (promo.roomTypeIds.length > 0 && !promo.roomTypeIds.includes(args.roomTypeId)) throw invalid("This promotion code does not apply to the selected room.");

  const subtotal = D(args.subtotal);
  let discount = promo.discountType === "PERCENT" ? subtotal.mul(D(promo.amount)).div(100) : D(promo.amount);
  discount = round2(Decimal.min(discount, subtotal));
  return { discount, promotionId: promo.id, code: promo.code };
}

export interface BuildQuoteArgs {
  ctx: PricingContext;
  checkIn: DateStr;
  checkOut: DateStr;
  rooms: number;
  source: ReservationSource;
  currency: string;
  taxRules: TaxRule[];
  pricesIncludeTax: boolean;
  promotion?: PromotionData | null;
  today: DateStr;
}

export function buildQuote(args: BuildQuoteArgs): QuoteBreakdown {
  const { ctx, checkIn, checkOut, rooms, source } = args;
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1) throw new AppError("INVALID_DATES", "Check-out must be after check-in.");

  const nightly: NightPrice[] = eachNight(checkIn, checkOut).map((date) => ({
    date,
    price: toDb(nightlyPrice(ctx, date, nights, source)),
  }));
  const perRoom = nightly.reduce((acc, n) => acc.plus(D(n.price)), ZERO);
  const subtotal = round2(perRoom.mul(rooms));

  let discount = ZERO;
  let promotionCode: string | null = null;
  let promotionId: string | null = null;
  if (args.promotion) {
    const r = evaluatePromotion(args.promotion, {
      roomTypeId: ctx.roomType.id,
      nights,
      subtotal,
      today: args.today,
    });
    discount = r.discount;
    promotionCode = r.code;
    promotionId = r.promotionId;
  }

  const afterDiscount = round2(subtotal.minus(discount));
  const { taxes, taxTotal } = computeTaxes(afterDiscount, args.taxRules, args.pricesIncludeTax);

  let netRooms = subtotal;
  let netDiscount = discount;
  let total: Decimal;
  if (args.pricesIncludeTax) {
    const taxOnSubtotal = computeTaxes(subtotal, args.taxRules, true).taxTotal;
    const taxOnDiscount = round2(taxOnSubtotal.minus(taxTotal));
    netRooms = round2(subtotal.minus(taxOnSubtotal));
    netDiscount = round2(discount.minus(taxOnDiscount));
    total = afterDiscount;
  } else {
    total = round2(afterDiscount.plus(taxTotal));
  }

  return {
    currency: args.currency,
    checkIn,
    checkOut,
    nights,
    rooms,
    nightly,
    perRoomTotal: toDb(perRoom),
    displaySubtotal: toDb(subtotal),
    discount: toDb(discount),
    promotionCode,
    promotionId,
    taxes,
    taxTotal: toDb(taxTotal),
    pricesIncludeTax: args.pricesIncludeTax,
    netRoomsSubtotal: toDb(netRooms),
    netDiscount: toDb(netDiscount),
    total: toDb(total),
  };
}

// ---------------------------------------------------------------------------
// Database-backed API
// ---------------------------------------------------------------------------

export async function loadPricingContext(
  client: DbOrTx,
  roomTypeId: string,
  ratePlanId: string | null,
  from: DateStr,
  to: DateStr,
  weekendDays: number[],
): Promise<PricingContext> {
  const roomType = await client.roomType.findFirst({ where: { id: roomTypeId, deletedAt: null } });
  if (!roomType) throw new AppError("NOT_FOUND", "Room type not found.");
  const ratePlan = ratePlanId ? await client.ratePlan.findUnique({ where: { id: ratePlanId } }) : null;
  if (ratePlanId && !ratePlan) throw new AppError("NOT_FOUND", "Rate plan not found.");

  const [rates, rules] = await Promise.all([
    client.roomRate.findMany({
      where: { roomTypeId, isActive: true, startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } },
    }),
    client.pricingRule.findMany({ where: { isActive: true, OR: [{ roomTypeId: null }, { roomTypeId }] } }),
  ]);

  return {
    roomType,
    ratePlan,
    rates,
    rules,
    weekendDays,
  };
}

/** Price every night at `price`, ignoring weekend prices, dated rates, rate plan and pricing rules. */
export function withPriceOverride(ctx: PricingContext, price: MoneyInput | null | undefined): PricingContext {
  if (price == null) return ctx;
  return { ...ctx, roomType: { ...ctx.roomType, basePrice: price, weekendPrice: null }, ratePlan: null, rates: [], rules: [] };
}

export async function findPromotion(client: DbOrTx, code: string): Promise<PromotionData | null> {
  const promo = await client.promotion.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { roomTypes: true },
  });
  if (!promo) return null;
  return { ...promo, roomTypeIds: promo.roomTypes.map((r) => r.roomTypeId) };
}

export interface QuoteRequest {
  roomTypeId: string;
  ratePlanId?: string | null;
  checkIn: DateStr;
  checkOut: DateStr;
  rooms?: number;
  source?: ReservationSource;
  promotionCode?: string | null;
}

/**
 * Server-side price quote. This is the ONLY place where prices are produced - the browser
 * never supplies a price, tax or discount.
 */
export async function quoteStay(req: QuoteRequest, client: DbOrTx = db): Promise<QuoteBreakdown> {
  const hotel = await getHotel(client);
  const [pricing, tax] = await Promise.all([
    getSettings(hotel.id, "pricing", client),
    getSettings(hotel.id, "tax", client),
  ]);
  const ctx = await loadPricingContext(
    client,
    req.roomTypeId,
    req.ratePlanId ?? null,
    req.checkIn,
    addDays(req.checkOut, -1),
    pricing.weekendDays,
  );
  let promotion: PromotionData | null = null;
  if (req.promotionCode?.trim()) {
    promotion = await findPromotion(client, req.promotionCode);
    if (!promotion) throw new AppError("INVALID_INPUT", "This promotion code is not valid.");
  }
  const today = todayIn(hotel.timezone);
  return buildQuote({
    ctx,
    checkIn: req.checkIn,
    checkOut: req.checkOut,
    rooms: req.rooms ?? 1,
    source: req.source ?? "DIRECT_WEBSITE",
    currency: hotel.currency,
    taxRules: tax.rules,
    pricesIncludeTax: tax.pricesIncludeTax,
    promotion,
    today,
  });
}

/** Lowest per-night price for display ("from SAR x"), using today's pricing for the next night. */
export async function priceForNight(roomTypeId: string, date: DateStr, source: ReservationSource = "DIRECT_WEBSITE", client: DbOrTx = db): Promise<string> {
  const q = await quoteStay({ roomTypeId, checkIn: date, checkOut: addDays(date, 1), source }, client);
  return q.nightly[0].price;
}
