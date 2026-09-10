import { env } from "cloudflare:workers";
import { accessCodeMatches, anonymousClientKey, FAMILY_COOKIE, familySessionToken } from "../../family-access";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function POST(request: Request) {
  const clientKey = await anonymousClientKey(request);
  const now = Date.now();
  const attempt = await env.DB.prepare("SELECT failed_count, window_started FROM family_access_attempts WHERE client_key = ?")
    .bind(clientKey)
    .first<{ failed_count: number; window_started: number }>();

  if (attempt && now - attempt.window_started < WINDOW_MS && attempt.failed_count >= MAX_FAILURES) {
    return Response.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  }

  const payload = await request.json() as { code?: string };
  const code = payload.code?.trim() ?? "";
  if (!(await accessCodeMatches(code))) {
    const windowStarted = !attempt || now - attempt.window_started >= WINDOW_MS ? now : attempt.window_started;
    const failedCount = !attempt || now - attempt.window_started >= WINDOW_MS ? 1 : attempt.failed_count + 1;
    await env.DB.prepare(
      `INSERT INTO family_access_attempts (client_key, failed_count, window_started)
       VALUES (?, ?, ?)
       ON CONFLICT(client_key) DO UPDATE SET failed_count = excluded.failed_count, window_started = excluded.window_started`,
    ).bind(clientKey, failedCount, windowStarted).run();
    return Response.json({ error: "访问码不正确" }, { status: 401 });
  }

  await env.DB.prepare("DELETE FROM family_access_attempts WHERE client_key = ?").bind(clientKey).run();
  const sessionToken = await familySessionToken();
  return Response.json({ ok: true }, {
    headers: {
      "set-cookie": `${FAMILY_COOKIE}=${sessionToken}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
