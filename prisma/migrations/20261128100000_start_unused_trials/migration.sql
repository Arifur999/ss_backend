-- Open the trial for everyone who registered and never got one.
--
-- Registration used to leave plan_status "expired" with start and expiry on
-- the same instant, waiting for the owner to press a card on /choose-plan.
-- Anyone who did not press it has a workspace that refuses every request -
-- hasActiveOwnerAccess reads plan_status and expiry_date and nothing else -
-- and they have done nothing wrong. Registration now starts the trial; this
-- does the same for the accounts already in that state.
--
-- Only accounts that never started one:
--   trial_used = false            the trial is still theirs to have
--   expiry_date <= start_date     the shape registration left behind; a real
--                                 plan always has an expiry after its start
--   status not blocked            a banned sign-up must not lift its own ban
--   plan_status not suspended     likewise
--
-- Their fourteen days run from whichever is still worth having: the window
-- registration wrote (trial_end), or a fresh fourteen days from now for
-- somebody whose window has already slipped past while they could not get in.

UPDATE owner_subscriptions
SET
    plan_status = 'active',
    status = 'trial',
    plan = 'Trial',
    plan_type = 'free_trial',
    trial_used = true,
    start_date = NOW(),
    trial_start = NOW(),
    expiry_date = CASE WHEN trial_end > NOW() THEN trial_end ELSE NOW() + INTERVAL '14 days' END,
    trial_end   = CASE WHEN trial_end > NOW() THEN trial_end ELSE NOW() + INTERVAL '14 days' END,
    active_until = CASE WHEN trial_end > NOW() THEN trial_end ELSE NOW() + INTERVAL '14 days' END
WHERE trial_used = false
  AND expiry_date IS NOT NULL
  AND start_date IS NOT NULL
  AND expiry_date <= start_date
  AND status <> 'blocked'
  AND plan_status <> 'suspended';
