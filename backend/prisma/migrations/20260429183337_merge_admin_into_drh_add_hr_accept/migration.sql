/*
  Warnings:

  - The values [PENDING_ADMIN] on the enum `LeaveStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ADMIN] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LeaveStatus_new" AS ENUM ('PENDING_MANAGER', 'APPROVED_BY_MANAGER', 'PENDING_DRH', 'PENDING_HR_ACCEPT', 'PENDING_HR', 'RESERVED', 'TREATED', 'REJECTED_BY_MANAGER', 'CANCELLED');
ALTER TABLE "public"."leave_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leave_requests" ALTER COLUMN "status" TYPE "LeaveStatus_new" USING ("status"::text::"LeaveStatus_new");
ALTER TYPE "LeaveStatus" RENAME TO "LeaveStatus_old";
ALTER TYPE "LeaveStatus_new" RENAME TO "LeaveStatus";
DROP TYPE "public"."LeaveStatus_old";
ALTER TABLE "leave_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING_MANAGER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR', 'DRH');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';
COMMIT;
