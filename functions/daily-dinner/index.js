"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const ENV_ID = process.env.CLOUDBASE_ENV_ID || "family-wall-ipad-v2-d2bg1e621aa0";
const app = cloudbase.init({ env: ENV_ID, timeout: 120000 });
const db = app.database();
const INDEX_ID = "dinner-program-index";

const INTERACTIONS = [
  ["☀️", "每个人说一件今天让自己开心的小事。"],
  ["🎬", "如果把今天拍成一部电影，你会给它取什么名字？"],
  ["💡", "每个人说一件今天新学会的小事。"],
  ["🤝", "今天有没有一个人，让你想对他说声谢谢？"],
  ["😄", "今天发生过什么好笑的事？每个人说一件。"],
  ["⚡️", "如果今晚可以拥有一种超能力，你会选择什么？"],
  ["🏅", "今天哪件小事，让你觉得自己做得不错？"],
  ["🌱", "明天你最期待的一件事是什么？"],
  ["💬", "用三个词形容你的今天。"],
  ["🗺️", "如果周末全家出发，你最想一起去哪里？"],
  ["❤️", "今天你为别人做过一件什么小事？"],
  ["🧠", "每个人用一句话，教全家一个自己知道的小知识。"],
];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function interactionForDate(date) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const [icon, prompt] = INTERACTIONS[Math.abs(day) % INTERACTIONS.length];
  return { id: `dinner-${Math.abs(day) % INTERACTIONS.length}`, icon, prompt };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "FamilyWall/1.0 (children daily briefing)" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`source ${response.status}`);
  return response.json();
}

async function collectSources(date) {
  const sources = [];
  const tasks = [
    fetchJson("https://api.spaceflightnewsapi.net/v4/articles/?limit=5&ordering=-published_at").then((data) => {
      for (const item of (data.results || []).slice(0, 4)) sources.push({ title: item.title, summary: item.summary || "", url: item.url, provider: item.news_site || "Spaceflight News" });
    }),
    fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson").then((data) => {
      for (const item of (data.features || []).slice(0, 3)) sources.push({ title: item.properties?.title || "地理事件", summary: item.properties?.place || "", url: item.properties?.url || "https://earthquake.usgs.gov/", provider: "USGS" });
    }),
    fetchJson(`https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/all/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`).then((data) => {
      for (const item of (data.events || []).slice(0, 5)) {
        const page = item.pages?.[0];
        sources.push({ title: `${item.year}年：${item.text}`, summary: page?.extract || "", url: page?.content_urls?.desktop?.page || "https://zh.wikipedia.org/", provider: "维基百科·历史上的今天" });
      }
    }),
  ];
  await Promise.allSettled(tasks);
  return sources.filter((item) => item.title && item.url).slice(0, 6);
}

function cleanJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未返回 JSON");
  return JSON.parse(match[0]);
}

async function makeScript(date, sources) {
  if (sources.length === 0) throw new Error("今日公开来源暂时不可用");
  const ai = app.ai();
  const model = ai.createModel("cloudbase");
  const material = sources.slice(0, 5).map((item, index) => `${index + 1}.[${item.provider}]${String(item.title).slice(0, 120)}；${String(item.summary || "").slice(0, 100)}`).join("\n");
  const response = await model.generateText({
    model: "hy3",
    messages: [{
      role: "user",
      content: `${dateKey(date)}儿童晚餐新闻。仅依据材料选2至3条科技/太空、自然地理或历史内容，事实准确、语气有趣，回避暴力政治广告；解释一个词，结尾提一个家庭问题。维基材料称“历史上的今天”。写600至680汉字、约3分钟。只返回JSON：{"title":"标题","summary":"55字内","script":"播报稿","sourceIndexes":[1,2,3]}。\n${material}`,
    }],
  });
  const generated = cleanJson(response.text);
  const indexes = Array.isArray(generated.sourceIndexes) ? generated.sourceIndexes : [];
  return {
    newsTitle: String(generated.title || "今晚三分钟·科技地理历史"),
    newsSummary: String(generated.summary || "一起听听今天的新发现。").slice(0, 90),
    newsScript: String(generated.script || "").slice(0, 1000),
    sources: indexes.map((index) => sources[Number(index) - 1]).filter(Boolean).slice(0, 4),
  };
}

function splitScript(script) {
  const sentences = script.match(/[^。！？!?]+[。！？!?]?/g) || [script];
  const parts = [];
  let current = "";
  for (const sentence of sentences) {
    let remaining = sentence;
    if (current && (current + remaining).length > 140) {
      parts.push(current);
      current = "";
    }
    while (remaining.length > 140) {
      parts.push(remaining.slice(0, 140));
      remaining = remaining.slice(140);
    }
    current += remaining;
  }
  if (current) parts.push(current);
  return parts.filter(Boolean);
}

async function synthesize(program) {
  const chapters = [];
  for (const [index, text] of splitScript(program.newsScript).entries()) {
    const called = await app.callFunction({ name: "tts-worker", data: { text, language: "zh", sessionId: `dinner-${program.date}-${index}` } });
    const response = called?.result || called;
    if (!response?.ok || !response.data?.audio) throw new Error(response?.error || "晚餐新闻音频生成失败");
    const cloudPath = `family-dinner-audio/${program.date}/news-${index + 1}.mp3`;
    const uploaded = await app.uploadFile({ cloudPath, fileContent: Buffer.from(response.data.audio, "base64") });
    chapters.push({ id: `news-${index + 1}`, title: `晚餐新闻 ${index + 1}/${splitScript(program.newsScript).length}`, fileID: uploaded.fileID, durationSeconds: Math.max(25, Math.ceil(text.length / 3.8)) });
  }
  return { ...program, audio: { status: "ready", durationSeconds: chapters.reduce((sum, item) => sum + item.durationSeconds, 0), chapters } };
}

async function readPrograms() {
  try {
    const result = await db.collection("family_dinner").doc(INDEX_ID).get();
    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    return Array.isArray(record?.programs) ? record.programs : [];
  } catch (error) {
    if (error?.code === "RESOURCE_NOT_FOUND" || error?.code === "DATABASE_COLLECTION_NOT_EXIST" || error?.code === -1 || /not exist/i.test(error?.message || "")) {
      await db.createCollection("family_dinner");
      return [];
    }
    throw error;
  }
}

async function prepareDate(date) {
  const key = dateKey(date);
  const interaction = interactionForDate(date);
  const collected = await collectSources(date);
  try {
    const news = await makeScript(date, collected);
    return await synthesize({ id: `dinner-${key}`, date: key, status: "ready", interaction, ...news, preparedAt: Date.now(), audio: { status: "pending", durationSeconds: 0, chapters: [] } });
  } catch (error) {
    console.error("daily-dinner generation error", error);
    return { id: `dinner-${key}`, date: key, status: "fallback", interaction, newsTitle: "今日新闻正在准备", newsSummary: "晚餐互动仍会照常出现。", newsScript: "", sources: [], preparedAt: Date.now(), error: error?.message || "生成失败", audio: { status: "error", durationSeconds: 0, chapters: [] } };
  }
}

exports.main = async (event = {}) => {
  const target = /^\d{4}-\d{2}-\d{2}$/.test(event.date || "") ? dateFromKey(event.date) : new Date();
  const program = await prepareDate(target);
  const existing = await readPrograms();
  const programs = [...existing.filter((item) => item.date !== program.date && item.date >= dateKey(new Date(target.getFullYear(), target.getMonth(), target.getDate() - 2))), program]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  await db.collection("family_dinner").doc(INDEX_ID).set({ programs, updatedAt: Date.now() });
  return { ok: true, data: { date: program.date, status: program.status, audioStatus: program.audio.status, error: program.error || "" }, preparedAt: Date.now() };
};
