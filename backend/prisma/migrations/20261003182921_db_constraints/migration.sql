-- Database-level safety nets that Prisma cannot express in schema.prisma.
-- The application layer (src/server/services/availability.service.ts) is the
-- primary guard; these constraints make it impossible to corrupt data even if
-- application code has a bug or a second writer exists.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. A physical room can never be assigned to two overlapping, inventory-holding stays.
--    Stays are half-open ranges [checkIn, checkOut): same-day turnover is allowed.
--    (The "no same-day turnover" policy is enforced in the application by widening the range it checks.)
ALTER TABLE "ReservationRoom"
  ADD CONSTRAINT "ReservationRoom_no_room_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  ) WHERE ("roomId" IS NOT NULL AND "isBlocking");

-- 2. Sanity checks.
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_dates_valid" CHECK ("checkOut" > "checkIn");
ALTER TABLE "Reservation"     ADD CONSTRAINT "Reservation_dates_valid"     CHECK ("checkOut" > "checkIn" AND "nights" > 0);
ALTER TABLE "Reservation"     ADD CONSTRAINT "Reservation_guests_valid"    CHECK ("adults" >= 1 AND "children" >= 0);
ALTER TABLE "Payment"         ADD CONSTRAINT "Payment_amount_positive"     CHECK ("amount" > 0);
ALTER TABLE "Refund"          ADD CONSTRAINT "Refund_amount_positive"      CHECK ("amount" > 0);
ALTER TABLE "RoomType"        ADD CONSTRAINT "RoomType_prices_valid"       CHECK ("basePrice" >= 0 AND ("weekendPrice" IS NULL OR "weekendPrice" >= 0));
ALTER TABLE "Promotion"       ADD CONSTRAINT "Promotion_dates_valid"       CHECK ("endDate" >= "startDate");

-- 3. Append-only financial history. Corrections must be new ADJUSTMENT / REVERSAL rows.
CREATE OR REPLACE FUNCTION nas_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: financial history is append-only. Post an adjustment or reversal instead.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FinancialTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "FinancialTransaction"
  FOR EACH ROW EXECUTE FUNCTION nas_forbid_mutation();

CREATE TRIGGER "TaxTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "TaxTransaction"
  FOR EACH ROW EXECUTE FUNCTION nas_forbid_mutation();

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION nas_forbid_mutation();
