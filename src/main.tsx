import { Component, StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { FamilyAccessScreen } from "../app/family-access-screen";
import { FamilyCallPage } from "../app/family-call-page";
import { FamilyDashboard } from "../app/family-dashboard";
import "../app/globals.css";
import { isCloudBaseConfigured, readSavedAccessCode, verifyFamilyAccess } from "./cloudbase";
import { useAutoUpdate } from "./use-auto-update";

type GateState = "checking" | "locked" | "unlocked";

// /call 是亲戚专用「呼叫家里」独立大字页面，与看板完全隔离
const isCallPage = window.location.pathname === "/call" || window.location.pathname.startsWith("/call/");

/** 渲染错误兜底：任何组件崩溃都不允许整页变白，给一个大按钮一键恢复 */
class FamilyErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("家庭看板渲染出错", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, background: "#faf6ee", textAlign: "center", padding: 24 }}>
          <p style={{ margin: 0, fontSize: 26, color: "#6b7264", fontWeight: 600 }}>页面出了点小问题</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ minHeight: 68, padding: "0 40px", border: 0, borderRadius: 18, background: "#315d4c", color: "#fff", fontSize: 24, fontWeight: 700, cursor: "pointer" }}
          >点一下恢复</button>
        </main>
      );
    }
    return this.props.children;
  }
}

function FamilyWallApp() {
  const [gate, setGate] = useState<GateState>(() => !isCloudBaseConfigured() ? "unlocked" : readSavedAccessCode() ? "checking" : "locked");
  useAutoUpdate();

  useEffect(() => {
    if (gate !== "checking") return;
    const savedCode = readSavedAccessCode();
    verifyFamilyAccess(savedCode)
      .then(() => setGate("unlocked"))
      .catch(() => setGate("locked"));
  }, [gate]);

  if (gate === "checking") {
    return <main className="access-shell"><section className="access-card"><div className="access-mark">家</div><p>正在连接家庭云端…</p></section></main>;
  }
  if (gate === "locked") return <FamilyAccessScreen onUnlocked={() => setGate("unlocked")} />;
  return <FamilyDashboard />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FamilyErrorBoundary>
      {isCallPage ? <FamilyCallPage /> : <FamilyWallApp />}
    </FamilyErrorBoundary>
  </StrictMode>,
);
