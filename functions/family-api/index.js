"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();
const STATE_ID = "shared-family-wall";
const PROGRAM_INDEX_ID = "program-index";
const MAX_PAYLOAD_BYTES = 3000000;
const TRTC_SDK_APP_ID = Number(process.env.TRTC_SDK_APP_ID || 1600159612);
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const accessAttempts = new Map();
const ALLOWED_WEB_ORIGINS = new Set([
  "https://family-wall-ipad-v2-d2bg1e621aa0.service.tcloudbase.com",
  "https://family-wall-ipad-v2-d2bg1e621aa0-1476279485.tcloudbaseapp.com",
  "https://family-wall-ipad.pages.dev",
]);

function isPagesDevOrigin(origin) {
  return typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.family-wall-ipad\.pages\.dev$/i.test(origin);
}

function isHttpInvocation(event) {
  return Boolean(event && (event.httpMethod || event.requestContext || event.headers));
}

function corsHeaders(event) {
  const headers = event?.headers || {};
  const origin = headers.origin || headers.Origin || "";
  const allowed = ALLOWED_WEB_ORIGINS.has(origin) || isPagesDevOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://family-wall-ipad-v2-d2bg1e621aa0.service.tcloudbase.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function safeEqual(received, expected) {
  const left = crypto.createHash("sha256").update(String(received || "")).digest();
  const right = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function base64UrlEncode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "*").replace(/\//g, "-").replace(/=/g, "_");
}

function generateUserSig(userId, expireSeconds = 3600) {
  const secretKey = process.env.TRTC_SECRET_KEY;
  if (!secretKey) throw new Error("TRTC_SECRET_KEY_MISSING");
  const currentTime = Math.floor(Date.now() / 1000);
  const document = {
    "TLS.ver": "2.0",
    "TLS.identifier": userId,
    "TLS.sdkappid": TRTC_SDK_APP_ID,
    "TLS.expire": expireSeconds,
    "TLS.time": currentTime,
  };
  const content = `TLS.identifier:${userId}\nTLS.sdkappid:${TRTC_SDK_APP_ID}\nTLS.time:${currentTime}\nTLS.expire:${expireSeconds}\n`;
  document["TLS.sig"] = crypto.createHmac("sha256", secretKey).update(content).digest("base64");
  return {
    userSig: base64UrlEncode(zlib.deflateSync(JSON.stringify(document))),
    expiresAt: (currentTime + expireSeconds) * 1000,
  };
}

function callerKey(event, context) {
  const auth = context.auth || event.userInfo || {};
  const headers = event.__httpHeaders || {};
  const forwardedFor = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "anonymous";
  const identity = auth.uid || auth.openId || auth.openid || String(forwardedFor).split(",")[0].trim();
  return crypto.createHash("sha256").update(`family-wall:${identity}`).digest("hex");
}

function normalizeInvocation(rawEvent) {
  const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
  const isHttp = Boolean(event.httpMethod || event.requestContext || (event.headers && Object.prototype.hasOwnProperty.call(event, "body")));
  if (!isHttp) return event;

  let body = event.body;
  if (event.isBase64Encoded && typeof body === "string") {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  return {
    ...(body && typeof body === "object" ? body : {}),
    __httpHeaders: event.headers || {},
  };
}

async function readDocument(reference) {
  try {
    const result = await reference.get();
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
  } catch (error) {
    if (error && (error.code === "RESOURCE_NOT_FOUND" || error.code === "DATABASE_REQUEST_FAILED" || error.code === -1)) return null;
    throw error;
  }
}

async function validateAccess(event, context) {
  const expectedCode = process.env.FAMILY_ACCESS_CODE;
  if (!expectedCode) return { ok: false, error: "云端尚未设置家庭访问码" };

  const key = callerKey(event, context);
  const attempt = accessAttempts.get(key);
  const now = Date.now();

  // A valid family code must always recover immediately from an earlier typo.
  // Rate limiting applies only to invalid attempts, never to authenticated calls.
  if (safeEqual(event.code, expectedCode)) {
    if (attempt) accessAttempts.delete(key);
    return { ok: true };
  }

  if (attempt && now - attempt.windowStarted < ATTEMPT_WINDOW_MS && attempt.failedCount >= MAX_FAILURES) {
    return { ok: false, error: "尝试次数过多，请 15 分钟后再试" };
  }

  const sameWindow = attempt && now - attempt.windowStarted < ATTEMPT_WINDOW_MS;
  accessAttempts.set(key, {
    failedCount: sameWindow ? attempt.failedCount + 1 : 1,
    windowStarted: sameWindow ? attempt.windowStarted : now,
  });
  return { ok: false, error: "访问码不正确" };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

async function readPrograms(from, days) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from || "") ? dateFromKey(from) : new Date();
  const count = Math.max(1, Math.min(14, Number(days) || 7));
  try {
    const result = await db.collection("family_morning").doc(PROGRAM_INDEX_ID).get();
    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    const stored = Array.isArray(record?.programs) ? record.programs : [];
    const wanted = new Set();
    for (let offset = 0; offset < count; offset += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
      wanted.add(dateKey(date));
    }
    const programs = stored.filter((program) => program && wanted.has(program.date)).sort((a, b) => a.date.localeCompare(b.date));
    const fileIDs = Array.from(new Set(programs.flatMap((program) => program.audio?.chapters || []).map((chapter) => chapter.fileID).filter(Boolean)));
    if (fileIDs.length === 0) return programs;
    const signed = await app.getTempFileURL({ fileList: fileIDs.map((fileID) => ({ fileID, maxAge: 24 * 60 * 60 })) });
    const urls = new Map((signed.fileList || []).map((item) => [item.fileID, item.tempFileURL]));
    return programs.map((program) => ({
      ...program,
      audio: program.audio ? {
        ...program.audio,
        chapters: (program.audio.chapters || []).map((chapter) => ({ ...chapter, audioUrl: urls.get(chapter.fileID) || "" })),
      } : program.audio,
    }));
  } catch (error) {
    console.error("family-api program index error", error);
    return [];
  }
}

async function readDinnerPrograms(from, days) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from || "") ? dateFromKey(from) : new Date();
  const count = Math.max(1, Math.min(10, Number(days) || 7));
  try {
    const result = await db.collection("family_dinner").doc("dinner-program-index").get();
    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    const stored = Array.isArray(record?.programs) ? record.programs : [];
    const wanted = new Set();
    for (let offset = 0; offset < count; offset += 1) {
      wanted.add(dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)));
    }
    const programs = stored.filter((program) => program && wanted.has(program.date)).sort((a, b) => a.date.localeCompare(b.date));
    const fileIDs = programs.flatMap((program) => program.audio?.chapters || []).map((chapter) => chapter.fileID).filter(Boolean);
    if (fileIDs.length === 0) return programs;
    const signed = await app.getTempFileURL({ fileList: fileIDs.map((fileID) => ({ fileID, maxAge: 24 * 60 * 60 })) });
    const urls = new Map((signed.fileList || []).map((item) => [item.fileID, item.tempFileURL]));
    return programs.map((program) => ({
      ...program,
      audio: program.audio ? { ...program.audio, chapters: (program.audio.chapters || []).map((chapter) => ({ ...chapter, audioUrl: urls.get(chapter.fileID) || "" })) } : program.audio,
    }));
  } catch (error) {
    console.error("family-api dinner index error", error);
    return [];
  }
}

async function handleRequest(rawEvent = {}, context = {}) {
  const event = normalizeInvocation(rawEvent);
  try {
    const access = await validateAccess(event, context);
    if (!access.ok) return access;

    if (event.action === "authenticate") return { ok: true };

    if (event.action === "trtc-ticket") {
      const userId = String(event.userId || "");
      if (!/^[A-Za-z0-9_-]{3,32}$/.test(userId)) return { ok: false, error: "通话设备标识不正确" };
      if (!process.env.TRTC_SECRET_KEY) return { ok: false, error: "通话服务尚未完成密钥配置" };
      const ticket = generateUserSig(userId);
      return { ok: true, data: { sdkAppId: TRTC_SDK_APP_ID, userId, ...ticket } };
    }

    if (event.action === "get-programs") {
      const programs = await readPrograms(event.from, event.days);
      return { ok: true, data: programs };
    }

    if (event.action === "get-dinner-programs") {
      return { ok: true, data: await readDinnerPrograms(event.from, event.days) };
    }

    if (event.action === "prepare-dinner-program") {
      const called = await app.callFunction({ name: "daily-dinner", data: { date: String(event.date || "") } });
      const response = called && called.result ? called.result : called;
      if (!response || response.ok === false) return { ok: false, error: "晚餐内容准备失败" };
      return { ok: true, data: await readDinnerPrograms(event.date, 1) };
    }

    if (event.action === "message-alert-audio") {
      const allowedRecipients = new Set(["全家", "周毅成", "周毅然", "爸爸", "妈妈"]);
      const recipient = allowedRecipients.has(String(event.recipient || "")) ? String(event.recipient) : "全家";
      const called = await app.callFunction({
        name: "tts-worker",
        data: {
          text: `有一条给${recipient}的新留言。`,
          language: "zh",
          sessionId: `note-${recipient}-${Date.now()}`,
        },
      });
      const response = called && called.result ? called.result : called;
      if (!response || response.ok === false || !response.data?.audio) return { ok: false, error: "留言语音暂时无法生成" };
      return { ok: true, data: { audio: response.data.audio, mimeType: "audio/mpeg" } };
    }

    if (event.action === "reminder-alert-audio") {
      const reminderText = String(event.text || "").replace(/[\r\n]+/g, "，").trim().slice(0, 120);
      if (!reminderText) return { ok: false, error: "提醒内容不能为空" };
      const called = await app.callFunction({
        name: "tts-worker",
        data: {
          text: `家庭提醒。${reminderText}。`,
          language: "zh",
          sessionId: `reminder-${Date.now()}`,
        },
      });
      const response = called && called.result ? called.result : called;
      if (!response || response.ok === false || !response.data?.audio) return { ok: false, error: "提醒语音暂时无法生成" };
      return { ok: true, data: { audio: response.data.audio, mimeType: "audio/mpeg" } };
    }

    if (event.action === "prepare-programs" || event.action === "regenerate-program") {
      const data = event.action === "regenerate-program"
        ? { regenerateDate: String(event.date || "") }
        : { startDate: event.from, days: Math.max(1, Math.min(14, Number(event.days) || 8)) };
      const result = await app.callFunction({ name: "daily-english", data });
      const response = result && result.result ? result.result : result;
      if (!response || response.ok === false) return { ok: false, error: "云端课程准备失败" };
      const programs = await readPrograms(event.from || event.date, event.action === "regenerate-program" ? 1 : event.days);
      return { ok: true, data: programs };
    }

    const stateRef = db.collection("family_state").doc(STATE_ID);
    if (event.action === "get") {
      const record = await readDocument(stateRef);
      return { ok: true, data: record ? record.payload : null, updatedAt: record ? record.updatedAt : null };
    }

    if (event.action === "upsert-events") {
      const incoming = Array.isArray(event.items)
        ? event.items.filter((item) => item && item.kind === "event" && item.id && item.text && typeof item.weekday === "number")
        : [];
      if (incoming.length === 0 || incoming.length > 100) return { ok: false, error: "课程数据格式不正确" };
      const record = await readDocument(stateRef);
      const currentPayload = record?.payload && typeof record.payload === "object" ? record.payload : {};
      const currentItems = Array.isArray(currentPayload.items) ? currentPayload.items : [];
      const incomingIds = new Set(incoming.map((item) => String(item.id)));
      const now = Date.now();
      const items = [
        ...currentItems.filter((item) => !incomingIds.has(String(item?.id || ""))),
        ...incoming.map((item) => ({
          id: String(item.id),
          kind: "event",
          text: String(item.text).slice(0, 80),
          member: item.member === "周毅然" ? "周毅然" : "周毅成",
          weekday: Number(item.weekday),
          startTime: String(item.startTime || "").slice(0, 5),
          endTime: String(item.endTime || "").slice(0, 5),
          due: String(item.due || "").slice(0, 40),
          done: Boolean(item.done),
          announced: Boolean(item.announced),
          createdAt: String(item.createdAt || new Date(now).toISOString()),
          createdAtMs: Number(item.createdAtMs || now),
        })),
      ];
      const payload = { ...currentPayload, items };
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES) return { ok: false, error: "家庭数据过大" };
      await stateRef.set({ payload, updatedAt: now });
      return { ok: true, data: { count: incoming.length }, updatedAt: now };
    }

    if (event.action === "put") {
      let payload = event.payload;
      if (!payload || typeof payload !== "object") return { ok: false, error: "家庭数据格式不正确" };

      // A wall iPad can briefly submit an older snapshot while its polling
      // request is in flight. Never let that stale snapshot erase an active
      // call created by the remote device. Matching call ids still allow the
      // normal accepted/ended transitions to pass through.
      const currentRecord = await readDocument(stateRef);
      const currentPayload = currentRecord?.payload && typeof currentRecord.payload === "object" ? currentRecord.payload : {};
      const currentCall = currentPayload.callRequest;
      const incomingCall = payload.callRequest;
      const currentCallActive = currentCall && (currentCall.status === "accepted" || (currentCall.status === "ringing" && Number(currentCall.expiresAt || 0) > Date.now()));
      const isSameCall = currentCall && incomingCall && String(currentCall.id) === String(incomingCall.id);
      if (currentCallActive && !isSameCall && (!incomingCall || Number(incomingCall.createdAt || 0) < Number(currentCall.createdAt || 0))) {
        payload = { ...payload, callRequest: currentCall };
      }

      // Same call id: guard against lifecycle regression. A stale ringing
      // snapshot must never overwrite accepted/declined/ended, and nothing
      // is allowed to overwrite ended (terminal). Accepted <-> declined are
      // parallel outcomes and must not overwrite each other either.
      if (isSameCall) {
        const stored = String(currentCall.status);
        const next = String(incomingCall.status);
        const storedIsFinal = stored === "ended";
        const storedIsResolved = stored === "accepted" || stored === "declined" || storedIsFinal;
        const regressRinging = next === "ringing" && storedIsResolved;
        const regressFromEnded = storedIsFinal && next !== "ended";
        const flipAcceptedDeclined =
          (stored === "accepted" && next === "declined") ||
          (stored === "declined" && next === "accepted");
        if (regressRinging || regressFromEnded || flipAcceptedDeclined) {
          payload = { ...payload, callRequest: currentCall };
        }
      }

      const encoded = JSON.stringify(payload);
      if (Buffer.byteLength(encoded, "utf8") > MAX_PAYLOAD_BYTES) return { ok: false, error: "家庭数据过大" };
      const updatedAt = Date.now();
      await stateRef.set({ payload, updatedAt });
      return { ok: true, updatedAt };
    }

    return { ok: false, error: "未知操作" };
  } catch (error) {
    console.error("family-api error", error);
    return { ok: false, error: "家庭云端暂时无法连接" };
  }
}

exports.main = async (rawEvent = {}, context = {}) => {
  if (!isHttpInvocation(rawEvent)) return handleRequest(rawEvent, context);

  const method = String(rawEvent.httpMethod || rawEvent.requestContext?.http?.method || "POST").toUpperCase();
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(rawEvent),
      body: "",
      isBase64Encoded: false,
    };
  }

  const result = await handleRequest(rawEvent, context);
  return {
    statusCode: 200,
    headers: corsHeaders(rawEvent),
    body: JSON.stringify(result),
    isBase64Encoded: false,
  };
};
