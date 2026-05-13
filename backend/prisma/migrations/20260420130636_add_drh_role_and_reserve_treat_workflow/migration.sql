/*
  Warnings:

  - The values [APPROVED,REJECTED_BY_HR] on the enum `LeaveStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'RESERVE';
ALTER TYPE "ActionType" ADD VALUE 'TREAT';
ALTER TYPE "ActionType" ADD VALUE 'CANCEL';

-- AlterEnum
BEGIN;

-- First, convert existing data to new values before swapping enum
UPDATE "leave_requests" SET "status" = 'APPROVED_BY_MANAGER' WHERE "status" = 'APPROVED';
UPDATE "leave_requests" SET "status" = 'REJECTED_BY_MANAGER' WHERE "status" = 'REJECTED_BY_HR';

CREATE TYPE "LeaveStatus_new" AS ENUM ('PENDING_MANAGER', 'APPROVED_BY_MANAGER', 'PENDING_HR', 'RESERVED', 'TREATED', 'REJECTED_BY_MANAGER', 'CANCELLED');
ALTER TABLE "public"."leave_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leave_requests" ALTER COLUMN "status" TYPE "LeaveStatus_new" USING ("status"::text::"LeaveStatus_new");
ALTER TYPE "LeaveStatus" RENAME TO "LeaveStatus_old";
ALTER TYPE "LeaveStatus_new" RENAME TO "LeaveStatus";
DROP TYPE "public"."LeaveStatus_old";
ALTER TABLE "leave_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING_MANAGER';

-- Now transition the APPROVED_BY_MANAGER ones that were originally APPROVED to TREATED
-- (They had gone through the full flow already)
UPDATE "leave_requests" SET "status" = 'TREATED' WHERE "status" = 'APPROVED_BY_MANAGER'
  AND "id" IN (
    SELECT r."id" FROM "leave_requests" r
    JOIN "request_actions" a ON a."request_id" = r."id"
    WHERE a."action" = 'APPROVE' AND a."actor_id" IN (SELECT "id" FROM "users" WHERE "role" = 'HR')
  );

COMMIT;

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DRH';

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "reserved_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reserved_by_id_fkey" FOREIGN KEY ("reserved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
