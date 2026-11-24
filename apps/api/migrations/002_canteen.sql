-- Canteen / welfare wallet: multi-tenant orgs (factories), employees, merchants, charges.

-- Employees may be imported before they activate (no PIN yet) and may have no phone (badge-only).
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN line_user_id text UNIQUE;

ALTER TABLE otp_challenges DROP CONSTRAINT otp_challenges_purpose_check;
ALTER TABLE otp_challenges ADD CONSTRAINT otp_challenges_purpose_check CHECK (purpose IN ('register','login','activate'));

CREATE TABLE orgs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  code            text NOT NULL UNIQUE,
  -- credit: employees spend welfare credit, then go negative up to credit_limit; negatives are payroll-deducted.
  -- prepaid: employees top up first; balance never below 0.
  money_mode      text NOT NULL DEFAULT 'credit' CHECK (money_mode IN ('credit','prepaid')),
  credit_limit    bigint NOT NULL DEFAULT 300000 CHECK (credit_limit >= 0),   -- satang, default ฿3,000
  daily_limit     bigint NOT NULL DEFAULT 100000 CHECK (daily_limit > 0),     -- satang, default ฿1,000/day
  welfare_amount  bigint NOT NULL DEFAULT 0 CHECK (welfare_amount >= 0),      -- satang credited per cycle
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('employee','hr','merchant')),
  employee_code  text,
  department     text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  badge_token    text UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, role)
);
CREATE UNIQUE INDEX org_employee_code ON org_members (org_id, employee_code) WHERE role = 'employee';

CREATE TABLE merchants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  owner_id    uuid REFERENCES users(id),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Accounts: customer accounts may go down to min_balance (0 for prepaid, -credit_limit for credit mode).
ALTER TABLE accounts DROP CONSTRAINT accounts_kind_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_kind_check
  CHECK (kind IN ('user','goal','employee','merchant','org_welfare','org_settlement','system_funding','system_payout','system_fee'));
ALTER TABLE accounts ADD COLUMN org_id uuid REFERENCES orgs(id);
ALTER TABLE accounts ADD COLUMN merchant_id uuid UNIQUE REFERENCES merchants(id);
ALTER TABLE accounts ADD COLUMN min_balance bigint NOT NULL DEFAULT 0;
ALTER TABLE accounts DROP CONSTRAINT non_negative_customer_balance;
ALTER TABLE accounts ADD CONSTRAINT customer_min_balance
  CHECK (kind NOT IN ('user','goal','employee','merchant') OR balance >= min_balance);
CREATE UNIQUE INDEX one_employee_account ON accounts (org_id, user_id) WHERE kind = 'employee';
CREATE UNIQUE INDEX one_org_account_per_kind ON accounts (org_id, kind) WHERE kind IN ('org_welfare','org_settlement');

ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('p2p','topup','payout','goal_deposit','reversal','purchase','welfare','payroll_settle','merchant_payout','refund'));
ALTER TABLE transactions ADD COLUMN org_id uuid REFERENCES orgs(id);
ALTER TABLE transactions ADD COLUMN merchant_id uuid REFERENCES merchants(id);
ALTER TABLE transactions ADD COLUMN channel text;   -- app | liff | badge
CREATE INDEX tx_org_created ON transactions (org_id, created_at DESC);
CREATE INDEX tx_merchant_created ON transactions (merchant_id, created_at DESC);

-- A merchant-created payment request shown as a QR; paid at most once.
CREATE TABLE charges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  uuid NOT NULL REFERENCES merchants(id),
  amount       bigint NOT NULL CHECK (amount > 0),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  paid_tx      uuid REFERENCES transactions(id),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Welfare runs are idempotent per org + cycle label (e.g. 2026-12).
CREATE TABLE welfare_runs (
  org_id     uuid NOT NULL REFERENCES orgs(id),
  cycle      text NOT NULL,
  amount     bigint NOT NULL,
  employees  int NOT NULL,
  run_by     uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, cycle)
);
