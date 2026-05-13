-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'ASSIGN';

-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'PENDING_ADMIN';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "assigned_hr_id" TEXT;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_assigned_hr_id_fkey" FOREIGN KEY ("assigned_hr_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
