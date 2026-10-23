-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('SUPER_ADMIN', 'HOTEL_MANAGER', 'RECEPTIONIST', 'RESERVATION_MANAGER', 'HOUSEKEEPING', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY', 'CLEANING', 'MAINTENANCE', 'OUT_OF_ORDER');

-- CreateEnum
CREATE TYPE "RoomBlockType" AS ENUM ('MAINTENANCE', 'OUT_OF_ORDER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('DIRECT_WEBSITE', 'BOOKING_COM', 'AGODA', 'TRIP_COM', 'EXPEDIA', 'PHONE', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'PAY_AT_HOTEL', 'PAID_BY_OTA', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'INFORMATION_NOT_PROVIDED');

-- CreateEnum
CREATE TYPE "PaymentCollectionMethod" AS ENUM ('PAY_AT_HOTEL', 'OTA_COLLECTED', 'HOTEL_COLLECTED', 'ONLINE_PAYMENT', 'BANK_TRANSFER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('DIRECT_WEBSITE', 'BOOKING_COM', 'AGODA', 'TRIP_COM', 'EXPEDIA', 'HOTEL_CASH', 'HOTEL_CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('ROOM_CHARGE', 'ADDITIONAL_CHARGE', 'DISCOUNT', 'TAX', 'PAYMENT', 'REFUND', 'OTA_COMMISSION', 'OTA_PAYOUT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerCategory" AS ENUM ('REVENUE', 'TAX', 'CASH', 'COMMISSION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "RatePlanType" AS ENUM ('STANDARD', 'NON_REFUNDABLE', 'BREAKFAST_INCLUDED', 'HALF_BOARD', 'FULL_BOARD', 'CORPORATE', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('LONG_STAY_DISCOUNT', 'CHANNEL_ADJUSTMENT', 'CORPORATE', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('OTA', 'CHANNEL_MANAGER');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('RESERVATION_PULL', 'RESERVATION_IMPORT', 'INVENTORY_PUSH', 'RATE_PUSH', 'RESTRICTION_PUSH', 'RESERVATION_ACK', 'WEBHOOK', 'CONNECTION_TEST');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'DISPUTED', 'REFUNDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('EXPECTED', 'CONFIRMED', 'DISPUTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'PARTIALLY_MATCHED', 'UNMATCHED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GalleryCategory" AS ENUM ('HOTEL', 'ROOMS', 'LOBBY', 'RESTAURANT', 'FACILITIES', 'EXTERIOR');

-- CreateEnum
CREATE TYPE "ModificationRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "taglineEn" TEXT NOT NULL DEFAULT '',
    "taglineAr" TEXT NOT NULL DEFAULT '',
    "taglineBn" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "descriptionBn" TEXT NOT NULL DEFAULT '',
    "addressEn" TEXT NOT NULL DEFAULT '',
    "addressAr" TEXT NOT NULL DEFAULT '',
    "addressBn" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'SA',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "heroImageUrl" TEXT NOT NULL DEFAULT '',
    "contactHoursEn" TEXT NOT NULL DEFAULT '',
    "contactHoursAr" TEXT NOT NULL DEFAULT '',
    "contactHoursBn" TEXT NOT NULL DEFAULT '',
    "mapEmbedUrl" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "checkInTime" TEXT NOT NULL DEFAULT '15:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '12:00',
    "vatNumber" TEXT NOT NULL DEFAULT '',
    "commercialReg" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelSetting" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'check',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "descriptionBn" TEXT NOT NULL DEFAULT '',
    "bedType" TEXT NOT NULL DEFAULT '',
    "bedTypeAr" TEXT NOT NULL DEFAULT '',
    "bedTypeBn" TEXT NOT NULL DEFAULT '',
    "sizeSqm" INTEGER,
    "maxAdults" INTEGER NOT NULL DEFAULT 2,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "maxOccupancy" INTEGER NOT NULL DEFAULT 2,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "weekendPrice" DECIMAL(12,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAmenity" (
    "roomTypeId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,

    CONSTRAINT "RoomAmenity_pkey" PRIMARY KEY ("roomTypeId","amenityId")
);

-- CreateTable
CREATE TABLE "RoomImage" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altEn" TEXT NOT NULL DEFAULT '',
    "altAr" TEXT NOT NULL DEFAULT '',
    "altBn" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoomImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBlock" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "RoomBlockType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomStatusLog" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fromStatus" "RoomStatus",
    "toStatus" "RoomStatus" NOT NULL,
    "userId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKOUT_CLEAN',
    "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "RatePlanType" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "descriptionBn" TEXT NOT NULL DEFAULT '',
    "isRefundable" BOOLEAN NOT NULL DEFAULT true,
    "adjustmentType" "AdjustmentType" NOT NULL DEFAULT 'FIXED',
    "adjustmentValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freeCancelDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomRate" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "daysOfWeek" INTEGER[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "source" "ReservationSource",
    "roomTypeId" TEXT,
    "ratePlanId" TEXT,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "adjustmentValue" DECIMAL(12,2) NOT NULL,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "discountType" "PromotionDiscountType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minNights" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRoomType" (
    "promotionId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,

    CONSTRAINT "PromotionRoomType_pkey" PRIMARY KEY ("promotionId","roomTypeId")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "idType" TEXT,
    "idNumberEnc" TEXT,
    "idLast4" TEXT,
    "address" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReservationCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "source" "ReservationSource" NOT NULL,
    "channelId" TEXT,
    "externalReservationId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentCollection" "PaymentCollectionMethod" NOT NULL DEFAULT 'PAY_AT_HOTEL',
    "ratePlanId" TEXT,
    "promotionId" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "roomsSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "additionalChargesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "specialRequests" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationRoom" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "ratePlanId" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "nightlyRates" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationNote" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModificationRequest" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestedCheckIn" DATE,
    "requestedCheckOut" DATE,
    "status" "ModificationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ModificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "source" "PaymentSource" NOT NULL,
    "collectionMethod" "PaymentCollectionMethod" NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "provider" TEXT,
    "providerReference" TEXT,
    "reference" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
    "provider" TEXT,
    "providerReference" TEXT,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "payoutId" TEXT,
    "commissionId" TEXT,
    "source" "ReservationSource",
    "type" "FinancialTransactionType" NOT NULL,
    "category" "LedgerCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT NOT NULL DEFAULT '',
    "reversalOfId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdditionalCharge" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "postedById" TEXT,

    CONSTRAINT "AdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxTransaction" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "taxCode" TEXT NOT NULL,
    "taxName" TEXT NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "paidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ROOM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTAPayout" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalPayoutId" TEXT,
    "reservationId" TEXT,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "payoutDate" DATE,
    "expectedPayoutDate" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OTAPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTACommission" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "rate" DECIMAL(7,4),
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "netHotelAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "CommissionStatus" NOT NULL DEFAULT 'EXPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OTACommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReceipt" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "receivedOn" DATE NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRecord" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "payoutId" TEXT,
    "status" "ReconciliationStatus" NOT NULL,
    "expectedGross" DECIMAL(14,2) NOT NULL,
    "expectedCommission" DECIMAL(14,2) NOT NULL,
    "expectedNet" DECIMAL(14,2) NOT NULL,
    "ledgerNet" DECIMAL(14,2) NOT NULL,
    "payoutNet" DECIMAL(14,2),
    "bankReceived" DECIMAL(14,2),
    "issues" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL DEFAULT 'OTA',
    "source" "ReservationSource" NOT NULL DEFAULT 'OTHER',
    "providerKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "credentialsEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "config" JSONB,
    "hotelExternalId" TEXT,
    "isTestVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "inventoryNeedsVerification" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRoomMapping" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "externalRoomId" TEXT NOT NULL,
    "externalRoomName" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRoomMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRatePlanMapping" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "roomTypeId" TEXT,
    "externalRatePlanId" TEXT NOT NULL,
    "externalRatePlanName" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRatePlanMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReservation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalReservationId" TEXT NOT NULL,
    "reservationId" TEXT,
    "externalStatus" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "importError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelWebhookEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSyncLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "jobId" TEXT,
    "operation" "SyncOperation" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB,
    "dedupeKey" TEXT,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelInventory" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" INTEGER NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRate" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRestriction" (
    "id" TEXT NOT NULL,
    "channelId" TEXT,
    "roomTypeId" TEXT,
    "ratePlanId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "stopSell" BOOLEAN NOT NULL DEFAULT false,
    "minStay" INTEGER,
    "maxStay" INTEGER,
    "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
    "closedToDeparture" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "descriptionBn" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'sparkles',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "category" "GalleryCategory" NOT NULL,
    "url" TEXT NOT NULL,
    "altEn" TEXT NOT NULL DEFAULT '',
    "altAr" TEXT NOT NULL DEFAULT '',
    "altBn" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "error" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowEnds" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_slug_key" ON "Hotel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HotelSetting_hotelId_key_key" ON "HotelSetting"("hotelId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_key_key" ON "Amenity"("key");

-- CreateIndex
CREATE INDEX "RoomType_hotelId_isActive_idx" ON "RoomType"("hotelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_hotelId_slug_key" ON "RoomType"("hotelId", "slug");

-- CreateIndex
CREATE INDEX "RoomImage_roomTypeId_sortOrder_idx" ON "RoomImage"("roomTypeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Room_roomTypeId_isActive_idx" ON "Room"("roomTypeId", "isActive");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Room_hotelId_number_key" ON "Room"("hotelId", "number");

-- CreateIndex
CREATE INDEX "RoomBlock_roomId_startDate_endDate_idx" ON "RoomBlock"("roomId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "RoomStatusLog_roomId_createdAt_idx" ON "RoomStatusLog"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "HousekeepingTask_status_createdAt_idx" ON "HousekeepingTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HousekeepingTask_roomId_idx" ON "HousekeepingTask"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_code_key" ON "RatePlan"("code");

-- CreateIndex
CREATE INDEX "RoomRate_roomTypeId_startDate_endDate_idx" ON "RoomRate"("roomTypeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PricingRule_type_isActive_idx" ON "PricingRule"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Guest_email_idx" ON "Guest"("email");

-- CreateIndex
CREATE INDEX "Guest_phone_idx" ON "Guest"("phone");

-- CreateIndex
CREATE INDEX "Guest_lastName_firstName_idx" ON "Guest"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_number_key" ON "Reservation"("number");

-- CreateIndex
CREATE INDEX "Reservation_status_checkIn_idx" ON "Reservation"("status", "checkIn");

-- CreateIndex
CREATE INDEX "Reservation_checkIn_checkOut_idx" ON "Reservation"("checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Reservation_guestId_idx" ON "Reservation"("guestId");

-- CreateIndex
CREATE INDEX "Reservation_source_createdAt_idx" ON "Reservation"("source", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_paymentStatus_idx" ON "Reservation"("paymentStatus");

-- CreateIndex
CREATE INDEX "Reservation_createdAt_idx" ON "Reservation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_source_externalReservationId_key" ON "Reservation"("source", "externalReservationId");

-- CreateIndex
CREATE INDEX "ReservationRoom_roomTypeId_isBlocking_checkIn_checkOut_idx" ON "ReservationRoom"("roomTypeId", "isBlocking", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "ReservationRoom_roomId_isBlocking_checkIn_checkOut_idx" ON "ReservationRoom"("roomId", "isBlocking", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "ReservationRoom_reservationId_idx" ON "ReservationRoom"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationNote_reservationId_createdAt_idx" ON "ReservationNote"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "ModificationRequest_status_createdAt_idx" ON "ModificationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "Payment_receivedAt_idx" ON "Payment"("receivedAt");

-- CreateIndex
CREATE INDEX "Payment_source_status_idx" ON "Payment"("source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerReference_key" ON "Payment"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "Refund_reservationId_idx" ON "Refund"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_reservationId_postedAt_idx" ON "FinancialTransaction"("reservationId", "postedAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_type_postedAt_idx" ON "FinancialTransaction"("type", "postedAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_source_postedAt_idx" ON "FinancialTransaction"("source", "postedAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_category_postedAt_idx" ON "FinancialTransaction"("category", "postedAt");

-- CreateIndex
CREATE INDEX "AdditionalCharge_reservationId_idx" ON "AdditionalCharge"("reservationId");

-- CreateIndex
CREATE INDEX "TaxTransaction_reservationId_idx" ON "TaxTransaction"("reservationId");

-- CreateIndex
CREATE INDEX "TaxTransaction_taxCode_postedAt_idx" ON "TaxTransaction"("taxCode", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_reservationId_idx" ON "Invoice"("reservationId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "OTAPayout_status_idx" ON "OTAPayout"("status");

-- CreateIndex
CREATE INDEX "OTAPayout_reservationId_idx" ON "OTAPayout"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "OTAPayout_channelId_externalPayoutId_key" ON "OTAPayout"("channelId", "externalPayoutId");

-- CreateIndex
CREATE INDEX "OTACommission_channelId_status_idx" ON "OTACommission"("channelId", "status");

-- CreateIndex
CREATE INDEX "OTACommission_reservationId_idx" ON "OTACommission"("reservationId");

-- CreateIndex
CREATE INDEX "BankReceipt_payoutId_idx" ON "BankReceipt"("payoutId");

-- CreateIndex
CREATE INDEX "BankReceipt_receivedOn_idx" ON "BankReceipt"("receivedOn");

-- CreateIndex
CREATE INDEX "ReconciliationRecord_reservationId_createdAt_idx" ON "ReconciliationRecord"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationRecord_status_idx" ON "ReconciliationRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_channelId_key" ON "ChannelConnection"("channelId");

-- CreateIndex
CREATE INDEX "ChannelRoomMapping_channelId_roomTypeId_idx" ON "ChannelRoomMapping"("channelId", "roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoomMapping_channelId_externalRoomId_key" ON "ChannelRoomMapping"("channelId", "externalRoomId");

-- CreateIndex
CREATE INDEX "ChannelRatePlanMapping_channelId_ratePlanId_idx" ON "ChannelRatePlanMapping"("channelId", "ratePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRatePlanMapping_channelId_externalRatePlanId_key" ON "ChannelRatePlanMapping"("channelId", "externalRatePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReservation_reservationId_key" ON "ChannelReservation"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReservation_channelId_externalReservationId_key" ON "ChannelReservation"("channelId", "externalReservationId");

-- CreateIndex
CREATE INDEX "ChannelWebhookEvent_status_receivedAt_idx" ON "ChannelWebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelWebhookEvent_channelId_externalEventId_key" ON "ChannelWebhookEvent"("channelId", "externalEventId");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_channelId_startedAt_idx" ON "ChannelSyncLog"("channelId", "startedAt");

-- CreateIndex
CREATE INDEX "ChannelSyncLog_status_idx" ON "ChannelSyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncJob_status_runAt_idx" ON "SyncJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "SyncJob_channelId_dedupeKey_status_idx" ON "SyncJob"("channelId", "dedupeKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelInventory_channelId_roomTypeId_date_key" ON "ChannelInventory"("channelId", "roomTypeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRate_channelId_roomTypeId_ratePlanId_date_key" ON "ChannelRate"("channelId", "roomTypeId", "ratePlanId", "date");

-- CreateIndex
CREATE INDEX "ChannelRestriction_startDate_endDate_isActive_idx" ON "ChannelRestriction"("startDate", "endDate", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_hotelId_slug_key" ON "Facility"("hotelId", "slug");

-- CreateIndex
CREATE INDEX "GalleryImage_category_sortOrder_idx" ON "GalleryImage"("category", "sortOrder");

-- CreateIndex
CREATE INDEX "ContactMessage_isRead_createdAt_idx" ON "ContactMessage"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_referenceId_idx" ON "NotificationLog"("referenceId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowEnds_idx" ON "RateLimitBucket"("windowEnds");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelSetting" ADD CONSTRAINT "HotelSetting_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAmenity" ADD CONSTRAINT "RoomAmenity_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAmenity" ADD CONSTRAINT "RoomAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomImage" ADD CONSTRAINT "RoomImage_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBlock" ADD CONSTRAINT "RoomBlock_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomStatusLog" ADD CONSTRAINT "RoomStatusLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomStatusLog" ADD CONSTRAINT "RoomStatusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomRate" ADD CONSTRAINT "RoomRate_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomRate" ADD CONSTRAINT "RoomRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRoomType" ADD CONSTRAINT "PromotionRoomType_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRoomType" ADD CONSTRAINT "PromotionRoomType_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationNote" ADD CONSTRAINT "ReservationNote_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModificationRequest" ADD CONSTRAINT "ModificationRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdditionalCharge" ADD CONSTRAINT "AdditionalCharge_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxTransaction" ADD CONSTRAINT "TaxTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OTAPayout" ADD CONSTRAINT "OTAPayout_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OTAPayout" ADD CONSTRAINT "OTAPayout_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OTACommission" ADD CONSTRAINT "OTACommission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OTACommission" ADD CONSTRAINT "OTACommission_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReceipt" ADD CONSTRAINT "BankReceipt_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "OTAPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReceipt" ADD CONSTRAINT "BankReceipt_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRecord" ADD CONSTRAINT "ReconciliationRecord_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "OTAPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoomMapping" ADD CONSTRAINT "ChannelRoomMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoomMapping" ADD CONSTRAINT "ChannelRoomMapping_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRatePlanMapping" ADD CONSTRAINT "ChannelRatePlanMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRatePlanMapping" ADD CONSTRAINT "ChannelRatePlanMapping_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRatePlanMapping" ADD CONSTRAINT "ChannelRatePlanMapping_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReservation" ADD CONSTRAINT "ChannelReservation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelWebhookEvent" ADD CONSTRAINT "ChannelWebhookEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSyncLog" ADD CONSTRAINT "ChannelSyncLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInventory" ADD CONSTRAINT "ChannelInventory_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInventory" ADD CONSTRAINT "ChannelInventory_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRate" ADD CONSTRAINT "ChannelRate_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRate" ADD CONSTRAINT "ChannelRate_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRate" ADD CONSTRAINT "ChannelRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRestriction" ADD CONSTRAINT "ChannelRestriction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRestriction" ADD CONSTRAINT "ChannelRestriction_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRestriction" ADD CONSTRAINT "ChannelRestriction_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
