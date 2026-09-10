/**
 * Cloudflare Pages 同源反向代理（/api/family  →  CloudBase HTTP 网关）
 *
 * 作用：前端所有 family-api 请求改为走同源路径，浏览器不再触发 CORS OPTIONS 预检，
 * 由 Cloudflare 服务器把请求原样转发给腾讯 CloudBase。免费额度 10 万次/天，家用完全够用。
 *
 * 路由对应：`functions/api/family.ts` 处理 `https://<pages-domain>/api/family` 下的所有请求。
 */

const DEFAULT_TARGET =
  "https://family-wall-ipad-v2-d2bg1e621aa0-1476279485.ap-shanghai.app.tcloudbase.com/family-secure-api-v1";

const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "cf-ray",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-visitor",
  "cf-worker",
  "cf-request-id",
  "x-forwarded-for",
  "x-forwarded-proto",
  "cdn-loop",
  "cdn-secure-token",
]);

async function handleProxy(context: EventContext<unknown, string, unknown>): Promise<Response> {
  const req = context.request;

  // 1. 计算真实的 CloudBase 上游 URL
  const targetBase = String((context.env as { CLOUDBASE_PROXY_TARGET?: string })?.CLOUDBASE_PROXY_TARGET ?? DEFAULT_TARGET).replace(/\/+$/, "");
  const incomingUrl = new URL(req.url);
  // 兼容：/api/family 或 /api/family/* 或 /api/family?x=1 都正确拼 path
  const extraPath = incomingUrl.pathname.replace(/^\/api\/family\/?/, "");
  const targetUrl = extraPath ? `${targetBase}/${extraPath.replace(/^\/+/, "")}` : targetBase;
  const finalUrl = `${targetUrl}${incomingUrl.search}`;

  // 2. 过滤 hop-by-hop headers，保留真正业务需要的头
  const upstreamHeaders = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(k.toLowerCase())) continue;
    upstreamHeaders.append(k, v);
  }

  // 3. 把 Origin 伪造为 CloudBase 已经默认允许的 tcloudbaseapp.com 域名（截图里那条自定义域名，从根上绕开跨域校验）
  upstreamHeaders.set(
    "Origin",
    "https://family-wall-ipad-v2-d2bg1e621aa0-1476279485.tcloudbaseapp.com",
  );
  upstreamHeaders.set("Referer", "https://family-wall-ipad-v2-d2bg1e621aa0-1476279485.tcloudbaseapp.com/");
  // CloudBase 网关对 User-Agent 无限制，但保持原样更安全
  if (!upstreamHeaders.has("Accept")) upstreamHeaders.set("Accept", "application/json, */*;q=0.8");

  // 4. 发起上游请求（服务器 → 服务器，无 CORS 概念）
  // eslint-disable-next-line no-undef
  const upstream = await fetch(finalUrl, {
    method: req.method,
    headers: upstreamHeaders,
    body: (req.method !== "GET" && req.method !== "HEAD") ? (req.body as BodyInit | null) : null,
    redirect: "follow",
  } as RequestInit);

  // 5. 构造返回给浏览器的响应（去掉上游 CORS 头，浏览器同源不需要它们）
  const responseHeaders = new Headers(upstream.headers);
  for (const h of [
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-expose-headers",
    "access-control-max-age",
    "timing-allow-origin",
    "x-powered-by",
    "x-envoy-upstream-service-time",
  ]) {
    responseHeaders.delete(h);
  }
  responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  responseHeaders.set("X-Proxy-By", "cf-pages-family-wall");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function handleOptions(req: Request): Response {
  const acrHeaders = req.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    statusText: "No Content",
    headers: {
      "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      "Access-Control-Allow-Headers": acrHeaders ?? "Content-Type, x-family-access, Authorization",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "public, max-age=86400",
      Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
    },
  });
}

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === "OPTIONS") return handleOptions(context.request);
  try {
    return await handleProxy(context as unknown as EventContext<unknown, string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "proxy-unknown");
    return new Response(
      JSON.stringify({ ok: false, error: `Cloudflare 代理层错误：${message}` }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
};
