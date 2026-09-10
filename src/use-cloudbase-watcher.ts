"use client";

import { useEffect, useState } from "react";
import type { StoredDashboard } from "../app/family-dashboard";

export type WatcherStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "online" }
  | { state: "fallback"; reason: string };

export function useCloudBaseStateWatcher(
  _onStateChange: (next: StoredDashboard, updatedAt?: number) => void,
  enabled: boolean,
) {
  const [status, setStatus] = useState<WatcherStatus>({ state: "idle" });

  useEffect(() => {
    if (!enabled) {
      setStatus({ state: "idle" });
      return;
    }
    // 按用户设置：不启用实时同步，全靠 30 秒兜底轮询（白天/通话/深夜频率自动调整）。
    // 保持 enabled → fallback，UI 会一直显示「实时离线·30s 兜底」，避免反复尝试 watch()/长轮询浪费资源。
    setStatus({
      state: "fallback",
      reason: "实时同步未启用（按当前设置走 30 秒兜底轮询：白天 30 秒、深夜 2 分钟、通话阶段 3 秒）",
    });
    return () => setStatus({ state: "idle" });
  }, [enabled]);

  return { status };
}
