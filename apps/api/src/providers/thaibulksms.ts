import type { SmsProvider } from "./index.js";

/**
 * ThaiBulkSMS (https://developer.thaibulksms.com/reference/post_sms): Basic auth with the API key
 * as username and API secret as password. Trial accounts must use sender "Demo".
 * Verify field names against the docs with a trial key before the pilot.
 */
export class ThaiBulkSms implements SmsProvider {
  constructor(
    private key: string,
    private secret: string,
    private sender: string,
    private url = "https://api-v2.thaibulksms.com/sms",
  ) {}

  async send(phone: string, message: string) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.key}:${this.secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ msisdn: phone, message, sender: this.sender }),
    });
    if (!res.ok) throw new Error(`ThaiBulkSMS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
