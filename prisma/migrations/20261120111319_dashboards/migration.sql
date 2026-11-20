-- Dashboards: every issue belongs to exactly one dashboard.
-- Hand-edited from the generated draft so existing issues are kept: they all
-- move into a default "Jiji" dashboard before the column becomes NOT NULL.

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- Names are unique regardless of case. Prisma cannot express this index in
-- schema.prisma; see the comment on the Dashboard model.
CREATE UNIQUE INDEX "Dashboard_name_lower_key" ON "Dashboard" (lower("name"));

-- Default dashboard for the issues that already exist.
INSERT INTO "Dashboard" ("id", "name", "updatedAt")
VALUES ('default-dashboard', 'Jiji', CURRENT_TIMESTAMP);

-- AlterTable: add as nullable, backfill, then require it.
ALTER TABLE "Issue" ADD COLUMN "dashboardId" TEXT;
UPDATE "Issue" SET "dashboardId" = 'default-dashboard';
ALTER TABLE "Issue" ALTER COLUMN "dashboardId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Issue_dashboardId_status_idx" ON "Issue"("dashboardId", "status");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
