/**
 * External integrations behind interfaces. Sandbox implementations ship here;
 * production adapters (SMS gateway, e-KYC/NDID vendor, bank/PromptPay rails via a
 * licensed partner) implement the same interfaces and are swapped in createProviders().
 */
import { randomUUID } from "node:crypto";
import { LineApiVerifier, SandboxLineNotifier, SandboxLineVerifier, type LineNotifier, type LineVerifier } from "./line.js";

export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

export type KycDecision = { status: "approved" } | { status: "rejected"; reason: string } | { status: "pending" };

export interface KycProvider {
  submit(input: { userId: string; method: "id_card" | "ndid"; idCardImage?: string; selfieImage?: string }): Promise<{
    providerRef: string;
    decision: KycDecision;
  }>;
}

export type PayoutTarget =
  | { kind: "promptpay"; id: string }
  | { kind: "bank"; bankCode: string; accountNo: string };

export interface PayoutProvider {
  /** Resolve the account holder name before the user confirms (name inquiry). */
  lookup(target: PayoutTarget): Promise<{ name: string } | null>;
  send(input: { target: PayoutTarget; amount: number; reference: string }): Promise<
    { ok: true; providerRef: string } | { ok: false; reason: string }
  >;
}

export interface Providers {
  sms: SmsProvider;
  kyc: KycProvider;
  payout: PayoutProvider;
  line: LineVerifier;
  notify: LineNotifier;
}

export class SandboxSms implements SmsProvider {
  public outbox: { phone: string; message: string }[] = [];
  async send(phone: string, message: string) {
    this.outbox.push({ phone, message });
    if (process.env.NODE_ENV !== "test") console.info(`[sandbox sms] ${phone}: ${message}`);
  }
}

export class SandboxKyc implements KycProvider {
  constructor(private autoApprove: boolean) {}
  async submit() {
    return {
      providerRef: `kyc_sbx_${randomUUID()}`,
      decision: this.autoApprove ? ({ status: "approved" } as const) : ({ status: "pending" } as const),
    };
  }
}

/**
 * Sandbox rails:
 *  - account / PromptPay id ending in "0000" → lookup fails (account not found)
 *  - ending in "9999" → transfer is rejected by the "bank" (tests the reversal path)
 */
export class SandboxPayout implements PayoutProvider {
  async lookup(t: PayoutTarget) {
    const id = t.kind === "promptpay" ? t.id : t.accountNo;
    if (id.endsWith("0000")) return null;
    return { name: t.kind === "promptpay" ? "ผู้รับพร้อมเพย์ (sandbox)" : `บัญชี ${t.bankCode} (sandbox)` };
  }
  async send({ target }: { target: PayoutTarget; amount: number; reference: string }) {
    const id = target.kind === "promptpay" ? target.id : target.accountNo;
    if (id.endsWith("9999")) return { ok: false as const, reason: "Destination bank rejected the transfer" };
    return { ok: true as const, providerRef: `po_sbx_${randomUUID()}` };
  }
}

export function createSandboxProviders(opts: { kycAutoApprove: boolean; lineChannelId?: string }): Providers {
  return {
    sms: new SandboxSms(),
    kyc: new SandboxKyc(opts.kycAutoApprove),
    payout: new SandboxPayout(),
    // With a channel id set, real LINE tokens are verified even in the sandbox.
    line: opts.lineChannelId ? new LineApiVerifier(opts.lineChannelId) : new SandboxLineVerifier(),
    notify: new SandboxLineNotifier(),
  };
}
