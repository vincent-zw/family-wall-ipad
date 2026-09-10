#!/usr/bin/env node
/**
 * 家庭看板日常 git 工具（纯 JS，不依赖系统 git / 不需要 token，走 SSH key）。
 *
 *   node scripts/gitv.mjs status                查看改动
 *   node scripts/gitv.mjs log [条数]            查看历史
 *   node scripts/gitv.mjs save "改动说明"        提交全部改动并推送（日常更新用这个）
 *   node scripts/gitv.mjs push                  只推送已提交的内容
 *   node scripts/gitv.mjs show <版本号> <文件>   查看某文件的历史版本内容
 *   node scripts/gitv.mjs restore <版本号> <文件> 把单个文件回溯到历史版本（不动其他文件）
 *
 * 版本号可以是 log 里看到的 7 位短号（如 12beef5）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import git from "isomorphic-git";
import { pushTransport, REMOTE_URL, GITHUB_USER, REPO_NAME } from "./lib/ssh-transport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, "..");
const opts = { fs, dir: REPO_DIR };
const [, , command, ...args] = process.argv;

async function ensureRemote() {
  let current = "";
  try { current = await git.getConfig({ ...opts, path: "remote.origin.url" }); } catch { /* noop */ }
  if (!current) await git.addRemote({ ...opts, remote: "origin", url: REMOTE_URL });
}

async function cmdStatus() {
  const matrix = await git.statusMatrix(opts);
  if (!matrix.length) { console.log("✅ 工作区干净，没有改动"); return; }
  console.log("改动文件：");
  for (const [file, head, workdir, stage] of matrix) {
    let label = "  · ";
    if (head === 0 && workdir === 2) label = "🆕 新增  ";
    else if (head === 1 && workdir === 2) label = "✏️  修改  ";
    else if (workdir === 0) label = "🗑️  删除  ";
    else if (head === 1 && workdir === 1 && stage === 1) continue;
    else label = "❔ 其他  ";
    console.log(`  ${label} ${file}  [${head}/${workdir}/${stage}]`);
  }
}

async function cmdLog(n = 10) {
  const log = await git.log({ ...opts, depth: Number(n) || 10 });
  for (const entry of log) {
    const t = new Date(entry.commit.author.timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
    console.log(`\n● ${entry.oid.slice(0, 7)}  ${t}`);
    console.log(`  ${entry.commit.message.split("\n")[0]}`);
  }
}

async function cmdSave(message) {
  if (!message) { console.error('用法: node scripts/gitv.mjs save "改动说明"'); process.exit(1); }
  await git.add({ ...opts, filepath: "." });
  const hash = await git.commit({ ...opts, message });
  console.log(`✅ 已提交 ${hash.slice(0, 7)}: ${message}`);
  await doPush();
}

async function doPush() {
  await ensureRemote();
  const branch = await git.currentBranch({ ...opts, fullname: false });
  console.log("☁️  推送中…");
  await git.push({ ...opts, http: pushTransport, remote: "origin", refspec: [`${branch}:${branch}`] });
  console.log(`🎉 完成：https://github.com/${GITHUB_USER}/${REPO_NAME}`);
}

async function cmdShow(ref, file) {
  if (!ref || !file) { console.error("用法: node scripts/gitv.mjs show <版本号> <文件路径>"); process.exit(1); }
  const { blob } = await git.readBlob({ ...opts, oid: ref, filepath: file });
  process.stdout.write(Buffer.from(blob));
}

async function cmdRestore(ref, file) {
  if (!ref || !file) { console.error("用法: node scripts/gitv.mjs restore <版本号> <文件路径>"); process.exit(1); }
  await git.checkout({ ...opts, ref, filepaths: [file], force: true, noUpdateHead: true, onConflict: "fail" });
  console.log(`⏪ 已把 ${file} 回溯到 ${ref}（其他文件未动，确认无误后用 save 提交）`);
}

async function main() {
  switch (command) {
    case "status": await cmdStatus(); break;
    case "log": await cmdLog(args[0]); break;
    case "save": await cmdSave(args[0]); break;
    case "push": await doPush(); break;
    case "show": await cmdShow(args[0], args[1]); break;
    case "restore": await cmdRestore(args[0], args[1]); break;
    default:
      console.log("用法: node scripts/gitv.mjs <status|log|save|push|show|restore> ...");
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
