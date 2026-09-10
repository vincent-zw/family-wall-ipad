import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

export const FAMILY_COOKIE = "family_wall_access";
const SESSION_LABEL = "family-wall-ipad-session-v1";

function accessCode() {
  return (env as unknown as { FAMILY_ACCESS_CODE?: string }).FAMILY_ACCESS_CODE ?? "";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function familySessionToken() {
  const code = accessCode();
  if (!code) return "";
  return sha256(`${SESSION_LABEL}:${code}`);
}

export async function hasFamilyAccess() {
  const expected = await familySessionToken();
  if (!expected) return false;
  const cookieStore = await cookies();
  const received = cookieStore.get(FAMILY_COOKIE)?.value ?? "";
  return received.length === expected.length && received === expected;
}

export async function accessCodeMatches(received: string) {
  const expected = accessCode();
  if (!expected) return false;
  const [receivedHash, expectedHash] = await Promise.all([sha256(received), sha256(expected)]);
  return receivedHash === expectedHash;
}

export async function anonymousClientKey(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha256(`family-wall-client:${ip}`);
}
