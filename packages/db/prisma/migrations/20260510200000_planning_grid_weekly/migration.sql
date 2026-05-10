-- CreateTable
CREATE TABLE "PlanningSchedule" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weeklyTargetMinutes" INTEGER NOT NULL DEFAULT 0,
    "position" TEXT NOT NULL,
    "comment" TEXT,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningScheduleDay" (
    "id" TEXT NOT NULL,
    "planningScheduleId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "morningStart" TEXT,
    "morningEnd" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "eveningStart" TEXT,
    "eveningEnd" TEXT,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningSchedule_restaurantId_userId_weekStart_key" ON "PlanningSchedule"("restaurantId", "userId", "weekStart");
CREATE UNIQUE INDEX "PlanningScheduleDay_planningScheduleId_weekday_key" ON "PlanningScheduleDay"("planningScheduleId", "weekday");

-- AddForeignKey
ALTER TABLE "PlanningSchedule" ADD CONSTRAINT "PlanningSchedule_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanningSchedule" ADD CONSTRAINT "PlanningSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanningScheduleDay" ADD CONSTRAINT "PlanningScheduleDay_planningScheduleId_fkey" FOREIGN KEY ("planningScheduleId") REFERENCES "PlanningSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
