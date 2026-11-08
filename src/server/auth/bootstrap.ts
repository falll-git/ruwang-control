import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { hashPassword, privacyHash } from "./crypto.ts";

export type BootstrapDatabaseClient = {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
};

export async function bootstrapFirstOperator(client: BootstrapDatabaseClient, input: {
  username: string;
  displayName: string;
  password: string;
  instanceKeys: readonly string[];
  encryptionKey: string;
}): Promise<{ operatorId: string; instanceCount: number }> {
  const operatorId = randomUUID();
  const requestId = `bootstrap_${randomUUID().replaceAll("-", "")}`;
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ruwang-control-first-operator'))");
    const existing = Number((await client.query<{ count: number }>("SELECT count(*)::int AS count FROM control.operators")).rows[0]?.count);
    if (existing !== 0) throw new Error("Bootstrap hanya dapat membuat operator pertama. Gunakan menu Operator Control untuk membuat akun berikutnya.");
    const instances = (await client.query<{ id: string; instance_key: string }>(
      "SELECT id::text, instance_key FROM control.instances WHERE instance_key = ANY($1::text[]) ORDER BY instance_key",
      [[...input.instanceKeys]],
    )).rows;
    if (instances.length !== input.instanceKeys.length) throw new Error("Satu atau lebih instance key tidak terdaftar; tidak ada operator yang dibuat.");

    await client.query("INSERT INTO control.operators (id, username_canonical, email_canonical, display_name) VALUES ($1, $2, NULL, $3)", [operatorId, input.username, input.displayName]);
    await client.query("INSERT INTO control.operator_password_credentials (operator_id, password_hash) VALUES ($1, $2)", [operatorId, await hashPassword(input.password)]);
    await client.query(`INSERT INTO control.security_audit_events
      (id, request_id, actor_operator_id, subject_hash, target_operator_id, action, outcome, reason_code)
      VALUES ($1, $2, $3, $4, $3, 'operator.bootstrap', 'succeeded', 'FIRST_OPERATOR')`,
    [randomUUID(), requestId, operatorId, privacyHash(input.username, input.encryptionKey)]);
    await client.query("COMMIT");
    return { operatorId, instanceCount: instances.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
