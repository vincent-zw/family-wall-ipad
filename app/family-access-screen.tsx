"use client";

import { FormEvent, useState } from "react";
import { verifyFamilyAccess } from "../src/cloudbase";

declare const __APP_BUILD_TS__: number;

function buildLabel(): string {
  if (typeof __APP_BUILD_TS__ !== "number" || !__APP_BUILD_TS__) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(__APP_BUILD_TS__));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

export function FamilyAccessScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setMessage("");
    try {
      await verifyFamilyAccess(code);
      onUnlocked();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂时无法连接，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-buildid" title="当前部署版本">BUILD · {buildLabel()}</div>
        <div className="access-mark">家</div>
        <p className="panel-kicker">FAMILY WALL</p>
        <h1>欢迎回家</h1>
        <p className="access-copy">输入家庭访问码，查看课程、留言和今日学习任务。</p>
        <form onSubmit={unlock}>
          <label htmlFor="family-code">家庭访问码</label>
          <input id="family-code" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" />
          <button type="submit" disabled={code.length !== 6 || loading}>{loading ? "正在打开…" : "进入家庭看板"}</button>
        </form>
        {message && <p className="access-error" role="alert">{message}</p>}
        <small>这台设备验证一次后会记住访问状态。</small>
      </section>
    </main>
  );
}
