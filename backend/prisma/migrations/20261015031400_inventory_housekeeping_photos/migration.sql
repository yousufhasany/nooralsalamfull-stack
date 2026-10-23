-- AlterEnum
ALTER TYPE "HousekeepingTaskStatus" ADD VALUE 'AWAITING_INSPECTION' BEFORE 'COMPLETED';
ALTER TYPE "HousekeepingTaskStatus" ADD VALUE 'REJECTED' BEFORE 'COMPLETED';

-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('PIECE', 'BOTTLE', 'BOX', 'KG', 'LITRE', 'PACK');

-- CreateEnum
CREATE TYPE "InventoryLocationKind" AS ENUM ('MAIN', 'FLOOR', 'DEPARTMENT', 'IN_TRANSIT');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'CONSUMPTION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssueDepartment" AS ENUM ('HOUSEKEEPING', 'LAUNDRY', 'MAINTENANCE', 'KITCHEN', 'FRONT_DESK', 'OTHER');

-- AlterTable
ALTER TABLE "HousekeepingTask" ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "suppliesDeducted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HousekeepingPhotoCategory" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HousekeepingPhotoCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingPhoto" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HousekeepingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingInspection" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "areas" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "HousekeepingInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "kind" "InventoryLocationKind" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" "InventoryUnit" NOT NULL DEFAULT 'PIECE',
    "minQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "maxQty" DECIMAL(14,3),
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "batchNumber" TEXT NOT NULL DEFAULT '',
    "expiryDate" DATE,
    "imageKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("itemId","locationId")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "previousQty" DECIMAL(14,3) NOT NULL,
    "adjustedQty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingSupplyLine" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "HousekeepingSupplyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryConsumption" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingPhotoCategory_hotelId_code_key" ON "HousekeepingPhotoCategory"("hotelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingPhoto_storageKey_key" ON "HousekeepingPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "HousekeepingPhoto_taskId_categoryId_idx" ON "HousekeepingPhoto"("taskId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingInspection_taskId_attempt_key" ON "HousekeepingInspection"("taskId", "attempt");

-- CreateIndex
CREATE INDEX "HousekeepingInspection_status_submittedAt_idx" ON "HousekeepingInspection"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_hotelId_code_key" ON "InventoryCategory"("hotelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_hotelId_code_key" ON "InventoryLocation"("hotelId", "code");

-- CreateIndex
CREATE INDEX "Supplier_hotelId_isActive_idx" ON "Supplier"("hotelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_hotelId_sku_key" ON "InventoryItem"("hotelId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_hotelId_barcode_key" ON "InventoryItem"("hotelId", "barcode");

-- CreateIndex
CREATE INDEX "InventoryItem_hotelId_isActive_idx" ON "InventoryItem"("hotelId", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_expiryDate_idx" ON "InventoryItem"("expiryDate");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_reference_idx" ON "InventoryMovement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_hotelId_number_key" ON "PurchaseOrder"("hotelId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_orderDate_idx" ON "PurchaseOrder"("status", "orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_orderId_idx" ON "PurchaseOrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_hotelId_number_key" ON "StockTransfer"("hotelId", "number");

-- CreateIndex
CREATE INDEX "StockTransfer_status_createdAt_idx" ON "StockTransfer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");

-- CreateIndex
CREATE INDEX "StockAdjustment_status_createdAt_idx" ON "StockAdjustment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingSupplyLine_taskId_itemId_key" ON "HousekeepingSupplyLine"("taskId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryConsumption_movementId_key" ON "InventoryConsumption"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryConsumption_taskId_itemId_key" ON "InventoryConsumption"("taskId", "itemId");

-- AddForeignKey
ALTER TABLE "HousekeepingPhotoCategory" ADD CONSTRAINT "HousekeepingPhotoCategory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingPhoto" ADD CONSTRAINT "HousekeepingPhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingPhoto" ADD CONSTRAINT "HousekeepingPhoto_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HousekeepingPhotoCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingPhoto" ADD CONSTRAINT "HousekeepingPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingInspection" ADD CONSTRAINT "HousekeepingInspection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingInspection" ADD CONSTRAINT "HousekeepingInspection_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingInspection" ADD CONSTRAINT "HousekeepingInspection_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingSupplyLine" ADD CONSTRAINT "HousekeepingSupplyLine_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingSupplyLine" ADD CONSTRAINT "HousekeepingSupplyLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConsumption" ADD CONSTRAINT "InventoryConsumption_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConsumption" ADD CONSTRAINT "InventoryConsumption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
