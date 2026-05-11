-- AlterTable
ALTER TABLE "TemperatureLog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TimeClockLog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "apiKey" TEXT,
    "restaurantExternalId" TEXT,
    "apiUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "connectionStatus" TEXT NOT NULL DEFAULT 'INACTIF',
    "lastTestedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesImport" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "integrationCredentialId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "externalBatchId" TEXT,
    "sourceLabel" TEXT,
    "totalTickets" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTicket" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "integrationCredentialId" TEXT,
    "salesImportId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "ticketNumber" TEXT,
    "ticketDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "sourceChannel" TEXT,
    "customerName" TEXT,
    "tableNumber" TEXT,
    "paymentMethod" TEXT,
    "totalHt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTtc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTicketLine" (
    "id" TEXT NOT NULL,
    "salesTicketId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "recipeId" TEXT,
    "subRecipeId" TEXT,
    "codeArticle" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "totalHt" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2),
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "matchedBy" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTicketLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationCredential_restaurantId_provider_enabled_idx" ON "IntegrationCredential"("restaurantId", "provider", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_restaurantId_provider_key" ON "IntegrationCredential"("restaurantId", "provider");

-- CreateIndex
CREATE INDEX "SalesImport_restaurantId_provider_createdAt_idx" ON "SalesImport"("restaurantId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "SalesTicket_restaurantId_provider_ticketDate_idx" ON "SalesTicket"("restaurantId", "provider", "ticketDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTicket_restaurantId_provider_externalId_key" ON "SalesTicket"("restaurantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "SalesTicketLine_salesTicketId_sortOrder_idx" ON "SalesTicketLine"("salesTicketId", "sortOrder");

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImport" ADD CONSTRAINT "SalesImport_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImport" ADD CONSTRAINT "SalesImport_integrationCredentialId_fkey" FOREIGN KEY ("integrationCredentialId") REFERENCES "IntegrationCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicket" ADD CONSTRAINT "SalesTicket_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicket" ADD CONSTRAINT "SalesTicket_integrationCredentialId_fkey" FOREIGN KEY ("integrationCredentialId") REFERENCES "IntegrationCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicket" ADD CONSTRAINT "SalesTicket_salesImportId_fkey" FOREIGN KEY ("salesImportId") REFERENCES "SalesImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicketLine" ADD CONSTRAINT "SalesTicketLine_salesTicketId_fkey" FOREIGN KEY ("salesTicketId") REFERENCES "SalesTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicketLine" ADD CONSTRAINT "SalesTicketLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicketLine" ADD CONSTRAINT "SalesTicketLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTicketLine" ADD CONSTRAINT "SalesTicketLine_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "SubRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "HaccpTask_restaurantId_templateKey_scheduledForDate_scheduledSe" RENAME TO "HaccpTask_restaurantId_templateKey_scheduledForDate_schedul_key";

-- RenameIndex
ALTER INDEX "PriceHistory_restaurantId_inventoryItemId_supplierId_createdAt_" RENAME TO "PriceHistory_restaurantId_inventoryItemId_supplierId_create_idx";
