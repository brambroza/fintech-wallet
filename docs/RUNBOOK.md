# Runbook — Canteen Wallet (production)

## 1. First deploy on a VM

1. VM: Ubuntu 22.04+, Docker + compose plugin, ports 80/443 open, DNS A records for `API_DOMAIN` and `APP_DOMAIN` → VM.
2. `git clone` the repo to `~/canteen`, then `cp deploy/.env.prod.example deploy/.env.prod && chmod 600 deploy/.env.prod` and fill every secret.
3. Jenkins: create a pipeline from `Jenkinsfile`, add credentials `registry-creds` and `deploy-ssh`, set `API_URL` / `LIFF_ID`, run with `DEPLOY=true`.
4. Check: `curl https://API_DOMAIN/health` → `{"ok":true,"sandbox":false}`; open `https://APP_DOMAIN/login`.

API refuses to start if `SANDBOX=false` without a real SMS provider, or if `SANDBOX_EXPOSE_OTP=true` in production.

## 2. Onboard a factory

```bash
curl -X POST https://API_DOMAIN/v1/admin/orgs -H "x-admin-token: $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"name":"บริษัท ตัวอย่าง จำกัด","code":"ACME","moneyMode":"credit","hr":{"name":"คุณวิไล","phone":"0812345678"}}'
```

Then: the HR contact opens `https://APP_DOMAIN/activate` → OTP → PIN → `/hr` → settings (limits, welfare) → import employees (CSV) → add shops → print badges for staff without phones.

Before the pilot starts, collect from the factory: signed DPA (GO Along = processor), employee payroll-deduction consents (credit mode), privacy notice + terms adapted from `docs/legal/`.

## 3. LINE (LIFF) setup

1. LINE Developers → the factory's (or GO Along's) Provider → **LINE Login** channel → note the **Channel ID** → `LINE_CHANNEL_ID`.
2. LIFF tab → Add → Size *Full*, Endpoint URL `https://APP_DOMAIN/liff`, Scopes `openid` + `profile`, Scan QR *on* → note LIFF ID → Jenkins `LIFF_ID` → rebuild web.
3. Put `https://liff.line.me/<LIFF ID>` in the LINE OA rich menu ("จ่ายค่าอาหาร").
4. Payment receipts (optional but recommended): the LINE OA's **Messaging API** channel → issue a long-lived channel access token → `LINE_MESSAGING_TOKEN`. The Messaging API channel must be under the **same Provider** as the LINE Login channel, otherwise user ids don't match and no message arrives.
   Every payment and refund is one push message. Estimate: employees × 2 meals × 22 days (300 people ≈ 13,200/month) and pick the OA plan with enough quota; when the quota runs out, payments still work, only receipts stop.

## 4. Backups and restore

- `backup` container writes `deploy/backups/wallet-YYYYMMDD-HHMMSS.dump` daily, keeps 14 days. **Also copy them off the VM** (e.g. `rclone`/`rsync` cron to another site) — a VM loss otherwise loses everything.
- Restore into a fresh DB:
  ```bash
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod stop api
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec -T db \
    pg_restore -U wallet -d wallet --clean --if-exists < deploy/backups/wallet-<ts>.dump
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod start api
  ```
- Test a restore once before the pilot and once a quarter.

## 5. Rollback

`TAG=<previous 8-char commit> docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d api web`
Migrations are additive; if a release added a migration, restore the pre-deploy backup instead of only rolling back images.

## 6. Daily / monthly checks

- Ledger integrity (should return 0 rows):
  ```sql
  SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount) <> 0;
  SELECT a.id FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
  GROUP BY a.id, a.balance HAVING a.balance <> COALESCE(SUM(e.amount), 0);
  ```
- Month end per factory: HR exports payroll CSV → payroll runs → HR clicks "บันทึกว่าหักแล้ว"; HR records shop payouts.
- Watch `audit_log` for `pin.locked` spikes and `refresh.reuse_detected`.

## 7. When the canteen can't reach the system (internet / server down)

Payments need the server; there is no offline mode. Agree this with HR and the shops **before** the pilot:

1. Shops switch to **paper slips** (ใบจด): employee code, name, amount, shop, date/time, **employee's signature**. Number the slips. Cash is also fine if the factory allows it.
2. Badge-only and app users alike use slips; don't take photos of PINs or write PINs down.
3. When the system is back, HR enters each slip: พนักงาน → ⋮ → **บันทึกรายการย้อนหลัง (ใบจด)**, with the slip number in the note. No PIN is needed and the daily limit is skipped; the credit/balance floor still applies — if a slip is rejected for insufficient balance, settle it in cash.
4. Keep the slips with the month's payroll documents (they are the evidence for those entries; the audit log records which HR user entered each one).

## 8. Refunds and employees leaving

- **Refund:** the shop does it itself (ยอดวันนี้ → คืนเงิน) within `REFUND_WINDOW_HOURS` (default 24 h), full amount, once per purchase. Older ones: HR handles case by case (there is no HR refund screen yet).
- **Employee leaves:** HR → พนักงาน → ⋮ → **ทำเรื่องลาออก**. The account and badge stop working at once. A negative balance shows in the next payroll export marked "ลาออก งวดสุดท้าย"; a positive balance is either paid back in cash at the HR desk or returned to the welfare budget (choose cash in prepaid mode — that money may be the employee's own). Re-hire = "กลับมาทำงาน".

## 9. Incidents

| Symptom | First check |
|---|---|
| OTP not arriving | ThaiBulkSMS credit / sender approval; API logs `ThaiBulkSMS 4xx` |
| Shop QR never turns "paid" | Employee got an error? `charges` row status; clocks (expiry 180 s) |
| LIFF login loops | Endpoint URL matches `APP_DOMAIN/liff`; `LINE_CHANNEL_ID` matches the LIFF's channel |
| 401 for everyone | `JWT_SECRET` changed → everyone must log in again |
| No LINE receipts | `LINE_MESSAGING_TOKEN` set? OA monthly quota used up? API logs `[notify] LINE push failed` |
| Many `RATE_LIMITED` at lunch | Limits are per device/session (not per IP); a single device hitting it is a stuck client or abuse |
