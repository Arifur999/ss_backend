-- One attendance row per employee per day, enforced by the database.
--
-- The service did findFirst-then-create, which is a read followed by a write: two
-- requests for the same employee-day both found nothing and both created a row,
-- and payroll then counted that day twice. MonthlyTarget has had this constraint
-- from the start; Attendance never did.
--
-- Existing duplicates have to go first or ADD CONSTRAINT refuses. The row kept is
-- the one created LAST, on the reasoning that a second entry for a day the
-- operator had already recorded was them correcting it. Nothing is deleted unless
-- there is another row for the same owner, employee and date - a single row is
-- never touched, whatever it contains.
--
-- The whole thing is guarded so re-running the migration is harmless.

DELETE FROM "attendance" a
USING "attendance" b
WHERE a."owner_id"    = b."owner_id"
  AND a."employee_id" = b."employee_id"
  AND a."date"        = b."date"
  AND (
        a."created_at" < b."created_at"
        -- Same timestamp to the millisecond: fall back to the id so exactly one
        -- of the pair is chosen and the delete cannot remove both.
        OR (a."created_at" = b."created_at" AND a."id" < b."id")
      );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_owner_id_employee_id_date_key'
    ) THEN
        ALTER TABLE "attendance"
            ADD CONSTRAINT "attendance_owner_id_employee_id_date_key"
            UNIQUE ("owner_id", "employee_id", "date");
    END IF;
END $$;
