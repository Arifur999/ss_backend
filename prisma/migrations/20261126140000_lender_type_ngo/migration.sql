-- Microfinance is its own kind of lender.
--
-- A shop here borrows from an NGO as often as from a bank, and calling that
-- "person" put it on the wrong row of every loan summary.
--
-- Alone in its own migration on purpose: Postgres allows ALTER TYPE ... ADD
-- VALUE inside a transaction (which is how Prisma runs a migration file) only
-- while the new value is not USED in that same transaction. Nothing here uses
-- it; the next migration, and the application, are separate transactions.

ALTER TYPE "LenderType" ADD VALUE IF NOT EXISTS 'ngo';
