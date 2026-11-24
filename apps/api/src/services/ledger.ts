import type { Db, Tx } from "../db.js";
import { err } from "../lib/errors.js";

export type Entry = { accountId: string; amount: number };

/**
 * Post balanced entries for a transaction. Locks the touched accounts in a stable
 * order (avoids deadlocks), applies balances, and relies on the DB CHECK constraint
 * to reject any customer balance going negative.
 */
export async function postEntries(tx: Tx, transactionId: string, entries: Entry[]): Promise<void> {
  const sum = entries.reduce((s, e) => s + e.amount, 0);
  if (sum !== 0) throw new Error(`Unbalanced ledger posting (sum=${sum})`);
  if (entries.some((e) => !Number.isSafeInteger(e.amount) || e.amount === 0)) throw new Error("Bad entry amount");

  const ids = [...new Set(entries.map((e) => e.accountId))].sort();
  await tx.query("SELECT id FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);

  for (const e of entries) {
    await tx.query("INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1, $2, $3)", [
      transactionId,
      e.accountId,
      e.amount,
    ]);
    try {
      await tx.query("SAVEPOINT bal");
      await tx.query("UPDATE accounts SET balance = balance + $2 WHERE id = $1", [e.accountId, e.amount]);
      await tx.query("RELEASE SAVEPOINT bal");
    } catch (e2) {
      if ((e2 as { code?: string }).code === "23514") {
        throw err.badRequest("INSUFFICIENT_FUNDS", "Insufficient balance");
      }
      throw e2;
    }
  }
}

export async function systemAccount(tx: Tx, kind: "system_funding" | "system_payout" | "system_fee"): Promise<string> {
  const r = await tx.query("SELECT id FROM accounts WHERE kind = $1", [kind]);
  return r.rows[0].id;
}

export async function mainAccount(tx: Db | Tx, userId: string): Promise<{ id: string; balance: number }> {
  const r = await tx.query("SELECT id, balance FROM accounts WHERE user_id = $1 AND kind = 'user'", [userId]);
  if (!r.rowCount) throw err.notFound("ACCOUNT_NOT_FOUND", "Account not found");
  return r.rows[0];
}
