ALTER TABLE "InventoryItem"
ADD COLUMN "averageWeightGrams" DECIMAL(12,3),
ADD COLUMN "edibleYieldRate" DECIMAL(5,4),
ADD COLUMN "weightSource" TEXT;
