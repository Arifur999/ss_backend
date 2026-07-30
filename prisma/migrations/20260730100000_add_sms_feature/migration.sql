-- CreateTable
CREATE TABLE "sms_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sms_count" INTEGER NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_wallets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_purchases" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "package_id" TEXT,
    "package_name" TEXT NOT NULL DEFAULT '',
    "sms_count" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL DEFAULT 'bkash_manual',
    "sender_number" TEXT NOT NULL DEFAULT '',
    "trx_id" TEXT NOT NULL DEFAULT '',
    "invoice_no" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "is_unicode" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "shoot_id" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_wallets_owner_id_key" ON "sms_wallets"("owner_id");

-- CreateIndex
CREATE INDEX "sms_purchases_owner_id_idx" ON "sms_purchases"("owner_id");

-- CreateIndex
CREATE INDEX "sms_messages_owner_id_idx" ON "sms_messages"("owner_id");

-- AddForeignKey
ALTER TABLE "sms_wallets" ADD CONSTRAINT "sms_wallets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_purchases" ADD CONSTRAINT "sms_purchases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
