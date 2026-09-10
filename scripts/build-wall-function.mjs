import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const functionDir = path.join(projectRoot, "functions", "wall-web");
const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");

const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/i);
const styleMatch = indexHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i);
if (!scriptMatch || !styleMatch) throw new Error("Unable to locate built JavaScript or CSS assets");

const assetPath = (url) => path.join(distDir, url.replace(/^\//, ""));
const [javascript, css] = await Promise.all([
  readFile(assetPath(scriptMatch[1]), "utf8"),
  readFile(assetPath(styleMatch[1]), "utf8"),
]);

const safeJavascript = javascript.replace(/<\/script/gi, "<\\/script");
const html = indexHtml
  .replace(/\s*<link rel="icon"[^>]*>/i, "")
  .replace(styleMatch[0], () => `<style>${css}</style>`)
  .replace(scriptMatch[0], "")
  .replace("</body>", () => `<script>${safeJavascript}</script></body>`);

await mkdir(functionDir, { recursive: true });
await writeFile(path.join(functionDir, "wall.html"), html);
console.log(`Built CloudBase wall page: ${Buffer.byteLength(html)} bytes`);
