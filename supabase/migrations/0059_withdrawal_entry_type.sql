-- =====================================================================
-- KapitPondo — 0059 Ledger entry type for a member's withdrawal payout
-- Its own file: a new enum value can't be used in the transaction that
-- adds it, and 0060's functions post entries of this type.
-- =====================================================================

alter type ledger_entry_type add value if not exists 'withdrawal';
