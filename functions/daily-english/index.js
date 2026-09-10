"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const { buildProgram, dateKey, programTextChapters, sessionId } = require("./program-library");
const { uploadObject } = require("./cloudbase-storage");

const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();
const PROGRAM_INDEX_ID = "program-index";

async function synthesizeText(text, language, requestSessionId) {
  const called = await app.callFunction({
    name: "tts-worker",
    data: { text, language, sessionId: requestSessionId },
  });
  const response = called && called.result ? called.result : called;
  if (!response || response.ok === false || !response.data?.audio) {
    throw new Error(response?.error || "语音合成函数暂时不可用");
  }
  return response.data;
}

async function readPrograms() {
  try {
    const result = await db.collection("family_morning").doc(PROGRAM_INDEX_ID).get();
    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    return Array.isArray(record?.programs) ? record.programs : [];
  } catch (error) {
    if (error && (error.code === "RESOURCE_NOT_FOUND" || error.code === "DATABASE_REQUEST_FAILED" || error.code === -1)) return [];
    throw error;
  }
}

async function savePrograms(programs) {
  await db.collection("family_morning").doc(PROGRAM_INDEX_ID).set({ programs, updatedAt: Date.now() });
}

function estimatedDuration(text, language) {
  if (language === "zh") return Math.max(2, Math.ceil(text.length / 4));
  const words = text.trim().split(/\s+/).length;
  return Math.max(3, Math.ceil(words / 2.35));
}

async function synthesizeProgram(program) {
  const generated = [];
  for (const chapter of programTextChapters(program)) {
    const response = await synthesizeText(chapter.text, chapter.language, sessionId(program, chapter));
    const fileContent = Buffer.from(response.audio, "base64");
    const cloudPath = `family-morning-audio/${program.date}/content-v4-${program.variant}/${chapter.id}.mp3`;
    const stored = await uploadObject(cloudPath, fileContent, "audio/mpeg");
    const subtitleEnd = Array.isArray(response.subtitles) && response.subtitles.length > 0
      ? Math.max(...response.subtitles.map((item) => Number(item.EndTime) || 0)) / 1000
      : 0;
    const item = {
      id: chapter.id,
      title: chapter.title,
      section: chapter.section || chapter.id,
      ...(Number.isInteger(chapter.wordIndex) ? { wordIndex: chapter.wordIndex } : {}),
      cloudPath,
      fileID: stored.fileID,
      audioUrl: "",
      durationSeconds: Math.max(1, Math.ceil(subtitleEnd || estimatedDuration(chapter.text, chapter.language))),
    };
    generated.push(item);
  }

  return {
    ...program,
    audio: {
      status: "ready",
      voiceName: "WeRose",
      playbackRate: 1,
      version: 4,
      generatedAt: Date.now(),
      chapters: generated,
    },
    updatedAt: Date.now(),
  };
}

async function ensurePrograms(start = new Date(), days = 8) {
  const storedPrograms = await readPrograms();
  const byDate = new Map(storedPrograms.map((program) => [program.date, program]));
  const results = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const key = dateKey(date);
    const existing = byDate.get(key);
    let program = existing?.contentVersion === 4 ? existing : buildProgram(key, Number(existing?.variant || 0));
    const needsAudio = offset <= 1 && (program.audio?.status !== "ready" || program.audio?.version !== 4);
    if (needsAudio) {
      try {
        program = await synthesizeProgram(program);
      } catch (error) {
        console.error("daily-english tts error", key, error);
        program = {
          ...program,
          audio: { ...program.audio, status: "error", error: error && error.message ? error.message : "音频生成失败", chapters: [] },
          updatedAt: Date.now(),
        };
      }
    }
    byDate.set(key, program);
    results.push({ date: key, audioStatus: program.audio?.status || "pending" });
  }
  const keepAfter = dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 2));
  const programs = Array.from(byDate.values()).filter((program) => program.date >= keepAfter).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 21);
  await savePrograms(programs);
  return results;
}

async function regenerateProgram(key) {
  const programs = await readPrograms();
  const existing = programs.find((program) => program.date === key);
  let program = buildProgram(key, Number(existing?.variant || 0) + 1);
  try {
    program = await synthesizeProgram(program);
  } catch (error) {
    console.error("daily-english regenerate tts error", key, error);
    program = {
      ...program,
      audio: { ...program.audio, status: "error", error: error && error.message ? error.message : "音频生成失败", chapters: [] },
      updatedAt: Date.now(),
    };
  }
  await savePrograms([...programs.filter((item) => item.date !== key), program].sort((a, b) => a.date.localeCompare(b.date)).slice(-21));
  return program;
}

exports.main = async (rawEvent = {}) => {
  let event = rawEvent;
  if (typeof rawEvent === "string") {
    try { event = JSON.parse(rawEvent); } catch { event = {}; }
  }
  if (event && typeof event === "object" && typeof event.body === "string") {
    try { event = { ...event, ...JSON.parse(event.body) }; } catch { /* keep the original event */ }
  }
  if (event.inspectEnvironment === true) {
    return {
      ok: true,
      data: Object.keys(process.env).filter((key) => /DATABASE|POSTGRES|PGHOST|PGPORT|PGUSER|PGDATABASE|TCB|TENCENTCLOUD/i.test(key)).sort(),
    };
  }
  if (typeof event.regenerateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.regenerateDate)) {
    const program = await regenerateProgram(event.regenerateDate);
    return { ok: true, data: [{ date: program.date, audioStatus: program.audio?.status || "pending" }], preparedAt: Date.now() };
  }
  const start = typeof event.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.startDate)
    ? new Date(`${event.startDate}T12:00:00+08:00`)
    : new Date();
  const days = Number.isInteger(event.days) ? Math.max(1, Math.min(14, event.days)) : 8;
  const data = await ensurePrograms(start, days);
  return { ok: true, data, preparedAt: Date.now() };
};
