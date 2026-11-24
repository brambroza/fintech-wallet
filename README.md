# Fintech Wallet — MVP (sandbox)

แอปกระเป๋าเงิน: สมัคร → ยืนยันตัวตน (KYC) → เติมเงิน → โอน (ในแอป / พร้อมเพย์ / ธนาคาร) → ออมเงิน
Design: [Fintech app UX/UI canvas](https://claude.ai/artifact/8fxD8Qy5CZp9Eb8QbTtGvq) · Flow: [Whiteboard](https://claude.ai/artifact/FTUmGa6u4oZEvtSCZtBUJz)

> **Sandbox เท่านั้น** — SMS, e-KYC และการโอนออกธนาคารเป็น mock ไม่มีเงินจริง
> การเปิดใช้เงินจริงต้องมีใบอนุญาต e-Money จาก ธปท. หรือทำผ่านธนาคาร/ผู้ให้บริการที่มีใบอนุญาต ดู [Go-live checklist](#go-live-checklist)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| `apps/api` | Node.js 22 · Fastify 5 · TypeScript · PostgreSQL (raw SQL + migrations) · zod · jose (JWT) · bcrypt |
| `apps/mobile` | Expo SDK 58 · React Native 0.88 · Expo Router · SecureStore · LocalAuthentication · ImagePicker |
| Infra | Docker · docker-compose · GitHub Actions |

## Run locally

```bash
# 1) API + Postgres
cp apps/api/.env.example apps/api/.env      # แก้ JWT_SECRET / OTP_PEPPER
docker compose up -d --build                 # API ที่ http://localhost:4000, migrate อัตโนมัติ

# หรือรันแบบ dev (ต้องมี Postgres อยู่แล้ว)
npm install && npm run api:dev

# 2) Mobile
cd apps/mobile && npm install
# ตั้ง expo.extra.apiUrl ใน app.json เป็น IP เครื่องคุณ เช่น http://192.168.1.10:4000
npx expo start
```

Face ID ใช้ใน Expo Go ไม่ได้ ต้องใช้ development build (`npx expo run:ios` / EAS Build)

### Demo ใน sandbox
- `SANDBOX_EXPOSE_OTP=true` → รหัส OTP แสดงบนหน้าจอ OTP
- อนุมัติ/ปฏิเสธ KYC: `curl -X POST localhost:4000/v1/sandbox/kyc/decide -H 'content-type: application/json' -d '{"phone":"0812345678","decision":"approved"}'` (หรือ `KYC_AUTO_APPROVE=true`)
- โอนออกธนาคาร/พร้อมเพย์: เลขลงท้าย `0000` = ไม่พบบัญชี, ลงท้าย `9999` = ธนาคารปฏิเสธ (ทดสอบการคืนเงิน)

## Tests

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/wallet_test npm run api:test
```
ครอบคลุม: register/OTP/PIN lockout, device binding, refresh-token rotation + reuse detection, KYC gate, idempotency, overdraft, daily limit, payout failure → reversal, goals, ledger balanced, concurrent transfers ไม่ติดลบ

## Design decisions

- **เงินเป็น integer สตางค์ (BIGINT)** ทุกที่ ไม่มี float
- **Double-entry ledger**: ทุกรายการมี `ledger_entries` ที่รวมกันได้ 0 ส่วน `accounts.balance` อัปเดตใน transaction เดียวกัน และมี DB CHECK กันยอดลูกค้าติดลบ
- **Concurrency**: lock บัญชีผู้โอนก่อนเช็ควงเงินรายวัน และ lock บัญชีตามลำดับ id กัน deadlock
- **Idempotency**: `transactions (initiated_by, idempotency_key)` unique ทั้งแอปจะสร้าง key 1 ครั้งต่อการกด Review
- **Payout**: ตัดเงินก่อน (pending) แล้วค่อยเรียก rail ถ้าล้มเหลวจะลง reversal entry คืนเงิน
- **Auth**: Login = เบอร์ + PIN, เครื่องใหม่ต้อง OTP (device binding) · access JWT 15 นาที (อยู่ใน memory) · refresh token หมุนทุกครั้ง เก็บแบบ hash · reuse = revoke ทั้ง family · PIN bcrypt, ผิด 5 ครั้งล็อก 15 นาที, ห้าม PIN เรียง/ซ้ำ
- **Mobile**: refresh token อยู่ใน Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) · ล็อกแอปเมื่ออยู่ background > 60 วินาที · การโอนต้องใช้ PIN เสมอ (biometric ใช้แค่ปลดล็อก)
- **KYC images** ส่งต่อให้ vendor ไม่เก็บไว้ใน DB ของเรา (เก็บแค่ provider_ref)

## Go-live checklist

สิ่งที่ **ต้อง** ทำก่อนใช้เงินจริง (ระบบจะไม่ยอม start ถ้า `SANDBOX=false` จนกว่าจะต่อ provider จริง):

- [ ] **License/partner**: ใบอนุญาต e-Money (พ.ร.บ.ระบบการชำระเงิน 2560) หรือ white-label กับธนาคาร
- [ ] **Providers** (`apps/api/src/providers`): SMS gateway, e-KYC/NDID vendor (ผ่านเกณฑ์ ธปท./IAL), bank/PromptPay payout + name inquiry, top-up (direct debit / card acquirer + webhook)
- [ ] **Compliance**: AML/CFT screening (ปปง.), วงเงินตามระดับ KYC, PDPA (consent, retention, DPO), ข้อกำหนดและนโยบายความเป็นส่วนตัวฉบับจริง
- [ ] **Security**: pentest, secrets ใน vault, TLS + cert pinning ในแอป, root/jailbreak detection, rate limit ที่ gateway, WAF, audit log ส่งไป SIEM
- [ ] **Ops**: reconciliation รายวันกับธนาคาร, back-office (KYC review, refund, freeze account), monitoring/alert, backup + PITR, runbook incident
- [ ] **Mobile**: app icon/splash จริง, EAS Build + store listing, push notification (KYC ผล/เงินเข้า)

## Not built yet
สแกน QR/PromptPay QR, จ่ายบิล, Statement PDF, การแจ้งเตือน, งบประมาณรายเดือน, back-office web
