import { useEffect } from "react";

// 由 vite.config.ts 的 inject-build-timestamp 插件在构建时注入
declare const __APP_BUILD_TS__: number;

const CURRENT_BUILD_TS = typeof __APP_BUILD_TS__ === "number" ? __APP_BUILD_TS__ : 0;
const AUTO_UPDATED_KEY = "fw-auto-updated-ts";

function checkForNewVersion() {
  if (CURRENT_BUILD_TS <= 0) return;
  fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { ts?: number } | null) => {
      const latest = data && typeof data.ts === "number" ? data.ts : 0;
      if (!latest || latest <= CURRENT_BUILD_TS) return;
      // 防循环：同一个目标版本最多自动刷新一次（刷新后若 HTML 仍被顽固缓存就不再刷）
      try {
        if (sessionStorage.getItem(AUTO_UPDATED_KEY) === String(latest)) return;
        sessionStorage.setItem(AUTO_UPDATED_KEY, String(latest));
      } catch {
        // Safari 隐私模式可能禁 sessionStorage，此时仍刷新一次
      }
      // 带 ?v= 时间戳强制绕过旧 HTML 缓存
      window.location.replace(`${window.location.pathname}?v=${latest}${window.location.hash}`);
    })
    .catch(() => undefined);
}

/**
 * 自动更新：页面加载、回到前台（解锁 iPad）、每 5 分钟各检测一次云端版本。
 * 发现新部署 → 自动跳转最新版。用户只需要固定使用 family-wall-ipad.pages.dev。
 */
export function useAutoUpdate() {
  useEffect(() => {
    // 首次检测等页面完全加载后再做：避免弱网下刚渲染就跳转，造成"刷新白屏"的观感
    let timer: number | null = null;
    const runWhenReady = () => {
      if (document.readyState === "complete") {
        window.setTimeout(checkForNewVersion, 1200);
        return;
      }
      window.addEventListener("load", () => window.setTimeout(checkForNewVersion, 1200), { once: true });
    };
    runWhenReady();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForNewVersion();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    timer = window.setInterval(checkForNewVersion, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);
}
