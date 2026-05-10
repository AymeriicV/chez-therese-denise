ALTER TABLE "FoodLabel"
ADD COLUMN "productionBatchId" TEXT;

CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "quantityProduced" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'portion',
    "preparedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "shelfLifeHours" INTEGER NOT NULL DEFAULT 72,
    "storageArea" TEXT,
    "conservationTemperature" TEXT,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalIngredientCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wasteQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "wasteReason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionConsumption" (
    "id" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantityConsumed" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCostSnapshot" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionBatch_restaurantId_lotNumber_key" ON "ProductionBatch"("restaurantId", "lotNumber");

ALTER TABLE "FoodLabel" ADD CONSTRAINT "FoodLabel_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
