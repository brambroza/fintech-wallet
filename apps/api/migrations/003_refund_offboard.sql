-- Refunds, quick-price buttons, employee offboarding, HR back-entry after an outage.

-- A refund points at the purchase it reverses; at most one refund per purchase.
ALTER TABLE transactions ADD COLUMN refund_of uuid REFERENCES transactions(id);
CREATE UNIQUE INDEX one_refund_per_purchase ON transactions (refund_of) WHERE refund_of IS NOT NULL;

ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('p2p','topup','payout','goal_deposit','reversal','purchase','welfare','payroll_settle','merchant_payout','refund','offboard'));

-- Shop's preset buttons: [{ "label": "ข้าว 1 อย่าง", "amount": 3500 }, ...]
ALTER TABLE merchants ADD COLUMN quick_amounts jsonb NOT NULL DEFAULT '[]';

-- When HR offboarded the employee (status becomes 'inactive' at the same time).
ALTER TABLE org_members ADD COLUMN offboarded_at timestamptz;
