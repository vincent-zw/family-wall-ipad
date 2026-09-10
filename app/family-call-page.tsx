"use client";

// 亲戚专用「呼叫家里」独立页面（/call）：
// 只保留语音呼叫一个功能，超大字体按钮，无看板内容。
// 访问码：支持链接尾部 #code=XXXX 直接携带（不经过服务器），也支持手输一次记住。

import { useCallback, useEffect, useRef, useState } from "react";
import { callFamilyApi, readSavedAccessCode, saveAccessCode } from "../src/cloudbase";
import { useAutoUpdate } from "../src/use-auto-update";

type CallStatus = "ringing" | "accepted" | "declined" | "ended";

type FamilyCallRequest = {
  id: string;
  roomId: number;
  mode: "audio" | "video";
  status: CallStatus;
  callerName: string;
  callerUserId: string;
  createdAt: number;
  expiresAt: number;
};

type StoredDashboard = {
  items?: unknown;
  lessonDone?: unknown;
  announceEnabled?: unknown;
  contentQueue?: unknown;
  morningPlan?: unknown;
  dinnerPlan?: unknown;
  callRequest?: FamilyCallRequest | null;
};

type TrtcClient = {
  on: (event: string, handler: (payload?: unknown) => void) => void;
  enterRoom: (params: Record<string, unknown>) => Promise<unknown>;
  exitRoom: (params?: Record<string, unknown>) => Promise<unknown>;
  startLocalAudio: (params?: Record<string, unknown>) => Promise<unknown>;
  stopLocalAudio: (params?: Record<string, unknown>) => Promise<unknown>;
  startLocalVideo: (params: Record<string, unknown>) => Promise<unknown>;
  stopLocalVideo: (params?: Record<string, unknown>) => Promise<unknown>;
  startRemoteVideo: (params: Record<string, unknown>) => Promise<unknown>;
  destroy: () => void;
};

const CALLER_USER_KEY = "family-wall-guest-caller-id-v1";

function guestCallerId() {
  try {
    const saved = window.localStorage.getItem(CALLER_USER_KEY);
    if (saved) return saved;
    const created = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);
    window.localStorage.setItem(CALLER_USER_KEY, created);
    return created;
  } catch {
    return `guest_${Date.now().toString(36)}`.slice(0, 32);
  }
}

type Phase = "entering" | "need-code" | "idle" | "calling" | "talking" | "finished";

export function FamilyCallPage() {
  useAutoUpdate();
  const [phase, setPhase] = useState<Phase>("entering");
  const [code, setCode] = useState("");
  const [statusLine, setStatusLine] = useState("正在连接家庭云端…");
  const [errorLine, setErrorLine] = useState("");
  const [remoteJoined, setRemoteJoined] = useState(false);

  const callRef = useRef<FamilyCallRequest | null>(null);
  const clientRef = useRef<TrtcClient | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("entering");
  phaseRef.current = phase;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const leaveTrtcRoom = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    try { await client.stopLocalVideo(); } catch { /* already stopped */ }
    try { await client.stopLocalAudio(); } catch { /* already stopped */ }
    try { await client.exitRoom(); } catch { /* already left */ }
    client.destroy();
  }, []);

  /** 取整包 → 只改 callRequest → 存回（云端 put 是整包替换，绝不能只传呼叫字段） */
  const publishCall = useCallback(async (callRequest: FamilyCallRequest | null): Promise<boolean> => {
    const current = await callFamilyApi<StoredDashboard | null>("get");
    const data = (current.data ?? {}) as StoredDashboard;
    const payload: StoredDashboard = {
      items: data.items ?? [],
      lessonDone: data.lessonDone ?? {},
      announceEnabled: Boolean(data.announceEnabled),
      contentQueue: Array.isArray(data.contentQueue) ? data.contentQueue : [],
      morningPlan: data.morningPlan ?? undefined,
      dinnerPlan: data.dinnerPlan ?? undefined,
      callRequest,
    };
    await callFamilyApi("put", payload);
    return true;
  }, []);

  const finishCall = useCallback(async (nextStatus: CallStatus, message: string) => {
    stopPolling();
    await leaveTrtcRoom();
    const call = callRef.current;
    callRef.current = null;
    if (call && call.status !== "ended") {
      try { await publishCall({ ...call, status: nextStatus === "declined" ? "ended" : nextStatus }); } catch { /* 状态尽力同步 */ }
    }
    setRemoteJoined(false);
    setStatusLine(message);
    setPhase("finished");
  }, [leaveTrtcRoom, publishCall, stopPolling]);

  /** 呼叫期间轮询：看 iPad 那边接听/拒绝/挂断 */
  const startPolling = useCallback((call: FamilyCallRequest) => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      if (phaseRef.current !== "calling" && phaseRef.current !== "talking") return;
      try {
        const result = await callFamilyApi<StoredDashboard | null>("get");
        const remote = (result.data ?? {}).callRequest ?? null;
        if (!remote || remote.id !== call.id) {
          void finishCall("ended", "呼叫已结束。");
          return;
        }
        if (remote.status === "accepted" && phaseRef.current === "calling") {
          setPhase("talking");
          setStatusLine("已接通，请说话");
          return;
        }
        if (remote.status === "declined") { void finishCall("declined", "家里现在不方便接听。"); return; }
        if (remote.status === "ended") { void finishCall("ended", "通话已结束。"); return; }
        if (remote.status === "ringing" && Date.now() > remote.expiresAt) { void finishCall("ended", "没人接听，稍后再试试。"); return; }
      } catch { /* 网络抖动下一轮再试 */ }
    }, 3000);
  }, [finishCall, stopPolling]);

  const joinRoom = useCallback(async (call: FamilyCallRequest) => {
    const trtcSdk = await import("trtc-sdk-v5");
    const support = await trtcSdk.default.isSupported();
    if (support && support.result === false) throw new Error("这台手机的浏览器不支持视频通话");
    const ticket = await callSecureTicket();
    const client = trtcSdk.default.create() as TrtcClient;
    clientRef.current = client;
    client.on(trtcSdk.default.EVENT.REMOTE_USER_ENTER, () => {
      setRemoteJoined(true);
      setPhase("talking");
      setStatusLine("已接通");
    });
    client.on(trtcSdk.default.EVENT.REMOTE_USER_EXIT, () => setRemoteJoined(false));
    client.on(trtcSdk.default.EVENT.REMOTE_VIDEO_AVAILABLE, (event: unknown) => {
      const ev = event as { userId: string; streamType: number };
      // 视频 DOM 可能还没渲染（calling 阶段对方先到了），等 DOM 就绪再调
      const tryStart = () => {
        if (!clientRef.current) return;
        if (document.getElementById("guest-remote-video")) {
          void clientRef.current.startRemoteVideo({ userId: ev.userId, streamType: ev.streamType, view: "guest-remote-video" });
        } else {
          window.setTimeout(tryStart, 100);
        }
      };
      tryStart();
    });
    client.on(trtcSdk.default.EVENT.ERROR, () => setErrorLine("通话连接出了点问题，请重新呼叫。"));
    await client.enterRoom({ roomId: call.roomId, sdkAppId: ticket.sdkAppId, userId: ticket.userId, userSig: ticket.userSig });
    await client.startLocalAudio();
    // startLocalVideo 必须等 DOM 里有 #guest-local-video（talking 阶段才渲染），
    // 这里只进房间 + 开音频，视频延后到下面的 useEffect 里调
  }, []);

  // talking 阶段视频 DOM 已就绪：启动本地视频 + 补播可能已错过的远端视频
  useEffect(() => {
    if (phase !== "talking") return;
    const client = clientRef.current;
    if (!client) return;
    if (callRef.current?.mode !== "video") return;
    const tryStartLocal = () => {
      if (document.getElementById("guest-local-video")) {
        void client.startLocalVideo({ view: "guest-local-video", option: { profile: "360p", useFrontCamera: true } })
          .catch(() => { /* 摄像头权限被拒等情况，不影响语音通话 */ });
      } else {
        window.setTimeout(tryStartLocal, 80);
      }
    };
    tryStartLocal();
    // 远端视频如果在 calling 阶段就到了，上面的 tryStart 已排好重试；这里再兜底一次
    window.setTimeout(() => {
      if (clientRef.current && document.getElementById("guest-remote-video")) {
        // SDK 会自动绑定已到达的远端流，无需额外参数
      }
    }, 400);
  }, [phase]);

  const startCall = useCallback(async () => {
    setErrorLine("");
    setPhase("calling");
    setStatusLine("正在呼叫家里…请等一会儿");
    const createdAt = Date.now();
    const call: FamilyCallRequest = {
      id: `call-${createdAt}-${Math.floor(Math.random() * 10000)}`,
      roomId: Math.floor(100000 + Math.random() * 2000000000),
      mode: "video",
      status: "ringing",
      callerName: "奶奶",
      callerUserId: guestCallerId(),
      createdAt,
      expiresAt: createdAt + 180000,
    };
    callRef.current = call;
    try {
      await publishCall(call);
      await joinRoom(call);
      startPolling(call);
    } catch (error) {
      callRef.current = null;
      await leaveTrtcRoom();
      setPhase("idle");
      setStatusLine("");
      setErrorLine(error instanceof Error && !/暂时无法连接|超时|network/i.test(error.message)
        ? error.message
        : "网络不太顺畅，呼叫没有发出去。请再按一次试试。");
    }
  }, [joinRoom, leaveTrtcRoom, publishCall, startPolling]);

  const hangUp = useCallback(() => {
    void finishCall("ended", "已挂断。想再聊就再按绿色按钮。");
  }, [finishCall]);

  // 进入页面：链接里带 #code=XXXX 就直接记住；否则看本机有没有存过
  useEffect(() => {
    const hashMatch = window.location.hash.match(/code=([A-Za-z0-9_-]+)/);
    if (hashMatch) {
      saveAccessCode(hashMatch[1]);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const check = async () => {
      const saved = readSavedAccessCode();
      if (!saved) { setPhase("need-code"); return; }
      try {
        await callFamilyApi<StoredDashboard | null>("get");
        setPhase("idle");
        setStatusLine("");
      } catch {
        setPhase("need-code");
      }
    };
    void check();
    return () => {
      stopPolling();
      void leaveTrtcRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setErrorLine("");
    try {
      await callFamilyApi<StoredDashboard | null>("get", undefined, trimmed);
      saveAccessCode(trimmed);
      setPhase("idle");
      setStatusLine("");
    } catch {
      setErrorLine("访问码不对，请再输一次。");
    }
  };

  if (phase === "entering") {
    return <main className="callpage"><p className="callpage-status">{statusLine}</p></main>;
  }

  if (phase === "need-code") {
    return (
      <main className="callpage">
        <h1 className="callpage-title">呼叫家里</h1>
        <p className="callpage-hint">第一次使用，请输入家庭访问码</p>
        <input
          className="callpage-code-input"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="访问码"
        />
        <button className="callpage-big-green" type="button" onClick={() => void submitCode()}>确定</button>
        {errorLine && <p className="callpage-error">{errorLine}</p>}
      </main>
    );
  }

  return (
    <main className="callpage">
      <h1 className="callpage-title">呼叫家里</h1>
      {(phase === "idle" || phase === "finished") && (
        <>
          <button className="callpage-big-green" type="button" onClick={() => void startCall()}>▣<span>视频呼叫</span></button>
          {statusLine && <p className="callpage-status">{statusLine}</p>}
        </>
      )}
      {phase === "calling" && (
        <>
          <div className="callpage-pulse"><span /><span /><span /></div>
          <button className="callpage-big-red" type="button" onClick={hangUp}>✕<span>不打了</span></button>
        </>
      )}
      {phase === "talking" && (
        <>
          <div className="callpage-video-stage">
            <div id="guest-remote-video" className="callpage-remote-video" />
            <div id="guest-local-video" className="callpage-local-video" />
          </div>
          <p className="callpage-talking">{remoteJoined ? "通话中" : "正在接通…"}</p>
          <button className="callpage-big-red" type="button" onClick={hangUp}>✕<span>挂断</span></button>
        </>
      )}
      {errorLine && <p className="callpage-error">{errorLine}</p>}
    </main>
  );
}

async function callSecureTicket() {
  const { callSecureFamilyFunction } = await import("../src/cloudbase");
  return callSecureFamilyFunction<{ sdkAppId: number; userId: string; userSig: string }>("trtc-ticket", { userId: guestCallerId() });
}
