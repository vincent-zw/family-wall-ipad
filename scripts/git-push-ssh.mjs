#!/usr/bin/env node
/**
 * 通过 SSH key 推送到 GitHub（无需 token、不依赖系统 git）。
 * 用法: node scripts/git-push-ssh.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import git from "isomorphic-git";
import { pushTransport, REMOTE_URL, GITHUB_USER, REPO_NAME, KEY_PATH } from "./lib/ssh-transport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, "..");
const gitOpts = { fs, dir: REPO_DIR };

async function main() {
  let current = "";
  try { current = await git.getConfig({ ...gitOpts, path: "remote.origin.url" }); } catch { /* noop */ }
  if (!current) {
    await git.addRemote({ ...gitOpts, remote: "origin", url: REMOTE_URL });
  } else if (current !== REMOTE_URL) {
    await git.setConfig({ ...gitOpts, path: "remote.origin.url", value: REMOTE_URL });
  }
  console.log(`🔗 remote: ${REMOTE_URL}（实际走 SSH key: ${KEY_PATH}）`);

  const branch = await git.currentBranch({ ...gitOpts, fullname: false });
  console.log(`🌿 分支: ${branch}`);
  console.log("☁️  通过 SSH 推送中…");

  await git.push({
    ...gitOpts,
    http: pushTransport,
    remote: "origin",
    refspec: [`${branch}:${branch}`],
    onProgress: (e) => {
      if (e.phase) process.stdout.write(`\r   ${e.phase} ${e.loaded || 0}${e.total ? `/${e.total}` : ""}   `);
    },
  });
  console.log(`\n🎉 推送成功！👉 https://github.com/${GITHUB_USER}/${REPO_NAME}`);
}

main().catch((e) => { console.error("❌ 推送失败:", e.message); process.exit(1); });
