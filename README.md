# Canteen Wallet — ระบบชำระเงินโรงอาหารโรงงาน

พนักงานสแกนจ่ายในโรงอาหารผ่าน **LINE** หรือ **แอป** (คนไม่มีมือถือใช้ **บัตร QR + PIN**) บริษัทตั้งสวัสดิการค่าอาหาร ส่วนที่ใช้เกินหักเงินเดือนอัตโนมัติ HR เห็นยอดทุกวัน ร้านค้าไม่ต้องทอนเงิน
หลายโรงงานใช้ deployment เดียวกันได้ (multi-tenant) แต่ละโรงงานเลือกรูปแบบเงินได้เอง: **เครดิต + หักเงินเดือน** หรือ **เติมเงินล่วงหน้า**

Design: [canvas](https://claude.ai/artifact/8fxD8Qy5CZp9Eb8QbTtGvq) · Flow: [whiteboard](https://claude.ai/artifact/FTUmGa6u4oZEvtSCZtBUJz) · Sales kit: [doc](https://claude.ai/artifact/TtMtRzChWhCKioAe8Jwr52)

## ส่วนประกอบ

| ส่วน | ใช้ทำอะไร | Stack |
|---|---|---|
| `apps/api` | API กลาง, ledger, auth | Node 22 · Fastify 5 · PostgreSQL · zod · jose |
| `apps/web` `/hr` | Back-office ฝ่ายบุคคล: พนักงาน, บัตร QR, สวัสดิการ, หักเงินเดือน, ร้านค้า, รายงาน, ทำเรื่องลาออก, บันทึกใบจดย้อนหลัง | React 18 · MUI v5 (goalong-mui-starter) |
| `apps/web` `/shop` | หน้าร้าน (มือถือ/แท็บเล็ต): ปุ่มราคาด่วน, QR รับเงิน, สแกนบัตร + PIN, ยอดวันนี้, คืนเงิน | เดียวกัน |
| `apps/web` `/liff` | พนักงานผ่าน LINE (LIFF): ผูก LINE ครั้งแรก แล้วเข้าได้ทันที | `@line/liff` |
| `apps/mobile` | แอปพนักงาน: เปิดใช้งาน, สแกนจ่าย, ประวัติ | Expo SDK 58 · expo-camera · SecureStore |
| `deploy/` + `Jenkinsfile` | Production: Caddy (TLS) + api + web + Postgres 17 + backup รายวัน | Docker · Jenkins |

## Flow เงิน

```
HR เติมสวัสดิการ (ต่อรอบ)      org_welfare  ──▶ พนักงาน
พนักงานจ่ายร้าน (QR / บัตร+PIN)   พนักงาน      ──▶ ร้านค้า
สิ้นเดือน: หักเงินเดือน           org_settlement ──▶ พนักงาน (ยอดติดลบกลับเป็น 0)
บริษัทจ่ายร้าน                   ร้านค้า        ──▶ org_settlement
```
Double-entry ledger, เงินเป็นสตางค์ (BIGINT), พนักงานใช้ได้ถึง `min_balance` (0 = prepaid, −วงเงิน = credit) บังคับด้วย DB constraint

## Run locally

```bash
# API (ต้องมี Postgres)
cp apps/api/.env.example apps/api/.env   # SANDBOX=true, SANDBOX_EXPOSE_OTP=true, ตั้ง ADMIN_TOKEN
npm install && npm run api:dev

# สร้างโรงงานทดลอง + HR
curl -X POST localhost:4000/v1/admin/orgs -H "x-admin-token: <ADMIN_TOKEN>" -H 'content-type: application/json' \
  -d '{"name":"โรงงานทดลอง","code":"DEMO","hr":{"name":"HR","phone":"0811111111"}}'

# Web (HR / shop / LIFF)
cd apps/web && cp .env.example .env && yarn install && yarn dev   # http://localhost:8081/activate

# Mobile
cd apps/mobile && npm install && npx expo start   # ตั้ง expo.extra.apiUrl ใน app.json เป็น IP เครื่อง
```
Sandbox แสดงรหัส OTP บนหน้าจอ และ LIFF รับ token รูปแบบ `sandbox:<id>` เมื่อยังไม่ได้ตั้ง `LINE_CHANNEL_ID`

## Tests

```bash
npm run api:test   # 24 integration tests บน Postgres จริง (TEST_DATABASE_URL, TEST_DATABASE_URL_CANTEEN)
```
ครอบคลุม: activation/OTP/PIN lockout, device binding, refresh rotation, QR จ่ายครั้งเดียว + ยอดต้องตรง, วงเงินต่อวัน, วงเงิน credit/prepaid, บัตร + PIN + ออกบัตรใหม่, สวัสดิการไม่ซ้ำรอบ, หักเงินเดือนไม่ซ้ำ, จ่ายร้าน, รายงาน, LINE link/login, คืนเงิน + ใบเสร็จทาง LINE, ปุ่มราคาด่วน, บันทึกย้อนหลัง, ลาออก (ยอดค้าง/ยอดเหลือ), rate limit ต่อเครื่องไม่ใช่ต่อ IP, ledger สมดุล, โอนพร้อมกันไม่ติดลบ

## Production

ดู [docs/RUNBOOK.md](docs/RUNBOOK.md): deploy, onboard โรงงาน, ตั้งค่า LINE LIFF, backup/restore, rollback, incident

### ต้องมีก่อนใช้จริง
- [ ] คำตอบเป็นลายลักษณ์อักษรจาก ธปท. (02-356-7799) ว่าระบบใช้ในโรงอาหารบริษัทเดียวต้องขออนุญาตหรือไม่ — โดยเฉพาะโหมด prepaid
- [ ] บัญชี ThaiBulkSMS + sender name ที่อนุมัติแล้ว (ทดสอบ field กับ trial key ก่อน)
- [ ] LINE Login channel + LIFF ID
- [ ] Domain, VM, Jenkins credentials
- [ ] ทนายตรวจ [privacy notice](docs/legal/privacy-notice.md), [terms](docs/legal/terms-of-use.md), DPA และหนังสือยินยอมหักค่าจ้าง
- [ ] Pentest ภายนอก + ทดสอบ restore backup
- [ ] โลโก้/ชื่อสินค้าจริง (ตอนนี้หน้าเว็บใช้โลโก้จาก starter)
- [ ] App icon/splash และ EAS build สำหรับแอป (ถ้าจะออกแอปด้วย ไม่ใช่แค่ LINE)

## หมายเหตุ
- Routes ของ wallet แบบโอนเงิน P2P/ธนาคาร (MVP แรก) ยังอยู่ใน API แต่ปิดไว้ (`CONSUMER_WALLET=false`)
- ยังไม่มี: แจ้งเตือน LINE ตอนเติมสวัสดิการ, HR คืนเงินรายการเกิน 24 ชม., โหมด offline (ใช้ใบจดแทน ดู RUNBOOK §7), export รายงาน Excel แยกร้าน
