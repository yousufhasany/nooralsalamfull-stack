-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "isOverbooked" BOOLEAN NOT NULL DEFAULT false;
