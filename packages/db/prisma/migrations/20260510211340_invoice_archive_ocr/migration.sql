-- AlterTable
ALTER TABLE "SupplierInvoice" ADD COLUMN     "storedName" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SupplierInvoiceLine" ADD COLUMN     "inventoryItemId" TEXT;

-- CreateTable
CREATE TABLE "SupplierInvoiceTemplate" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "name" TEXT,
    "numberPattern" TEXT,
    "keywordHints" JSONB,
    "lineHints" JSONB,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierInvoiceTemplate_restaurantId_supplierId_idx" ON "SupplierInvoiceTemplate"("restaurantId", "supplierId");

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SupplierInvoiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceTemplate" ADD CONSTRAINT "SupplierInvoiceTemplate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceTemplate" ADD CONSTRAINT "SupplierInvoiceTemplate_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
