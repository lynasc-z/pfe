-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "QuotaScope" AS ENUM ('ANNUAL', 'PER_OCCURRENCE', 'ONCE_PER_CAREER', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "DurationUnit" AS ENUM ('BUSINESS_DAYS', 'CALENDAR_DAYS');

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "child_birth_date" TIMESTAMP(3),
ADD COLUMN     "child_name" TEXT,
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "wedding_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "cooldown_days" INTEGER,
ADD COLUMN     "duration_unit" "DurationUnit" NOT NULL DEFAULT 'BUSINESS_DAYS',
ADD COLUMN     "fixed_duration" INTEGER,
ADD COLUMN     "gender_restriction" "Gender",
ADD COLUMN     "quota_scope" "QuotaScope" NOT NULL DEFAULT 'ANNUAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" "Gender";
