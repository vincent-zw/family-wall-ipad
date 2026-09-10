import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家里 · 家庭 AI 看板",
  description: "适合旧 iPad 的家庭留言、提醒与早餐英语看板。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
