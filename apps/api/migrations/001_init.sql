-- Money is stored as BIGINT satang (1 THB = 100 satang). Never use floats.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  pin_hash         text NOT NULL,
  pin_failed       int  NOT NULL DEFAULT 0,
  pin_locked_until timestamptz,
  kyc_status       text NOT NULL DEFAULT 'none'
                   CHECK (kyc_status IN ('none','pending','approved','rejected')),
  kyc_reason       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('register','login')),
  device_id    text NOT NULL,
  code_hash    text NOT NULL,
  attempts     int  NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_created ON otp_challenges (phone, created_at DESC);

CREATE TABLE devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  name        text,
  trusted_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_family ON refresh_tokens (family_id);

CREATE TABLE kyc_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method        text NOT NULL CHECK (method IN ('id_card','ndid')),
  provider_ref  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

CREATE TABLE goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  target      bigint NOT NULL CHECK (target > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- kind: user = main wallet, goal = savings pocket, system_* = house accounts
CREATE TABLE accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('user','goal','system_funding','system_payout','system_fee')),
  user_id     uuid REFERENCES users(id) ON DELETE RESTRICT,
  goal_id     uuid UNIQUE REFERENCES goals(id) ON DELETE RESTRICT,
  currency    text NOT NULL DEFAULT 'THB',
  balance     bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT non_negative_customer_balance CHECK (kind NOT IN ('user','goal') OR balance >= 0)
);
CREATE UNIQUE INDEX one_main_account_per_user ON accounts (user_id) WHERE kind = 'user';
CREATE UNIQUE INDEX one_system_account_per_kind ON accounts (kind) WHERE kind LIKE 'system_%';

INSERT INTO accounts (kind) VALUES ('system_funding'), ('system_payout'), ('system_fee');

CREATE TABLE transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL CHECK (type IN ('p2p','topup','payout','goal_deposit','reversal')),
  status           text NOT NULL CHECK (status IN ('pending','completed','failed')),
  amount           bigint NOT NULL CHECK (amount > 0),
  fee              bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  from_account     uuid REFERENCES accounts(id),
  to_account       uuid REFERENCES accounts(id),
  initiated_by     uuid REFERENCES users(id),
  counterparty     jsonb NOT NULL DEFAULT '{}'::jsonb,
  note             text,
  idempotency_key  text,
  provider_ref     text,
  failure_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  UNIQUE (initiated_by, idempotency_key)
);
CREATE INDEX tx_from ON transactions (from_account, created_at DESC);
CREATE INDEX tx_to   ON transactions (to_account, created_at DESC);

-- Double-entry: entries of one transaction always sum to zero (enforced in code + checked in tests)
CREATE TABLE ledger_entries (
  id              bigserial PRIMARY KEY,
  transaction_id  uuid NOT NULL REFERENCES transactions(id),
  account_id      uuid NOT NULL REFERENCES accounts(id),
  amount          bigint NOT NULL CHECK (amount <> 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_account ON ledger_entries (account_id, id);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  action      text NOT NULL,
  ip          text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
