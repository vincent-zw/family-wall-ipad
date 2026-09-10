/**
 * isomorphic-git 的 SSH 传输层（纯 JS，不依赖系统 git）。
 * 通过 ssh2 在 GitHub 上 exec git-receive-pack / git-upload-pack，
 * 对外伪装成 isomorphic-git 需要的 HTTP 插件接口。
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Client } from "ssh2";

export const GITHUB_USER = "vincent-zw";
export const REPO_NAME = "family-wall-ipad";
export const REPO_PATH = `${GITHUB_USER}/${REPO_NAME}.git`;
export const REMOTE_URL = `https://github.com/${REPO_PATH}`; // 仅用于拼协议路径，实际走 SSH
export const KEY_PATH = path.join(os.homedir(), ".ssh", "id_ed25519_github");

function sshExec(gitCommand, body) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const advertChunks = [];
    const dataChunks = [];
    const stderrChunks = [];
    let foundFlush = false;
    let pending = Buffer.alloc(0);

    const fail = (msg) => { try { conn.end(); } catch { /* noop */ } reject(new Error(msg)); };

    conn.on("ready", () => {
      conn.exec(`${gitCommand} '${REPO_PATH}'`, (err, stream) => {
        if (err) return fail(`SSH exec 失败: ${err.message}`);
        stream.stderr.on("data", (d) => stderrChunks.push(d));
        stream.on("error", (e) => fail(`channel 错误: ${e.message}`));

        stream.on("data", (chunk) => {
          if (!foundFlush) {
            // 解析 v0 pkt-line，找到第一个 flush（0000）= advertisement 结束
            pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
            let offset = 0;
            while (true) {
              if (pending.length - offset < 4) return;
              const head = pending.subarray(offset, offset + 4).toString("ascii");
              if (!/^[0-9a-f]{4}$/.test(head)) return fail(`无法解析 ${gitCommand} 头: "${head}"`);
              const len = parseInt(head, 16);
              if (len === 0) { offset += 4; break; }
              if (pending.length - offset < len) return;
              offset += len;
            }
            advertChunks.push(pending.subarray(0, offset));
            const tail = pending.subarray(offset);
            foundFlush = true;
            if (body) {
              if (tail.length) dataChunks.push(tail);
              stream.end(body);
            } else {
              stream.end();
            }
          } else {
            dataChunks.push(chunk);
          }
        });

        stream.on("close", () => {
          conn.end();
          resolve({
            advert: Buffer.concat(advertChunks),
            data: Buffer.concat(dataChunks),
            stderr: Buffer.concat(stderrChunks).toString("utf8"),
          });
        });
      });
    });
    conn.on("error", (e) => reject(new Error(`SSH 连接失败: ${e.message}`)));
    conn.connect({
      host: "github.com",
      port: 22,
      username: "git",
      privateKey: fs.readFileSync(KEY_PATH),
      readyTimeout: 15000,
    });
  });
}

function httpResponse({ url, body, contentType }) {
  return {
    url,
    method: "POST",
    statusCode: 200,
    statusMessage: "OK",
    headers: { "content-type": contentType },
    body: (async function* () { yield body; })(),
  };
}

function makeTransport(service) {
  // service: "git-receive-pack"（推送）或 "git-upload-pack"（拉取/探测）
  const mime = service === "git-receive-pack" ? "git-receive-pack" : "git-upload-pack";
  return {
    async request({ url, body }) {
      const isDiscovery = url.includes("/info/refs");
      let payload = null;
      if (body) {
        const parts = [];
        for await (const part of body) parts.push(Buffer.from(part));
        payload = Buffer.concat(parts);
      }
      const { advert, data, stderr } = await sshExec(service, isDiscovery ? null : payload);
      if (isDiscovery) {
        // SSH 返回裸 v0 advertisement，补上 HTTP smart 协议的 service 头（长度按实际字节计算）
        const line = `# service=${service}\n`;
        const head = Buffer.from(`${String(4 + Buffer.byteLength(line)).padStart(4, "0")}${line}0000`, "ascii");
        return httpResponse({ url, body: Buffer.concat([head, advert]), contentType: `application/x-${mime}-advertisement` });
      }
      if (stderr && !data.length) throw new Error(`GitHub 返回错误: ${stderr}`);
      return httpResponse({ url, body: data, contentType: `application/x-${mime}-result` });
    },
  };
}

export const pushTransport = makeTransport("git-receive-pack");
export const pullTransport = makeTransport("git-upload-pack");
