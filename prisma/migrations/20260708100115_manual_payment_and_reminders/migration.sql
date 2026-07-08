-- AlterTable
ALTER TABLE "subscription_payments" ADD COLUMN     "sender_number" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trx_id" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "bkash_number" TEXT NOT NULL DEFAULT '',
    "bkash_qr_url" TEXT NOT NULL DEFAULT '',
    "yearly_price" DECIMAL(15,2) NOT NULL DEFAULT 5750,
    "reminder_subject" TEXT NOT NULL DEFAULT 'Your subscription expires in {{days_left}} days',
    "reminder_body" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "days_before" INTEGER NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_owner_id_days_before_expiry_date_key" ON "reminder_logs"("owner_id", "days_before", "expiry_date");
