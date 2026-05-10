ALTER TABLE "TemperatureLog"
ADD COLUMN "equipmentId" TEXT,
ADD COLUMN "equipmentType" TEXT,
ADD COLUMN "service" TEXT,
ADD COLUMN "checkDate" TIMESTAMP(3);

CREATE TABLE "TemperatureEquipment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "minCelsius" DECIMAL(5, 2),
    "maxCelsius" DECIMAL(5, 2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemperatureEquipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HaccpTaskValidation" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "responsible" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HaccpTaskValidation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HaccpTask" ADD COLUMN "completedByUserId" TEXT;

ALTER TABLE "FoodLabel"
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "expiryKind" TEXT NOT NULL DEFAULT 'DLC',
ADD COLUMN "conservationTemperature" TEXT;

CREATE UNIQUE INDEX "TemperatureEquipment_restaurantId_name_key" ON "TemperatureEquipment"("restaurantId", "name");

ALTER TABLE "TemperatureEquipment" ADD CONSTRAINT "TemperatureEquipment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemperatureLog" ADD CONSTRAINT "TemperatureLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "TemperatureEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HaccpTaskValidation" ADD CONSTRAINT "HaccpTaskValidation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HaccpTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
