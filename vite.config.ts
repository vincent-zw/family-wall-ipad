import { copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// 构建时间戳：注入前端（版本锚点 / 自动更新比对）+ 写入 dist/version.json（检测源）
const BUILD_TS = Date.now();

function buildLabel(ts: number): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function injectBuildTimestamp(): Plugin {
  return {
    name: "inject-build-timestamp",
    config() {
      return { define: { __APP_BUILD_TS__: JSON.stringify(BUILD_TS) } };
    },
    closeBundle() {
      mkdirSync("dist", { recursive: true });
      writeFileSync(
        path.resolve("dist/version.json"),
        JSON.stringify({ ts: BUILD_TS, label: buildLabel(BUILD_TS) }),
      );
      // 亲戚专用呼叫页 /call：物理复制 index.html，绕开 Pages 对该路径的重定向行为
      mkdirSync("dist/call", { recursive: true });
      copyFileSync(path.resolve("dist/index.html"), path.resolve("dist/call/index.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), injectBuildTimestamp()],
  base: "/",
  build: {
    outDir: "dist",
    target: "safari12",
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
