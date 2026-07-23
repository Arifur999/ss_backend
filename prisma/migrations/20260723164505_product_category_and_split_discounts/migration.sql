-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category" TEXT,
ADD COLUMN     "dp_discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mrp_discount" DECIMAL(5,2) NOT NULL DEFAULT 0;
