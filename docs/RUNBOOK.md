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

## 7. Incidents

| Symptom | First check |
|---|---|
| OTP not arriving | ThaiBulkSMS credit / sender approval; API logs `ThaiBulkSMS 4xx` |
| Shop QR never turns "paid" | Employee got an error? `charges` row status; clocks (expiry 180 s) |
| LIFF login loops | Endpoint URL matches `APP_DOMAIN/liff`; `LINE_CHANNEL_ID` matches the LIFF's channel |
| 401 for everyone | `JWT_SECRET` changed → everyone must log in again |
