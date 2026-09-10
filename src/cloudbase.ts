import cloudbase from "@cloudbase/js-sdk";
import type { CloudBase } from "@cloudbase/js-sdk/types/types/app";

const ACCESS_CODE_KEY = "family-wall-cloudbase-code-v1";
const PROXY_PATH = "/api/family";
const CLOUDBASE_ENV_ID =
  (import.meta.env.VITE_CLOUDBASE_ENV_ID as string | undefined)?.trim()
  ?? "family-wall-ipad-v2-d2bg1e621aa0";
const CLOUDBASE_REGION = "ap-shanghai";
const FAMILY_FUNCTION_NAME = "family-api";

/**
 * CloudBase App 共享单例（HTTP callFunction 和 Watcher 共用同一个登录态，只登一次）。
 */
type TcbApp = CloudBase;
let sharedAppPromise: Promise<TcbApp | null> | null = null;
export let lastCloudbaseLoginError = "";

export async function getSharedCloudBaseApp(timeoutMs = 12000): Promise<TcbApp | null> {
  if (sharedAppPromise) return sharedAppPromise;
  sharedAppPromise = (async () => {
    try {
      // 初始化（同个 env 多次 init 是幂等的，SDK 内部会返回同一个 app）
      const app = cloudbase.init({ env: CLOUDBASE_ENV_ID, region: CLOUDBASE_REGION });
      const auth = app.auth({ persistence: "local" });
      // 先看本地是否已有有效登录态（匿名登录的有效期通常 30 天）
      const state = await Promise.race([
        (async () => { try { return auth.getLoginState?.(); } catch { return null; } })(),
        new Promise<null>((_, r) => setTimeout(() => r(null), 4000)),
      ]);
      if (!(state && !state.isExpired)) {
        await Promise.race([
          auth.anonymousAuthProvider().signIn(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("AUTH_TIMEOUT")), timeoutMs)),
        ]);
      }
      lastCloudbaseLoginError = "";
      return app as TcbApp;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "未知");
      lastCloudbaseLoginError = msg.includes("AUTH_TIMEOUT")
        ? "匿名登录超时（12s 无响应）"
        : `匿名登录失败：${msg}`;
      sharedAppPromise = null;
      return null;
    }
  })();
  return sharedAppPromise;
}

export function resetSharedCloudBaseApp() { sharedAppPromise = null; lastCloudbaseLoginError = ""; }

const OFFLINE_CODE_HASH = "2a28e512fb78af658a82be0c719d17b3cc59d2e41bf1ce2722788a5ee130dede";
const OFFLINE_CODE_LABEL = "family-wall-offline-v1:";

type FamilyApiResult<T> = {
  ok: boolean;
  error?: string;
  data?: T;
  updatedAt?: number;
};

export function isCloudBaseConfigured() { return true; } // 现在永远可用（callFunction 或代理 fallback）

export function readSavedAccessCode() {
  try { return window.localStorage.getItem(ACCESS_CODE_KEY) ?? ""; } catch { return ""; }
}
export function saveAccessCode(code: string) {
  try { window.localStorage.setItem(ACCESS_CODE_KEY, code); } catch { /* ignore */ }
}

/**
 * 用 CloudBase JS SDK 原生 callFunction 通道（跟 watcher 共享登录态） → 不走 HTTP 网关，不触发 429。
 * family-api 是 koa-connect 包的事件函数，callFunction 返回的是 { statusCode, headers, body }，
 * 其中 body 就是我们本来写的 JSON 字符串，parse 后就是 FamilyApiResult。
 */
const FAMILY_FUNCTION_CALL_TIMEOUT_MS = 12000;

// 给云函数调用套超时：弱网/移动网络下 SDK 或代理的 Promise 可能长期挂起（表现为"点了没反应"）
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function callFamilyViaSDK<T>(action: string, payload: Record<string, unknown>, suppliedCode?: string): Promise<FamilyApiResult<T> | null> {
  const app = await getSharedCloudBaseApp();
  if (!app) return null;
  try {
    // @ts-expect-error CloudBase TS 类型把 callFunction 定义得很死，直接 duck-type 调用
    const resp = await withTimeout(
      (app.functions as { callFunction: (p: { name: string; data: unknown }) => Promise<{ result: { statusCode?: number; body?: string } | string }> }).callFunction({
        name: FAMILY_FUNCTION_NAME,
        data: {
          // 模拟 HTTP 网关转发给 koa-connect 的标准 Event 结构（只填业务需要的字段；koa-connect 会读 httpMethod/headers/body）
          httpMethod: "POST",
          headers: {
            "content-type": "application/json",
            "x-family-access": suppliedCode ?? readSavedAccessCode(),
            "origin": `https://${CLOUDBASE_ENV_ID}.tcloudbaseapp.com`,
          },
          queryStringParameters: {},
          path: "/",
          requestContext: { httpMethod: "POST", path: "/" },
          body: JSON.stringify({ action, ...payload }),
          isBase64Encoded: false,
          // 兼容：部分 koa-connect 包装实现同时也直接吃 body 作为 action（最小双保险）
          action,
          ...payload,
        },
      }),
      FAMILY_FUNCTION_CALL_TIMEOUT_MS,
      "SDK_CALL_TIMEOUT",
    );
    const result = resp?.result;
    if (!result) return null;
    // koa-connect 包一般返回 {statusCode, body(JSON字符串)}
    if (typeof result === "object" && result !== null && typeof (result as { body?: string }).body === "string") {
      return JSON.parse((result as { body: string }).body) as FamilyApiResult<T>;
    }
    if (typeof result === "string") {
      try { return JSON.parse(result) as FamilyApiResult<T>; } catch { /* 可能不是 JSON，fallback */ }
    }
    return result as unknown as FamilyApiResult<T>;
  } catch {
    return null; // SDK 通道失败 → 降级走同源代理
  }
}

async function callFamilyViaProxy<T>(action: string, payload: Record<string, unknown>, suppliedCode?: string): Promise<FamilyApiResult<T>> {
  const response = await withTimeout(
    fetch(PROXY_PATH, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, code: suppliedCode ?? readSavedAccessCode(), ...payload }),
    }),
    FAMILY_FUNCTION_CALL_TIMEOUT_MS,
    "家庭云端暂时无法连接（请求超时）",
  );
  if (!response.ok) {
    const extra = `(${response.status} ${response.statusText})`;
    throw new Error(`家庭云端暂时无法连接${extra}`);
  }
  const result = await response.json() as FamilyApiResult<T>;
  if (!result?.ok) throw new Error(result?.error ?? "家庭云端暂时无法连接");
  return result;
}

async function requestFamilyFunction<T>(action: string, payload: Record<string, unknown> = {}, suppliedCode?: string) {
  // 1) 优先走原生 SDK callFunction（不走 HTTP 网关，不触发 429/CORS）
  const sdkResult = await callFamilyViaSDK<T>(action, payload, suppliedCode);
  if (sdkResult) {
    if (!sdkResult.ok) throw new Error(sdkResult.error ?? "家庭云端返回失败");
    return sdkResult;
  }
  // 2) 失败降级：走 Pages Functions 同源 HTTP 代理
  return callFamilyViaProxy<T>(action, payload, suppliedCode);
}

export async function callFamilyApi<T>(action: "authenticate" | "get" | "put", payload?: unknown, suppliedCode?: string) {
  return requestFamilyFunction<T>(action, action === "put" ? { payload } : {}, suppliedCode);
}

export async function callSecureFamilyFunction<T>(action: string, payload: Record<string, unknown> = {}) {
  const result = await requestFamilyFunction<T>(action, payload);
  return result.data as T;
}

async function matchesOfflineAccessCode(code: string) {
  if (!globalThis.crypto?.subtle) return false;
  const bytes = new TextEncoder().encode(`${OFFLINE_CODE_LABEL}${code}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hash === OFFLINE_CODE_HASH;
}

export async function verifyFamilyAccess(code: string) {
  try {
    await callFamilyApi<never>("authenticate", undefined, code);
    saveAccessCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/访问码不正确|尝试次数过多/.test(message) || !(await matchesOfflineAccessCode(code))) throw error;
    saveAccessCode(code);
  }
}
