import type { MorningSegment } from "./morning-english";

export type MorningProgramWord = {
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
};

export type MorningAudioChapter = {
  id: string;
  title: string;
  section?: "opening" | "words" | "story" | "explanation" | "dialogue" | "review";
  wordIndex?: number;
  cloudPath: string;
  audioUrl?: string;
  durationSeconds: number;
};

export type MorningProgram = {
  id: string;
  date: string;
  status: "ready" | "draft" | "error";
  source: "cloud-library" | "family" | "ai";
  variant: number;
  contentVersion?: number;
  theme: string;
  words: MorningProgramWord[];
  storyTitle: string;
  story: string;
  explanation: string;
  dialogue: string;
  challenge: string;
  estimatedMinutes: number;
  preparedAt: number;
  updatedAt: number;
  audio: {
    status: "pending" | "ready" | "needs-setup" | "error";
    voiceName: string;
    playbackRate: number;
    version?: number;
    generatedAt?: number;
    error?: string;
    chapters: MorningAudioChapter[];
  };
};

function segment(id: string, title: string, language: MorningSegment["language"], text: string, pauseAfterMs: number): MorningSegment {
  return { id, title, audience: "全家", language, text, pauseAfterMs, rate: language === "en-US" ? 1 : 0.95 };
}

export function buildMorningSessionFromProgram(program: MorningProgram): MorningSegment[] {
  const preview = program.words.map((item) => item.word).join(". ");
  const vocabulary = program.words.map((item, index) => `Word number ${index + 1}. ${item.word}. ${item.word}. ${item.example} Once again. ${item.word}. ${item.example}`).join(" ");
  const meanings = program.words.map((item) => `${item.word}，${item.meaning}`).join("；");
  const review = program.words.map((item) => `${item.word}. ${item.example}`).join(" ");
  return [
    segment("welcome", "早餐英语电台", "zh-CN", "早餐英语开始。今天以英文听力为主。", 250),
    segment("opening", "英文开场", "en-US", `Good morning, Yicheng and Yiran. Today's English theme is ${program.theme}. Listen to the words first. ${preview}.`, 500),
    segment("words", "核心单词", "en-US", vocabulary, 700),
    segment("meanings", "单词词义", "zh-CN", meanings, 450),
    segment("story", "生活短文", "en-US", `Now listen to a short story. The title is ${program.storyTitle}. ${program.story}`, 800),
    segment("explanation", "一句中文提示", "zh-CN", program.explanation, 450),
    segment("story-again", "生活短文 · 再听一遍", "en-US", program.story, 700),
    segment("dialogue", "生活对话", "en-US", `Now listen to an everyday conversation. ${program.dialogue}`, 650),
    segment("dialogue-again", "生活对话 · 再听一遍", "en-US", program.dialogue, 650),
    segment("review", "今日回顾", "en-US", `Let's review. ${review} Here is today's challenge sentence. ${program.challenge} That is all for today's breakfast English. Have a wonderful day at school.`, 500),
  ];
}

export function programDuration(program: MorningProgram) {
  return program.audio.chapters.reduce((sum, chapter) => sum + Math.max(0, chapter.durationSeconds || 0), 0);
}
