-- AlterTable: add the optional "to" side of a profit-withdrawal month range.
ALTER TABLE "profit_withdrawals" ADD COLUMN "to_month" INTEGER;
ALTER TABLE "profit_withdrawals" ADD COLUMN "to_year" INTEGER;
