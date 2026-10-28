-- Make the wallet ledger append-only.
--
-- The platform stores a balance AND a transaction row for every movement, and
-- treats the ledger as the source of truth that the balance is reconciled
-- against. That claim only means something if the ledger cannot be rewritten:
-- a journal somebody can UPDATE is not evidence of anything, and the
-- reconciliation that compares the two would simply agree with whatever was
-- most recently forged.
--
-- No application code updates or deletes these rows today - this stops it ever
-- starting by accident, including from a psql prompt at 3am during an incident,
-- which is precisely when someone is most tempted to "just fix" a balance.
--
-- Corrections are made by APPENDING a compensating entry (an ADJUSTMENT), the
-- way every double-entry system has worked for several centuries. The mistake
-- and its correction both remain visible, which is the point.

CREATE OR REPLACE FUNCTION wallet_transactions_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'wallet_transactions is append-only: % is not permitted. Correct a mistake by inserting a compensating ADJUSTMENT entry, never by altering history.',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_transactions_no_update ON wallet_transactions;
CREATE TRIGGER wallet_transactions_no_update
  BEFORE UPDATE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_append_only();

DROP TRIGGER IF EXISTS wallet_transactions_no_delete ON wallet_transactions;
CREATE TRIGGER wallet_transactions_no_delete
  BEFORE DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION wallet_transactions_append_only();

-- Reconciliation groups by wallet and sums amounts, on every wallet, nightly.
-- Without this index that is a sequential scan of the whole ledger.
CREATE INDEX IF NOT EXISTS "wallet_transactions_walletId_idx"
  ON wallet_transactions ("walletId");
