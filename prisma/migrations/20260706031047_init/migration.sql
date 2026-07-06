-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'owner', 'manager', 'sales_staff', 'accountant');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('pending', 'trial', 'active', 'expired', 'blocked');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('free_trial', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('active', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('cash', 'bank', 'mfs', 'personal', 'other');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('pending', 'partial', 'received');

-- CreateEnum
CREATE TYPE "ReceiveCondition" AS ENUM ('good', 'damaged', 'partial');

-- CreateEnum
CREATE TYPE "InventoryChangeType" AS ENUM ('purchase_in', 'sales_out', 'transfer_in', 'transfer_out', 'adjustment');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('draft', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'partial', 'delivered');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('bank', 'personal');

-- CreateEnum
CREATE TYPE "LoanTransactionType" AS ENUM ('receive', 'payment');

-- CreateEnum
CREATE TYPE "LenderType" AS ENUM ('bank', 'person', 'boss');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('supplier', 'other');

-- CreateEnum
CREATE TYPE "BatchSourceType" AS ENUM ('opening_stock', 'purchase_receive', 'adjustment');

-- CreateEnum
CREATE TYPE "CostLayerSourceType" AS ENUM ('fifo', 'preorder', 'manual');

-- CreateEnum
CREATE TYPE "SubPaymentStatus" AS ENUM ('paid', 'pending', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL DEFAULT '',
    "supplier_id" TEXT,
    "selling_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "size" TEXT,
    "weight" TEXT,
    "opening_qty" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "si_no" TEXT NOT NULL,
    "supplier_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "due_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "shipping_status" "ShippingStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "branch_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "dp_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "actual_dp" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sp_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sp_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receives" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "purchase_item_id" TEXT NOT NULL,
    "receive_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiver_name" TEXT NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "condition" "ReceiveCondition" NOT NULL DEFAULT 'good',
    "branch_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "purchase_id" TEXT,
    "purchase_si_no" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "available_qty" INTEGER NOT NULL DEFAULT 0,
    "upcoming_qty" INTEGER NOT NULL DEFAULT 0,
    "dp_price" DECIMAL(15,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_history" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "branch_id" TEXT,
    "branch_name" TEXT NOT NULL DEFAULT '',
    "change_type" "InventoryChangeType" NOT NULL,
    "qty_change" INTEGER NOT NULL,
    "qty_before" INTEGER NOT NULL DEFAULT 0,
    "qty_after" INTEGER NOT NULL DEFAULT 0,
    "reference_id" TEXT,
    "reference_type" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "purchase_item_id" TEXT,
    "purchase_receive_id" TEXT,
    "source_type" "BatchSourceType" NOT NULL DEFAULT 'purchase_receive',
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "remaining_qty" INTEGER NOT NULL DEFAULT 0,
    "dp_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "mrp_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "received_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareholder_id" TEXT,
    "shareholder_name" TEXT NOT NULL,
    "invest_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withdraw_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_withdrawals" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareholder_id" TEXT,
    "shareholder_name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "profit_month" INTEGER,
    "profit_year" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profit_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_lenders" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender_type" "LenderType" NOT NULL DEFAULT 'person',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_lenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lender_id" TEXT,
    "lender_name" TEXT NOT NULL,
    "loan_type" "LoanType" NOT NULL DEFAULT 'personal',
    "transaction_type" "LoanTransactionType" NOT NULL DEFAULT 'receive',
    "received_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payment_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "interest_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_account_id" TEXT,
    "from_account_name" TEXT NOT NULL,
    "to_account_id" TEXT,
    "to_account_name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category_id" TEXT,
    "category_name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "branch_id" TEXT,
    "branch_name" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_incomes" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "income_type" "IncomeType" NOT NULL DEFAULT 'supplier',
    "supplier_id" TEXT,
    "supplier_name" TEXT NOT NULL DEFAULT '',
    "source_name" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "join_date" DATE NOT NULL,
    "resign_date" DATE,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_transactions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_type" TEXT NOT NULL DEFAULT 'Salary',
    "category_id" TEXT,
    "category_name" TEXT NOT NULL DEFAULT '',
    "period_from" DATE,
    "period_to" DATE,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL DEFAULT '',
    "expense_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TEXT,
    "end_time" TEXT,
    "total_hours" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL DEFAULT '',
    "customer_address" TEXT NOT NULL DEFAULT '',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "due_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL DEFAULT '',
    "branch_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "SaleStatus" NOT NULL DEFAULT 'completed',
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "selling_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "actual_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "delivered_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL DEFAULT '',
    "account_id" TEXT,
    "account_name" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_deliveries" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "delivery_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_qty" INTEGER NOT NULL DEFAULT 0,
    "delivered_by" TEXT NOT NULL DEFAULT '',
    "branch_id" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "sale_id" TEXT,
    "invoice_no" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "account_name" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item_cost_layers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "sale_item_id" TEXT,
    "product_id" TEXT,
    "inventory_batch_id" TEXT,
    "source_type" "CostLayerSourceType" NOT NULL DEFAULT 'fifo',
    "qty" INTEGER NOT NULL DEFAULT 0,
    "dp_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cost_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_item_cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL DEFAULT 'আমার ফার্নিচার',
    "name_en" TEXT NOT NULL DEFAULT 'My Furniture',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "trade_license" TEXT NOT NULL DEFAULT '',
    "logo_url" TEXT NOT NULL DEFAULT '',
    "currency_symbol" TEXT NOT NULL DEFAULT '৳',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shareholders" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "share_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "opening_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT NOT NULL DEFAULT '',
    "person_name" TEXT NOT NULL DEFAULT '',
    "due_type" TEXT NOT NULL DEFAULT 'dena',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "opening_due" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "opening_due" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_targets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sales_target" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "profit_target" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "monthly_budget" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" TEXT NOT NULL DEFAULT '',
    "role" "Role" NOT NULL DEFAULT 'owner',
    "phone" TEXT NOT NULL DEFAULT '',
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" TEXT,
    "last_active" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_subscriptions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL DEFAULT '',
    "owner_email" TEXT NOT NULL DEFAULT '',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'Trial',
    "trial_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_end" TIMESTAMP(3) NOT NULL,
    "active_until" TIMESTAMP(3),
    "plan_type" "PlanType" NOT NULL DEFAULT 'free_trial',
    "plan_status" "PlanStatus" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "blocked_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL DEFAULT '',
    "plan_type" "PlanType" NOT NULL DEFAULT 'monthly',
    "method" TEXT NOT NULL DEFAULT '',
    "status" "SubPaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycle_bin_items" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "table_name" TEXT NOT NULL DEFAULT '',
    "data" JSONB,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" TEXT,

    CONSTRAINT "recycle_bin_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activities" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "actor_email" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_owner_id_idx" ON "products"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_owner_id_product_code_key" ON "products"("owner_id", "product_code");

-- CreateIndex
CREATE INDEX "purchases_owner_id_idx" ON "purchases"("owner_id");

-- CreateIndex
CREATE INDEX "purchases_date_idx" ON "purchases"("date");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_owner_id_si_no_key" ON "purchases"("owner_id", "si_no");

-- CreateIndex
CREATE INDEX "purchase_items_owner_id_idx" ON "purchase_items"("owner_id");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_receives_owner_id_idx" ON "purchase_receives"("owner_id");

-- CreateIndex
CREATE INDEX "purchase_receives_purchase_id_idx" ON "purchase_receives"("purchase_id");

-- CreateIndex
CREATE INDEX "supplier_payments_owner_id_idx" ON "supplier_payments"("owner_id");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments"("supplier_id");

-- CreateIndex
CREATE INDEX "inventory_product_id_idx" ON "inventory"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_owner_id_product_id_key" ON "inventory"("owner_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_history_owner_id_idx" ON "inventory_history"("owner_id");

-- CreateIndex
CREATE INDEX "inventory_history_product_id_idx" ON "inventory_history"("product_id");

-- CreateIndex
CREATE INDEX "inventory_batches_owner_id_idx" ON "inventory_batches"("owner_id");

-- CreateIndex
CREATE INDEX "inventory_batches_product_id_received_date_idx" ON "inventory_batches"("product_id", "received_date");

-- CreateIndex
CREATE INDEX "investments_owner_id_idx" ON "investments"("owner_id");

-- CreateIndex
CREATE INDEX "investments_date_idx" ON "investments"("date");

-- CreateIndex
CREATE INDEX "profit_withdrawals_owner_id_idx" ON "profit_withdrawals"("owner_id");

-- CreateIndex
CREATE INDEX "profit_withdrawals_date_idx" ON "profit_withdrawals"("date");

-- CreateIndex
CREATE INDEX "loan_lenders_owner_id_idx" ON "loan_lenders"("owner_id");

-- CreateIndex
CREATE INDEX "loans_owner_id_idx" ON "loans"("owner_id");

-- CreateIndex
CREATE INDEX "loans_date_idx" ON "loans"("date");

-- CreateIndex
CREATE INDEX "account_transfers_owner_id_idx" ON "account_transfers"("owner_id");

-- CreateIndex
CREATE INDEX "account_transfers_date_idx" ON "account_transfers"("date");

-- CreateIndex
CREATE INDEX "expenses_owner_id_idx" ON "expenses"("owner_id");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "other_incomes_owner_id_idx" ON "other_incomes"("owner_id");

-- CreateIndex
CREATE INDEX "other_incomes_date_idx" ON "other_incomes"("date");

-- CreateIndex
CREATE INDEX "employees_owner_id_idx" ON "employees"("owner_id");

-- CreateIndex
CREATE INDEX "salary_transactions_owner_id_idx" ON "salary_transactions"("owner_id");

-- CreateIndex
CREATE INDEX "salary_transactions_employee_id_idx" ON "salary_transactions"("employee_id");

-- CreateIndex
CREATE INDEX "attendance_owner_id_idx" ON "attendance"("owner_id");

-- CreateIndex
CREATE INDEX "attendance_employee_id_date_idx" ON "attendance"("employee_id", "date");

-- CreateIndex
CREATE INDEX "sales_owner_id_idx" ON "sales"("owner_id");

-- CreateIndex
CREATE INDEX "sales_date_idx" ON "sales"("date");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_delivery_status_idx" ON "sales"("delivery_status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_owner_id_invoice_no_key" ON "sales"("owner_id", "invoice_no");

-- CreateIndex
CREATE INDEX "sale_items_owner_id_idx" ON "sale_items"("owner_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_owner_id_idx" ON "sale_payments"("owner_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_deliveries_owner_id_idx" ON "sale_deliveries"("owner_id");

-- CreateIndex
CREATE INDEX "sale_deliveries_sale_id_idx" ON "sale_deliveries"("sale_id");

-- CreateIndex
CREATE INDEX "sale_deliveries_delivery_date_idx" ON "sale_deliveries"("delivery_date");

-- CreateIndex
CREATE INDEX "customer_payments_owner_id_idx" ON "customer_payments"("owner_id");

-- CreateIndex
CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments"("customer_id");

-- CreateIndex
CREATE INDEX "sale_item_cost_layers_owner_id_idx" ON "sale_item_cost_layers"("owner_id");

-- CreateIndex
CREATE INDEX "sale_item_cost_layers_sale_item_id_idx" ON "sale_item_cost_layers"("sale_item_id");

-- CreateIndex
CREATE INDEX "sale_item_cost_layers_product_id_idx" ON "sale_item_cost_layers"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_settings_owner_id_key" ON "business_settings"("owner_id");

-- CreateIndex
CREATE INDEX "shareholders_owner_id_idx" ON "shareholders"("owner_id");

-- CreateIndex
CREATE INDEX "accounts_owner_id_idx" ON "accounts"("owner_id");

-- CreateIndex
CREATE INDEX "suppliers_owner_id_idx" ON "suppliers"("owner_id");

-- CreateIndex
CREATE INDEX "customers_owner_id_idx" ON "customers"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_targets_owner_id_year_month_key" ON "monthly_targets"("owner_id", "year", "month");

-- CreateIndex
CREATE INDEX "expense_categories_owner_id_idx" ON "expense_categories"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_owner_id_idx" ON "users"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_subscriptions_owner_id_key" ON "owner_subscriptions"("owner_id");

-- CreateIndex
CREATE INDEX "owner_subscriptions_plan_status_idx" ON "owner_subscriptions"("plan_status");

-- CreateIndex
CREATE INDEX "owner_subscriptions_expiry_date_idx" ON "owner_subscriptions"("expiry_date");

-- CreateIndex
CREATE INDEX "subscription_payments_owner_id_idx" ON "subscription_payments"("owner_id");

-- CreateIndex
CREATE INDEX "recycle_bin_items_owner_id_type_idx" ON "recycle_bin_items"("owner_id", "type");

-- CreateIndex
CREATE INDEX "admin_activities_owner_id_idx" ON "admin_activities"("owner_id");

-- CreateIndex
CREATE INDEX "admin_activities_created_at_idx" ON "admin_activities"("created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receives" ADD CONSTRAINT "purchase_receives_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receives" ADD CONSTRAINT "purchase_receives_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_history" ADD CONSTRAINT "inventory_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_receive_id_fkey" FOREIGN KEY ("purchase_receive_id") REFERENCES "purchase_receives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_shareholder_id_fkey" FOREIGN KEY ("shareholder_id") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_withdrawals" ADD CONSTRAINT "profit_withdrawals_shareholder_id_fkey" FOREIGN KEY ("shareholder_id") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_withdrawals" ADD CONSTRAINT "profit_withdrawals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "loan_lenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_deliveries" ADD CONSTRAINT "sale_deliveries_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_cost_layers" ADD CONSTRAINT "sale_item_cost_layers_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_cost_layers" ADD CONSTRAINT "sale_item_cost_layers_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_cost_layers" ADD CONSTRAINT "sale_item_cost_layers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_cost_layers" ADD CONSTRAINT "sale_item_cost_layers_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
