import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const divider = line.indexOf("=");
        return [line.slice(0, divider), line.slice(divider + 1)];
      }),
  );
}

const env = { ...readEnvFile(".env.local"), ...process.env };
const envId = env.CLOUDBASE_ENV_ID;
const accessCode = env.FAMILY_ACCESS_CODE;

if (!envId) throw new Error(".env.local 缺少 CLOUDBASE_ENV_ID");
if (!/^\d{6}$/.test(accessCode ?? "")) throw new Error("FAMILY_ACCESS_CODE 必须是六位数字");

const sql = readFileSync("database/family-wall.sql", "utf8")
  .replaceAll("__FAMILY_ACCESS_CODE__", accessCode);

const result = spawnSync(
  "npx",
  [
    "tcb",
    "api",
    "tcb",
    "ExecutePGSql",
    "-r",
    "ap-shanghai",
    "--body",
    JSON.stringify({ EnvId: envId, Sql: sql }),
    "--json",
  ],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

