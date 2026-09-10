#!/usr/bin/env node
/**
 * 家庭看板项目：用 isomorphic-git (纯 JS) 初始化仓库 + 首次提交。
 * 系统 git CLI 因缺少 Command Line Tools 无法使用，用 Node 绕过。
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import git from "isomorphic-git";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, "..");

const gitOpts = { fs, dir: REPO_DIR };

async function main() {
  // 1. 检查是否已有 .git
  const gitDir = path.join(REPO_DIR, ".git");
  if (fs.existsSync(gitDir)) {
    console.log("⚠️  已有 .git 目录，跳过 init");
  } else {
    console.log("📦 git init");
    await git.init({ ...gitOpts, defaultBranch: "main" });
    console.log("✅ 仓库已初始化 (main 分支)");
  }

  // 2. 配置用户名和邮箱（如果还没有）
  const name = process.env.GIT_AUTHOR_NAME || process.env.GIT_COMMITTER_NAME || "vincent-zw";
  const email = process.env.GIT_AUTHOR_EMAIL || process.env.GIT_COMMITTER_EMAIL || "vincent-zw@users.noreply.github.com";
  const existingName = await git.getConfig({ ...gitOpts, path: "user.name" }).catch(() => "");
  if (!existingName) {
    await git.setConfig({ ...gitOpts, path: "user.name", value: name });
    await git.setConfig({ ...gitOpts, path: "user.email", value: email });
    console.log(`👤 已设置 user.name=${name}  user.email=${email}`);
  }

  // 3. 添加所有文件（respects .gitignore）
  console.log("📄 git add .");
  await git.add({ ...gitOpts, filepath: "." });

  // 4. 检查当前状态（statusMap 返回 {filepath: status}）
  const statusMap = await git.statusMatrix(gitOpts);
  const changedFiles = statusMap.filter(([f, stage, worktree]) => stage > 0 || worktree > 0);
  if (changedFiles.length === 0) {
    console.log("⚠️  没有需要提交的文件");
    process.exit(0);
  }
  const paths = changedFiles.map(([f]) => f);
  console.log(`   待提交文件示例: ${paths.slice(0, 8).join(", ")}${paths.length > 8 ? ` ... (+${paths.length - 8})` : ""}`);

  // 5. 提交
  console.log(`💾 git commit (${changedFiles.length} 个文件变更)`);
  await git.commit({
    ...gitOpts,
    message: "chore: initial commit — 家庭 AI 看板完整项目",
    author: { name, email },
    committer: { name, email },
  });
  console.log("✅ 首次提交完成");

  // 6. 显示最新 commit
  const log = await git.log({ ...gitOpts, depth: 1 });
  console.log(`\n📋 commit ${log[0].oid.slice(0, 7)} — ${log[0].commit.message.split("\n")[0]}`);
}

main().catch((err) => {
  console.error("❌ 出错了：", err.message);
  process.exit(1);
});
