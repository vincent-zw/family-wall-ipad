import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("CloudBase static build contains the family wall entrypoint", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /家里 · 家庭 AI 看板/);
  assert.match(html, /assets\//);
  const files = await stat(new URL("../dist/assets", import.meta.url));
  assert.equal(files.isDirectory(), true);
});
