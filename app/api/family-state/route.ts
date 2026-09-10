import { env } from "cloudflare:workers";
import { hasFamilyAccess } from "../../family-access";

const MAX_PAYLOAD_BYTES = 200_000;
const FAMILY_OWNER_ID = "shared-family-wall";

export async function GET() {
  if (!(await hasFamilyAccess())) return Response.json({ error: "请先输入家庭访问码" }, { status: 401 });

  const row = await env.DB.prepare("SELECT payload, updated_at FROM family_state WHERE owner_id = ?")
    .bind(FAMILY_OWNER_ID)
    .first<{ payload: string; updated_at: number }>();

  if (!row) return Response.json({ state: null });

  try {
    return Response.json({ state: JSON.parse(row.payload), updatedAt: row.updated_at });
  } catch {
    return Response.json({ error: "云端家庭数据无法读取" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await hasFamilyAccess())) return Response.json({ error: "请先输入家庭访问码" }, { status: 401 });

  const state = await request.json();
  const payload = JSON.stringify(state);
  if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "家庭数据过大" }, { status: 413 });
  }

  const updatedAt = Date.now();
  await env.DB.prepare(
    `INSERT INTO family_state (owner_id, payload, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).bind(FAMILY_OWNER_ID, payload, updatedAt).run();

  return Response.json({ ok: true, updatedAt });
}
