"use client";

import { useEffect, useRef, useState } from "react";
import type { TRTC as TRTCClient } from "trtc-sdk-v5";
import { callSecureFamilyFunction } from "../src/cloudbase";

export type FamilyCallRequest = {
  id: string;
  roomId: number;
  mode: "audio" | "video";
  status: "ringing" | "accepted" | "declined" | "ended";
  callerName: string;
  callerUserId: string;
  createdAt: number;
  expiresAt: number;
  answeredAt?: number;
};

type DeviceRole = "home" | "remote";
type SessionStatus = "idle" | "joining" | "waiting" | "active" | "error";
type Ticket = { sdkAppId: number; userId: string; userSig: string; expiresAt: number };

type FamilyCallProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: FamilyCallRequest | null;
  onRequestChange: (request: FamilyCallRequest | null) => Promise<void>;
  deviceRole: DeviceRole;
  onDeviceRoleChange: (role: DeviceRole) => void;
  /** 与看板共用的 AudioContext（触摸解锁过、保持 running），来电铃声必须复用它才有声音 */
  sharedAudioContextRef: { current: AudioContext | null };
};

const HOME_USER_ID = "family_home_ipad";
const REMOTE_USER_KEY = "family-wall-remote-user-v1";

function remoteUserId() {
  try {
    const saved = window.localStorage.getItem(REMOTE_USER_KEY);
    if (saved) return saved;
    const created = `remote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);
    window.localStorage.setItem(REMOTE_USER_KEY, created);
    return created;
  } catch {
    return `remote_${Date.now().toString(36)}`.slice(0, 32);
  }
}

function readableCallError(error: unknown) {
  let message = "";
  let code = "";
  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object") {
    const detail = error as Record<string, unknown>;
    message = [detail.message, detail.errorMessage, detail.errMsg, detail.reason, detail.detail].find((value) => typeof value === "string") as string || "";
    code = [detail.code, detail.errorCode, detail.extraCode].find((value) => typeof value === "string" || typeof value === "number")?.toString() ?? "";
  } else {
    message = String(error ?? "");
  }
  if (/密钥配置|TRTC_SECRET_KEY/i.test(message)) return "通话服务还差最后一步密钥配置。";
  if (/permission|denied|notallowed/i.test(message)) return "请在 Safari 中允许使用麦克风和摄像头。";
  if (/support|environment|browser/i.test(message)) return "当前浏览器暂不支持实时通话，请确认使用 HTTPS 和 Safari。";
  return `${message || "通话连接失败，请稍后重试。"}${code ? `（错误码 ${code}）` : ""}`;
}

type RingerHandle = { stopped: boolean; getAudio: () => HTMLAudioElement; getSharedContext: () => AudioContext | null; onBlocked: () => void };

// 运行时合成"叮咚"电话铃声 WAV（2.4 秒循环：0.9s 双音 + 1.5s 间隙）。
// 走 <audio> 元素而不是 Web Audio：留言/提醒在这台 iPad 上能出声证明元素/语音通道可靠，
// 而 Web Audio (AudioContext) 在 iOS 13 非手势栈里经常 suspended 且 resume 永远 pending。
function ringtoneDataUrl(): string {
  const sampleRate = 8000;
  const seconds = 2.4;
  const total = Math.floor(sampleRate * seconds);
  const pcm = new Int16Array(total);
  const beepSegments: Array<[number, number]> = [[0.05, 0.4], [0.55, 0.9]];
  for (const [from, to] of beepSegments) {
    const startIdx = Math.floor(from * sampleRate);
    const endIdx = Math.floor(to * sampleRate);
    const segDuration = (endIdx - startIdx) / sampleRate;
    for (let i = startIdx; i < endIdx; i += 1) {
      const t = (i - startIdx) / sampleRate;
      const envelope = Math.min(1, Math.min(t, segDuration - t) / 0.04);
      const value = Math.sin(2 * Math.PI * 880 * t) * 0.55 + Math.sin(2 * Math.PI * 660 * t) * 0.25;
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(value * envelope * 32767)));
    }
  }
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i += 1) view.setInt16(44 + i * 2, pcm[i], true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < sub.length; j += 1) binary += String.fromCharCode(sub[j]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let ringtoneAudioSingleton: HTMLAudioElement | null = null;
let activeRingerHandle: RingerHandle | null = null;

function getRingtoneAudio(): HTMLAudioElement {
  if (!ringtoneAudioSingleton) {
    ringtoneAudioSingleton = new Audio(ringtoneDataUrl());
    ringtoneAudioSingleton.loop = true;
    ringtoneAudioSingleton.volume = 1;
    // 保险：来电期间铃声被外部打断（语音提醒/留言提示音同时到等）→ 自动恢复播放
    ringtoneAudioSingleton.addEventListener("pause", () => {
      window.setTimeout(() => {
        if (activeRingerHandle && !activeRingerHandle.stopped && ringtoneAudioSingleton?.paused) {
          void ringtoneAudioSingleton.play().catch(() => undefined);
        }
      }, 400);
    });
  }
  return ringtoneAudioSingleton;
}

function createRinger(getSharedContext: () => AudioContext | null, onBlocked: () => void): RingerHandle {
  return { stopped: false, getAudio: getRingtoneAudio, getSharedContext, onBlocked };
}

function startRinging(handle: RingerHandle) {
  if (handle.stopped) return;
  activeRingerHandle = handle;
  const audio = handle.getAudio();
  audio.currentTime = 0;
  // 播放被拒（autoplay 未解锁）→ 弹出"轻点开启铃声"兜底按钮；正常播放则不弹
  void audio.play().catch(() => { if (!handle.stopped) handle.onBlocked(); });
}

function stopRinging(handle: RingerHandle | null) {
  if (!handle) return;
  handle.stopped = true;
  if (activeRingerHandle === handle) activeRingerHandle = null;
  try {
    const audio = handle.getAudio();
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // ignore audio teardown errors
  }
  // 共享 AudioContext 属于看板（留言/提醒铃声在用），绝不能 close。
}

/** 通用循环铃声句柄：调 stop() 结束循环（给家庭提醒弹窗复用） */
export type LoopRingHandle = { stopped: boolean };

/** 启动 WAV 叮咚铃声无限循环（提醒弹窗复用来电铃声通道） */
export function startLoopRingtone(): LoopRingHandle | null {
  const ringer = createRinger(() => null, () => undefined);
  const handle = { stopped: false, ringer } as LoopRingHandle & { ringer: RingerHandle };
  startRinging(ringer);
  return handle;
}

/** 停止循环铃声；只有它仍是当前活动铃声时才真正停（避免误停后来的来电铃声） */
export function stopLoopRingtone(handle: LoopRingHandle | null) {
  if (!handle) return;
  handle.stopped = true;
  const ringer = (handle as LoopRingHandle & { ringer?: RingerHandle }).ringer;
  if (ringer && activeRingerHandle === ringer) stopRinging(ringer);
}

export function FamilyCall({ open, onOpenChange, request, onRequestChange, deviceRole, onDeviceRoleChange, sharedAudioContextRef }: FamilyCallProps) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [sessionRequest, setSessionRequest] = useState<FamilyCallRequest | null>(null);
  const [errorText, setErrorText] = useState("");
  const [remotePresent, setRemotePresent] = useState(false);
  const [ringerBlocked, setRingerBlocked] = useState(false);
  const clientRef = useRef<TRTCClient | null>(null);
  const ticketUserIdRef = useRef<string>("");
  const remoteUserUidRef = useRef<string>("");
  // 最近一次"远端视频可用"事件的确定性参数（userId + streamType 以事件实际值为准，禁止猜数字）
  const remoteVideoInfoRef = useRef<{ userId: string; streamType: string } | null>(null);
  const streamTypeMainRef = useRef<string>("main");
  const lastRungIdRef = useRef("");
  const ringerRef = useRef<RingerHandle | null>(null);
  const [remoteVideoState, setRemoteVideoState] = useState<"waiting" | "playing" | "failed">("waiting");
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const pushDebug = (line: string) => {
    console.log("[TRTC]", line);
    // 保留最近 20 条，避免早期关键事件被挤掉
    setDebugLines((prev) => [...prev.slice(-19), `${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${line}`]);
  };

  const remoteVideoStartedRef = useRef(false);

  /** 确认远端画面真实渲染：容器里出现 SDK 创建的 <video> 才算成功。
   *  不信任 startRemoteVideo 的 resolve —— SDK 在“远端未发布视频”时会静默成功，
   *  之前因此误置防重入标记，导致后来真实视频事件到达时被永久挡掉（黑屏根因）。 */
  function remoteVideoInDom() {
    return Boolean(document.getElementById("family-remote-video")?.querySelector("video"));
  }

  function ensureRemoteVideo(reason: string) {
    const client = clientRef.current;
    if (!client) return;
    const el = document.getElementById("family-remote-video");
    const info = remoteVideoInfoRef.current;
    const uid = info?.userId ?? remoteUserUidRef.current;
    if (!el || !uid) {
      window.setTimeout(() => ensureRemoteVideo(reason), 200);
      return;
    }
    if (remoteVideoInDom()) {
      remoteVideoStartedRef.current = true;
      setRemoteVideoState("playing");
      pushDebug(`远端画面已在播放 ${reason}`);
      return;
    }
    const streamType = info?.streamType ?? streamTypeMainRef.current;
    if (remoteVideoStartedRef.current) {
      // 之前误标成功但 video 没出现：SDK 内部状态与 DOM 不一致 → 先 stop 清状态再重绑
      remoteVideoStartedRef.current = false;
      pushDebug(`重置远端绑定 ${reason}`);
      void client.stopRemoteVideo({ userId: uid, streamType }).catch(() => undefined);
    }
    remoteVideoStartedRef.current = true;
    void client.startRemoteVideo({ userId: uid, streamType, view: "family-remote-video" })
      .then(() => {
        pushDebug(`远端绑定成功 ${reason}`);
        // 轮询确认 video 元素真实出现；若没出现说明 SDK 空绑，触发重绑
        let checks = 0;
        const confirm = () => {
          if (remoteVideoInDom()) {
            setRemoteVideoState("playing");
            pushDebug(`远端画面已确认 ${reason}`);
            return;
          }
          if (checks < 8) {
            checks += 1;
            window.setTimeout(confirm, 250);
          } else {
            remoteVideoStartedRef.current = false;
            ensureRemoteVideo(`空绑重试 ${reason}`);
          }
        };
        window.setTimeout(confirm, 300);
      })
      .catch((error: unknown) => {
        remoteVideoStartedRef.current = false;
        const msg = String((error as { message?: string })?.message ?? error);
        if (/already started/i.test(msg)) {
          // SDK 认为已启动：按 video 元素是否真实出现处理
          if (remoteVideoInDom()) setRemoteVideoState("playing");
          else ensureRemoteVideo(`状态重试 ${reason}`);
          return;
        }
        pushDebug(`远端绑定失败(${reason}): ${msg.slice(0, 80)}`);
        window.setTimeout(() => ensureRemoteVideo(reason), 800);
      });
  }

  const incoming = deviceRole === "home" && request?.status === "ringing" && request.expiresAt > Date.now();
  const currentCall = sessionRequest ?? request;
  const callVisible = open || Boolean(incoming) || sessionStatus !== "idle";

  useEffect(() => {
    if (!incoming || !request) {
      if (ringerRef.current) {
        stopRinging(ringerRef.current);
        ringerRef.current = null;
      }
      setRingerBlocked(false);
      return;
    }
    const isNewCall = lastRungIdRef.current !== request.id;
    if (!ringerRef.current) {
      ringerRef.current = createRinger(() => {
        const AudioContextConstructor = window.AudioContext
          ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) return null;
        sharedAudioContextRef.current ??= new AudioContextConstructor();
        return sharedAudioContextRef.current;
      }, () => setRingerBlocked(true));
    }
    const ringer = ringerRef.current;
    if (isNewCall) {
      lastRungIdRef.current = request.id;
      onOpenChange(true);
      // 0.9 秒后自检：WAV 铃声没在播（被 autoplay 拒）→ 显示"轻点开启铃声"兜底按钮
      window.setTimeout(() => {
        if (lastRungIdRef.current !== request.id) return;
        const audio = ringerRef.current?.getAudio();
        setRingerBlocked(!audio || audio.paused);
      }, 900);
      // 先播人声、播完再开始循环铃声：iOS 上 speechSynthesis 会打断正在播的 <audio>，
      // 若同时开始，人声一出来铃声就被暂停且不再恢复（"嘀嘀声被盖掉后消失"的原因）
      let ringStarted = false;
      const beginRing = () => {
        if (ringStarted || ringer.stopped) return;
        ringStarted = true;
        startRinging(ringer);
      };
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(`${request.callerName}正在呼叫家里，请点击接听`);
        utterance.lang = "zh-CN";
        utterance.rate = 0.95;
        utterance.volume = 1;
        utterance.onend = beginRing;
        utterance.onerror = beginRing;
        window.speechSynthesis.speak(utterance);
      }
      // 兜底：iOS 偶发 onend/onerror 都不触发 → 最长 3.8 秒强制开始响铃
      window.setTimeout(beginRing, 3800);
      // 浏览器通知（iPad Safari 桌面模式下会在屏幕顶部弹横幅）
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(`${request.callerName} 正在呼叫家里`, {
            body: request.mode === "video" ? "视频通话请求" : "语音通话请求",
            tag: `family-call-${request.id}`,
            requireInteraction: true,
          });
        } catch {
          // ignore notification errors
        }
      }
      // 全屏闪烁动画信号：往 <body> 打一个 class，CSS 控制高亮
      document.body.classList.add("family-call-incoming");
    } else {
      // 同一通电话的 effect 重跑（expiresAt/status 更新等）：确保铃声仍在响
      const audio = ringer.getAudio();
      if (audio.paused && !ringer.stopped) startRinging(ringer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, request?.id, request?.status, request?.expiresAt]);

  useEffect(() => {
    // 通话进入任何非响铃阶段 → 停铃 + 清 body 动画
    const shouldStop = !incoming && (sessionStatus !== "idle" || !request || request.status === "accepted" || request.status === "declined" || request.status === "ended" || (request.expiresAt ?? 0) <= Date.now());
    if (shouldStop) {
      if (ringerRef.current) {
        stopRinging(ringerRef.current);
        ringerRef.current = null;
      }
      document.body.classList.remove("family-call-incoming");
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  }, [incoming, request?.status, request?.expiresAt, sessionStatus]);

  useEffect(() => () => {
    if (ringerRef.current) {
      stopRinging(ringerRef.current);
      ringerRef.current = null;
    }
    document.body.classList.remove("family-call-incoming");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  /** 手势内强制解锁铃声：点击里 play() 一定能成功；顺带 resume 共享 AudioContext（留言 chime 受益） */
  function enableRingerManually() {
    const ctx = ringerRef.current?.getSharedContext() ?? null;
    if (ctx) void ctx.resume().catch(() => undefined);
    const audio = ringerRef.current?.getAudio();
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().then(() => setRingerBlocked(false)).catch(() => undefined);
    window.setTimeout(() => {
      if (!audio.paused) setRingerBlocked(false);
    }, 300);
  }

  useEffect(() => {
    if (!request || sessionStatus === "idle") return;
    if (request.status === "declined") void leaveRoom(false, "家里暂时无人接听。", "error");
    if (request.status === "ended") void leaveRoom(false, "通话已结束。", "idle");
    // `leaveRoom` always uses the latest TRTC instance held in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.status, sessionStatus]);

  useEffect(() => {
    if (!request || request.status !== "ringing" || request.expiresAt > Date.now()) return;
    void onRequestChange({ ...request, status: "ended" });
  }, [onRequestChange, request]);

  useEffect(() => () => {
    const client = clientRef.current;
    if (!client) return;
    void client.stopLocalVideo().catch(() => undefined);
    void client.stopLocalAudio().catch(() => undefined);
    void client.exitRoom().catch(() => undefined);
    client.destroy();
  }, []);

  async function joinRoom(call: FamilyCallRequest, userId: string, waitingForAnswer: boolean) {
    setSessionRequest(call);
    setSessionStatus("joining");
    setErrorText("");
    setRemotePresent(false);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));

    try {
      const trtcSdk = await import("trtc-sdk-v5");
      const support = await trtcSdk.default.isSupported();
      if (support && support.result === false) throw new Error("Browser environment is not supported");
      const ticket = await callSecureFamilyFunction<Ticket>("trtc-ticket", { userId });
      ticketUserIdRef.current = userId;
      remoteUserUidRef.current = userId === HOME_USER_ID ? (call.callerUserId || "") : "";
      remoteVideoInfoRef.current = null;
      setRemoteVideoState("waiting");
      const client = trtcSdk.default.create();
      clientRef.current = client;
      streamTypeMainRef.current = trtcSdk.default.TYPE?.STREAM_TYPE_MAIN ?? "main";
      client.on(trtcSdk.default.EVENT.REMOTE_USER_ENTER, (event: unknown) => {
        const ev = event as { userId: string };
        remoteUserUidRef.current = ev.userId;
        setRemotePresent(true);
        setSessionStatus("active");
        pushDebug(`对方进房 ${ev.userId}`);
        // 注意：此时对方几乎必然还没发布视频（对端在接听后手势内才 startLocalVideo），
        // 立即 startRemoteVideo 会被 SDK 判定“远端未发布”而静默成功 —— 这正是之前黑屏的根因。
        // 因此只记录 uid，等 REMOTE_VIDEO_AVAILABLE 再绑定。
      });
      client.on(trtcSdk.default.EVENT.REMOTE_USER_EXIT, () => {
        setRemotePresent(false);
        setRemoteVideoState("waiting");
        pushDebug("对方离开");
      });
      // 远端视频可用：此时对方已真正发布视频，是绑定的唯一正确时机
      client.on(trtcSdk.default.EVENT.REMOTE_VIDEO_AVAILABLE, (event: unknown) => {
        const ev = event as { userId: string; streamType: string };
        remoteVideoInfoRef.current = { userId: ev.userId, streamType: ev.streamType };
        pushDebug(`对方开视频 ${ev.userId}/${ev.streamType}`);
        ensureRemoteVideo("视频事件");
      });
      client.on(trtcSdk.default.EVENT.REMOTE_VIDEO_UNAVAILABLE, (event: unknown) => {
        const ev = event as { userId?: string };
        pushDebug(`对方关视频${ev.userId ? ` ${ev.userId}` : ""}`);
        setRemoteVideoState("waiting");
      });
      client.on(trtcSdk.default.EVENT.ERROR, (error) => {
        setErrorText(readableCallError(error));
        pushDebug(`错误 ${String((error as { message?: string })?.message ?? error).slice(0, 60)}`);
      });
      await client.enterRoom({ roomId: call.roomId, sdkAppId: ticket.sdkAppId, userId: ticket.userId, userSig: ticket.userSig });
      await client.startLocalAudio();
      setSessionStatus(waitingForAnswer ? "waiting" : "active");
    } catch (error) {
      await leaveRoom(false, readableCallError(error), "error");
    }
  }

  // sessionStatus 变成 active / waiting 后，视频 DOM 已渲染——启动本地视频 + 补绑远端视频
  useEffect(() => {
    if (sessionStatus !== "active" && sessionStatus !== "waiting") return;
    const client = clientRef.current;
    if (!client || !currentCall || currentCall.mode !== "video") return;
    let localTries = 0;
    const tryStartLocal = () => {
      if (!clientRef.current) return;
      if (document.getElementById("family-local-video")) {
        void client.startLocalVideo({ view: "family-local-video", option: { profile: "360p", useFrontCamera: true } })
          .then(() => pushDebug("本机摄像头已开"))
          .catch((error: unknown) => pushDebug(`本机摄像头失败: ${String((error as { message?: string })?.message ?? error).slice(0, 50)}`));
      } else if (localTries < 15) {
        localTries += 1;
        window.setTimeout(tryStartLocal, 80);
      }
    };
    tryStartLocal();
    // 若对方在进房前就已发布视频（事件先于监听注册的极端情况），DOM 就绪后补一次绑定
    ensureRemoteVideo("接通补绑");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, currentCall?.mode]);

  async function startCall(mode: "audio" | "video") {
    const callerUserId = remoteUserId();
    const createdAt = Date.now();
    const call: FamilyCallRequest = {
      id: `call-${createdAt}-${Math.floor(Math.random() * 10000)}`,
      roomId: Math.floor(100000 + Math.random() * 2000000000),
      mode,
      status: "ringing",
      callerName: "家人",
      callerUserId,
      createdAt,
      expiresAt: createdAt + 180000,
    };
    // 乐观更新：立即显示呼叫界面。云信号发送/进房在后台进行，网络慢时按钮也不会"点了没反应"
    setSessionRequest(call);
    setSessionStatus("waiting");
    try {
      await onRequestChange(call);
      await joinRoom(call, callerUserId, true);
    } catch (error) {
      setSessionRequest(null);
      setSessionStatus("error");
      setErrorText(readableCallError(error));
    }
  }

  async function acceptCall() {
    if (!request) return;
    const accepted = { ...request, status: "accepted" as const, answeredAt: Date.now() };
    // 乐观更新：立即进入接听流程，不让云同步阻塞点击反馈
    setSessionRequest(accepted);
    setSessionStatus("joining");
    try {
      await onRequestChange(accepted);
      await joinRoom(accepted, HOME_USER_ID, false);
    } catch (error) {
      setSessionRequest(null);
      setSessionStatus("error");
      setErrorText(readableCallError(error));
    }
  }

  async function declineCall() {
    if (!request) return;
    onOpenChange(false);
    try {
      await onRequestChange({ ...request, status: "declined" });
    } catch (error) {
      setErrorText(readableCallError(error));
    }
  }

  async function leaveRoom(updateSignal = true, message = "", nextStatus: SessionStatus = "idle") {
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      await client.stopLocalVideo().catch(() => undefined);
      await client.stopLocalAudio().catch(() => undefined);
      await client.exitRoom().catch(() => undefined);
      client.destroy();
    }
    if (updateSignal && currentCall) await onRequestChange({ ...currentCall, status: "ended" }).catch(() => undefined);
    setRemoteVideoState("waiting");
    remoteVideoStartedRef.current = false;
    remoteVideoInfoRef.current = null;
    setRemotePresent(false);
    setSessionRequest(null);
    setErrorText(message);
    setSessionStatus(nextStatus);
    if (nextStatus === "idle") onOpenChange(false);
  }

  function closeDialog() {
    if (sessionStatus === "joining" || sessionStatus === "waiting" || sessionStatus === "active") {
      void leaveRoom();
      return;
    }
    setErrorText("");
    setSessionStatus("idle");
    onOpenChange(false);
  }

  if (!callVisible) return null;

  const inSession = sessionStatus === "joining" || sessionStatus === "waiting" || sessionStatus === "active";
  return (
    <div className="modal-backdrop call-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inSession) closeDialog(); }}>
      <section className="modal-card call-modal" role="dialog" aria-modal="true" aria-labelledby="call-title">
        <div className="modal-heading"><div><span className="panel-kicker">FAMILY CALL</span><h2 id="call-title">{incoming ? "家里来电" : inSession ? "家庭通话" : "呼叫家里"}</h2></div><button className="modal-close" type="button" onClick={closeDialog} aria-label={inSession ? "挂断" : "关闭"}>×</button></div>

        {!inSession && !incoming && <>
          <p className="modal-lead">在外地发起呼叫后，客厅 iPad 会响铃。家人点“接听”后才会开启摄像头或麦克风。</p>
          <div className="call-device-role"><div><strong>这台设备是</strong><small>客厅 iPad 只需设置一次</small></div><div><button className={deviceRole === "remote" ? "selected" : ""} type="button" onClick={() => onDeviceRoleChange("remote")}>我的手机 / 电脑</button><button className={deviceRole === "home" ? "selected" : ""} type="button" onClick={() => onDeviceRoleChange("home")}>客厅 iPad</button></div></div>
          {deviceRole === "remote" ? <div className="call-mode-grid"><button type="button" onClick={() => void startCall("audio")}><span>☎</span><strong>语音呼叫</strong><small>只使用麦克风</small></button><button type="button" onClick={() => void startCall("video")}><span>▣</span><strong>视频呼叫</strong><small>前置摄像头 + 语音</small></button></div> : <div className="home-call-ready"><span>✓</span><div><strong>这台 iPad 已设为家庭接听屏</strong><small>保持网页打开，来电会自动显示接听界面。</small></div></div>}
          {errorText && <p className="call-error">{errorText}</p>}
          <section className="call-security-note"><strong>隐私规则</strong><p>不支持静默监控；家中屏幕必须点击接听。视频只实时传输，默认不录像。</p></section>
        </>}

        {incoming && !inSession && request && <section className="incoming-call"><div className="incoming-call-pulse">{request.mode === "video" ? "▣" : "☎"}</div><h3>{request.callerName}正在呼叫家里</h3><p>{request.mode === "video" ? "视频通话" : "语音通话"} · 接听后才会开启{request.mode === "video" ? "摄像头和麦克风" : "麦克风"}</p><div><button className="decline-call" type="button" onClick={() => void declineCall()}>拒绝</button><button className="accept-call" type="button" onClick={() => void acceptCall()}>接听</button></div>{ringerBlocked && <button className="ringer-unlock" type="button" onClick={enableRingerManually}>🔊 没听到铃声？轻点开启</button>}{errorText && <p className="call-error">{errorText}</p>}</section>}

        {inSession && currentCall && <section className={`active-call ${currentCall.mode}`}>
          <div className="call-video-stage"><div id="family-remote-video" className={`remote-video${remoteVideoState === "playing" ? " playing" : ""}`}><span className="remote-placeholder">{remotePresent ? "正在连接画面…" : sessionStatus === "waiting" ? "正在呼叫家里…" : "等待对方进入…"}</span></div>{currentCall.mode === "video" && <div id="family-local-video" className="local-video"><span>本机画面</span></div>}</div>
          <div className="call-live-status"><i /><div><strong>{sessionStatus === "joining" ? "正在建立安全连接" : sessionStatus === "waiting" ? "客厅 iPad 正在响铃" : remotePresent ? "通话中" : "已接听，等待画面"}</strong><small>{currentCall.mode === "video" ? "摄像头和麦克风已开启" : "麦克风已开启"}</small></div></div>
          {debugLines.length > 0 && <div className="call-debug">
            <button type="button" onClick={() => setShowDebug((v) => !v)}>{showDebug ? "隐藏连接诊断" : "画面不出来？点这里看原因"}</button>
            {showDebug && <pre>{debugLines.join("\n")}</pre>}
          </div>}
          {errorText && <p className="call-error">{errorText}</p>}
          <button className="hangup-call" type="button" onClick={() => void leaveRoom()}>■ 结束通话</button>
        </section>}
      </section>
    </div>
  );
}
