-- Record the payment rail's cut alongside every movement.
--
-- Until now the platform absorbed it silently: a 250 XAF deposit credited 250
-- to the wallet while only 242 reached our Fapshi balance. The loss appeared in
-- no record at all, and surfaced only because the Fapshi dashboard and the
-- wallet disagreed.
--
-- Two columns rather than one, because the fee is ESTIMATED when charged and
-- only KNOWN once the provider settles:
--   providerFee        what we charged on top, from the configured rate
--   providerFeeActual  what the provider really took (its amount - its revenue)
-- Keeping both is what makes a wrong rate visible instead of a slow leak.
--
-- Nullable, so every row that predates this reads as "not recorded" rather than
-- claiming a fee of zero was charged.
ALTER TABLE "payment_transactions"
  ADD COLUMN "providerFee" DECIMAL(20,4),
  ADD COLUMN "providerFeeActual" DECIMAL(20,4);
