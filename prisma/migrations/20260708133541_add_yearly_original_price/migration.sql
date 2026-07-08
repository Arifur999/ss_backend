-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "yearly_original_price" DECIMAL(15,2) NOT NULL DEFAULT 7188,
ALTER COLUMN "yearly_price" SET DEFAULT 5780;
