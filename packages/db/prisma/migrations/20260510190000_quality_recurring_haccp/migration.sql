ALTER TABLE "HaccpTask"
ADD COLUMN "templateKey" TEXT,
ADD COLUMN "scheduledForDate" TIMESTAMP(3),
ADD COLUMN "scheduledService" TEXT,
ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "HaccpTask_restaurantId_templateKey_scheduledForDate_scheduledService_key"
ON "HaccpTask"("restaurantId", "templateKey", "scheduledForDate", "scheduledService");
