"use client";
/* eslint-disable jsx-a11y/media-has-caption -- User-recorded family voice notes do not have a transcript track. */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FUTURE_INTEGRATIONS } from "./integrations";
import { contentDayKey, ensureContentHorizon, type DailyContent } from "./daily-content";
import { buildMorningSession, DEFAULT_MORNING_PLAN, normalizeMorningPlan, type MorningPlan, type MorningSegment } from "./morning-english";
import { callFamilyApi, callSecureFamilyFunction, isCloudBaseConfigured } from "../src/cloudbase";
import { FamilyCall, startLoopRingtone, stopLoopRingtone, type FamilyCallRequest } from "./family-call";
import { buildMorningSessionFromProgram, programDuration, type MorningProgram } from "./morning-program";
import { dinnerInteractionForDate, type DinnerInteraction } from "./dinner-interactions";
import type { DinnerProgram } from "./dinner-program";
import { defaultReminderValue, parseLocalReminderValue, reminderDueLabel } from "./reminder-time";
import { useCloudBaseStateWatcher, type WatcherStatus } from "../src/use-cloudbase-watcher";

type FamilyItem = {
  id: string;
  kind: "note" | "reminder" | "event";
  text: string;
  author?: string;
  recipient?: string;
  member?: "周毅成" | "周毅然";
  due?: string;
  dueAt?: string;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  messageType?: "text" | "voice";
  audioDataUrl?: string;
  audioDuration?: number;
  done?: boolean;
  announced?: boolean;
  repeat?: "once" | "daily" | "weekdays" | "weekly";
  repeatWeekdays?: number[];
  lastAnnouncedDate?: string;
  lastCompletedDate?: string;
  createdAt: string;
  createdAtMs?: number;
};

type StoredDashboard = {
  items: FamilyItem[];
  lessonDone: Record<string, boolean>;
  announceEnabled?: boolean;
  contentQueue?: DailyContent[];
  morningPlan?: MorningPlan;
  dinnerPlan?: DinnerPlan;
  callRequest?: FamilyCallRequest | null;
};

type DinnerPlan = { enabled: boolean; time: string };

type WeatherState = {
  status: "loading" | "ready" | "denied" | "error";
  temperature?: number;
  code?: number;
  apparentTemperature?: number;
  humidity?: number;
  windSpeed?: number;
  daily?: Array<{ date: string; code: number; max: number; min: number; rain: number }>;
};

type CloudStatus = "connecting" | "synced" | "saving" | "local" | "error";

type IdleScreenSettings = {
  enabled: boolean;
  idleMinutes: number;
  nightEnabled: boolean;
  nightStart: string;
  nightEnd: string;
};

const STORAGE_KEY = "family-wall-v1";
const VOICE_PREF_KEY = "family-wall-voice-v1";
const MORNING_ARM_KEY = "family-wall-morning-armed-v1";
const CALL_DEVICE_KEY = "family-wall-call-device-v1";
const IDLE_SCREEN_KEY = "family-wall-idle-screen-v1";
const MORNING_AUDIO_POSITION_KEY = "family-wall-morning-audio-position-v1";
const DINNER_SHOWN_KEY = "family-wall-dinner-shown-v1";
const DEFAULT_DINNER_PLAN: DinnerPlan = { enabled: true, time: "19:00" };
const DEFAULT_IDLE_SCREEN: IdleScreenSettings = { enabled: true, idleMinutes: 2, nightEnabled: true, nightStart: "22:00", nightEnd: "07:00" };
const WEEKDAYS = [
  { value: 1, short: "一", label: "周一" }, { value: 2, short: "二", label: "周二" },
  { value: 3, short: "三", label: "周三" }, { value: 4, short: "四", label: "周四" },
  { value: 5, short: "五", label: "周五" }, { value: 6, short: "六", label: "周六" },
  { value: 0, short: "日", label: "周日" },
];

const DEFAULT_ITEMS: FamilyItem[] = [
  { id: "note-welcome", kind: "note", text: "晚上记得带篮球，水杯已经放在门口。", author: "妈妈", createdAt: new Date().toISOString(), createdAtMs: Date.now() },
  { id: "reminder-dentist", kind: "reminder", text: "牙医预约", due: "周六 10:00", done: false, createdAt: "今天" },
  { id: "reminder-reading", kind: "reminder", text: "亲子阅读 20 分钟", due: "今晚 20:30", done: false, createdAt: "今天" },
];

function normalizeDinnerPlan(value?: Partial<DinnerPlan>): DinnerPlan {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(value?.time || "") ? value!.time! : DEFAULT_DINNER_PLAN.time;
  return { enabled: value?.enabled !== false, time };
}

function loadInitialDashboard(): StoredDashboard {
  const fallback = { items: DEFAULT_ITEMS, lessonDone: {}, announceEnabled: false, contentQueue: ensureContentHorizon([], new Date()), morningPlan: DEFAULT_MORNING_PLAN, dinnerPlan: DEFAULT_DINNER_PLAN, callRequest: null };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as StoredDashboard;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : DEFAULT_ITEMS,
      lessonDone: parsed.lessonDone ?? {},
      announceEnabled: Boolean(parsed.announceEnabled),
      contentQueue: ensureContentHorizon(Array.isArray(parsed.contentQueue) ? parsed.contentQueue : [], new Date()),
      morningPlan: normalizeMorningPlan(parsed.morningPlan),
      dinnerPlan: normalizeDinnerPlan(parsed.dinnerPlan),
      callRequest: parsed.callRequest ?? null,
    };
  } catch {
    return fallback;
  }
}

const LESSONS = [
  {
    theme: "早餐桌上的好心情",
    words: [
      { word: "sunny", phonetic: "/ˈsʌni/", meaning: "晴朗的" },
      { word: "share", phonetic: "/ʃer/", meaning: "分享" },
      { word: "ready", phonetic: "/ˈredi/", meaning: "准备好的" },
    ],
    sentence: "I am ready for a sunny day!",
    translation: "我准备好迎接晴朗的一天啦！",
  },
  {
    theme: "勇敢开始新一天",
    words: [
      { word: "brave", phonetic: "/breɪv/", meaning: "勇敢的" },
      { word: "begin", phonetic: "/bɪˈɡɪn/", meaning: "开始" },
      { word: "smile", phonetic: "/smaɪl/", meaning: "微笑" },
    ],
    sentence: "Begin the day with a brave smile.",
    translation: "用一个勇敢的微笑开始今天。",
  },
  {
    theme: "一起吃早餐",
    words: [
      { word: "breakfast", phonetic: "/ˈbrekfəst/", meaning: "早餐" },
      { word: "delicious", phonetic: "/dɪˈlɪʃəs/", meaning: "美味的" },
      { word: "together", phonetic: "/təˈɡeðər/", meaning: "一起" },
    ],
    sentence: "We have a delicious breakfast together.",
    translation: "我们一起吃美味的早餐。",
  },
];

const SCIENCE_CARDS = [
  { icon: "🌱", title: "植物也会“呼吸”吗？", copy: "会。植物白天和夜晚都进行呼吸作用，同时在有光时通过光合作用制造养分。" },
  { icon: "🌙", title: "月亮为什么会变形？", copy: "月亮没有真的变形。它绕地球运动时，被太阳照亮、又能被我们看到的部分不断变化。" },
  { icon: "🐬", title: "海豚睡觉时会溺水吗？", copy: "海豚会让左右大脑轮流休息，另一半保持清醒，帮助它浮出水面呼吸。" },
  { icon: "🐦", title: "鸟为什么站在电线上不触电？", copy: "鸟的两只脚电势几乎相同，电流很少经过身体；如果同时接触另一条线路就可能很危险。" },
  { icon: "🧊", title: "冰为什么会浮在水面？", copy: "水结冰后内部结构变得更疏松，体积增大、密度降低，所以冰会浮在水面。" },
  { icon: "🪐", title: "在太空中能听到声音吗？", copy: "声音需要空气等介质传播。太空接近真空，所以人在太空中无法直接听到外面的声音。" },
];

const WEATHER_LABELS: Record<number, string> = {
  0: "晴朗", 1: "大致晴朗", 2: "局部多云", 3: "阴天", 45: "有雾", 48: "雾凇",
  51: "小毛雨", 53: "毛毛雨", 55: "较强毛雨", 56: "冻毛雨", 57: "强冻毛雨",
  61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "强冻雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "米雪", 80: "阵雨", 81: "较强阵雨", 82: "强阵雨",
  85: "阵雪", 86: "强阵雪", 95: "雷雨", 96: "雷雨伴冰雹", 99: "强雷雨伴冰雹",
};

function weatherIcon(code = -1) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 95) return "⛈️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 51 && code <= 67) return "🌧️";
  return "🌡️";
}

function makeId() {
  return `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function dayKey(date: Date) {
  return contentDayKey(date);
}

function isRecurringReminder(item: FamilyItem) {
  return item.repeat === "daily" || item.repeat === "weekdays" || item.repeat === "weekly";
}

function reminderDoneForDate(item: FamilyItem, date: Date) {
  return isRecurringReminder(item) ? item.lastCompletedDate === dayKey(date) : Boolean(item.done);
}

function reminderIsDue(item: FamilyItem, date: Date) {
  if (item.kind !== "reminder" || !item.dueAt || reminderDoneForDate(item, date)) return false;
  const dueDate = new Date(item.dueAt);
  if (Number.isNaN(dueDate.getTime()) || date.getTime() < dueDate.getTime()) return false;
  const repeat = item.repeat ?? "once";
  if (repeat === "once") return !item.announced;
  if (item.lastAnnouncedDate === dayKey(date)) return false;
  if (repeat === "weekdays" && (date.getDay() === 0 || date.getDay() === 6)) return false;
  if (repeat === "weekly") {
    const selectedDays = item.repeatWeekdays?.length ? item.repeatWeekdays : [dueDate.getDay()];
    if (!selectedDays.includes(date.getDay())) return false;
  }
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const dueMinutes = dueDate.getHours() * 60 + dueDate.getMinutes();
  return currentMinutes >= dueMinutes;
}

function loadIdleScreenSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(IDLE_SCREEN_KEY) ?? "null") as Partial<IdleScreenSettings> | null;
    const merged = { ...DEFAULT_IDLE_SCREEN, ...(saved ?? {}) };
    // 息屏策略按家庭约定固定：白天 2 分钟变暗时钟，22:00–7:00 全黑待机等系统锁屏
    merged.idleMinutes = 2;
    merged.nightStart = "22:00";
    merged.nightEnd = "07:00";
    return merged;
  } catch {
    return DEFAULT_IDLE_SCREEN;
  }
}

function isTimeInsideRange(date: Date, start: string, end: string) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function playbackTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function lunarDayName(day: number) {
  const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (day <= 0 || day > 30) return String(day);
  if (day <= 10) return `初${numerals[day - 1]}`;
  if (day < 20) return `十${numerals[day - 11]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${numerals[day - 21]}`;
  return "三十";
}

function formatLunarDate(date: Date) {
  try {
    const formatted = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "long", day: "numeric" }).format(date);
    const normalized = formatted.replace(/\s/g, "").replace(/(\d{1,2})(?:日)?$/, (match) => {
      const day = Number.parseInt(match, 10);
      return Number.isFinite(day) ? lunarDayName(day) : match;
    });
    return `农历${normalized}`;
  } catch {
    return "农历日期";
  }
}

function formatItemCreatedAt(item: FamilyItem, reference: Date) {
  const parsed = Number.isFinite(item.createdAtMs) ? Number(item.createdAtMs) : Date.parse(item.createdAt);
  if (!Number.isFinite(parsed)) {
    const legacyTime = item.createdAt.match(/(\d{1,2}:\d{2})/);
    return legacyTime ? `较早 · ${legacyTime[1]}` : item.createdAt.replace(/^今天\s*/, "较早");
  }
  const created = new Date(parsed);
  const startOfToday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfCreated) / 86400000);
  const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(created);
  if (dayDifference === 0) return `今天 ${time}`;
  if (dayDifference === 1) return `昨天 ${time}`;
  const date = new Intl.DateTimeFormat("zh-CN", {
    ...(created.getFullYear() === reference.getFullYear() ? {} : { year: "numeric" as const }),
    month: "numeric",
    day: "numeric",
  }).format(created);
  return `${date} ${time}`;
}

// 生成 2 秒全零采样的静音 WAV dataURL（给锁屏保活循环播放，人耳完全无声）
function createSilentWavDataUrl(): string {
  const sampleRate = 8000;
  const totalSamples = sampleRate * 2;
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, totalSamples * 2, true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function FamilyDashboard() {
  const [initialState] = useState(loadInitialDashboard);
  const [now, setNow] = useState(() => new Date());
  const [items, setItems] = useState<FamilyItem[]>(initialState.items);
  const [lessonDone, setLessonDone] = useState<Record<string, boolean>>(initialState.lessonDone);
  const [announceEnabled, setAnnounceEnabled] = useState(Boolean(initialState.announceEnabled));
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("connecting");
  const [contentQueue, setContentQueue] = useState<DailyContent[]>(initialState.contentQueue ?? []);
  const [morningPlan, setMorningPlan] = useState<MorningPlan>(normalizeMorningPlan(initialState.morningPlan));
  const [dinnerPlan, setDinnerPlan] = useState<DinnerPlan>(normalizeDinnerPlan(initialState.dinnerPlan));
  const [morningSettingsOpen, setMorningSettingsOpen] = useState(false);
  const [morningArmed, setMorningArmed] = useState(() => {
    try {
      return window.localStorage.getItem(MORNING_ARM_KEY) === "true";
    } catch {
      return false;
    }
  });
  // 自动晨读当前被哪条条件卡住（空串 = 条件全满足/已触发），给自检展示用
  const [morningAutoBlock, setMorningAutoBlock] = useState("");
  const [morningPlaying, setMorningPlaying] = useState(false);
  const [morningSegmentIndex, setMorningSegmentIndex] = useState(-1);
  const [morningSeekIndex, setMorningSeekIndex] = useState(0);
  const [morningCurrentSegment, setMorningCurrentSegment] = useState<MorningSegment | null>(null);
  const [contentCenterOpen, setContentCenterOpen] = useState(false);
  const [programCenterOpen, setProgramCenterOpen] = useState(false);
  const [morningPrograms, setMorningPrograms] = useState<MorningProgram[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState("");
  const [selectedProgramDate, setSelectedProgramDate] = useState("");
  const [regeneratingDate, setRegeneratingDate] = useState("");
  const [activeAudioProgram, setActiveAudioProgram] = useState<MorningProgram | null>(null);
  const [audioChapterIndex, setAudioChapterIndex] = useState(0);
  const [audioChapterTime, setAudioChapterTime] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [morningPlayerOpen, setMorningPlayerOpen] = useState(false);
  const [morningAudioBuffering, setMorningAudioBuffering] = useState(false);
  const [morningAudioBlockedBySystem, setMorningAudioBlockedBySystem] = useState(false);
  const [selectedMorningWordIndex, setSelectedMorningWordIndex] = useState(0);
  const [audioRate, setAudioRate] = useState<0.9 | 1 | 1.1>(1);
  const [contentDate, setContentDate] = useState("");
  const [contentType, setContentType] = useState<"english" | "science">("english");
  const [contentTitle, setContentTitle] = useState("");
  const [contentWords, setContentWords] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [contentExtra, setContentExtra] = useState("");
  const [contentSaved, setContentSaved] = useState(false);
  const [composer, setComposer] = useState<"note" | "reminder" | "event" | null>(null);
  const [noteCenterOpen, setNoteCenterOpen] = useState(false);
  const [reminderCenterOpen, setReminderCenterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callSetupOpen, setCallSetupOpen] = useState(false);
  const [callRequest, setCallRequest] = useState<FamilyCallRequest | null>(initialState.callRequest ?? null);
  const [incomingNote, setIncomingNote] = useState<FamilyItem | null>(null);
  const [incomingReminder, setIncomingReminder] = useState<FamilyItem | null>(null);
  const [idleScreenSettings, setIdleScreenSettings] = useState(loadIdleScreenSettings);
  const [idleScreenMode, setIdleScreenMode] = useState<"hidden" | "clock" | "black">("hidden");
  const [dinnerInteraction, setDinnerInteraction] = useState<DinnerInteraction | null>(null);
  const [dinnerPhase, setDinnerPhase] = useState<"news" | "interaction">("interaction");
  const [dinnerPrograms, setDinnerPrograms] = useState<DinnerProgram[]>([]);
  const [dinnerProgramsLoadedDate, setDinnerProgramsLoadedDate] = useState("");
  const [dinnerAudioBlocked, setDinnerAudioBlocked] = useState(false);
  const [dinnerSoundReady, setDinnerSoundReady] = useState(false);
  const [dinnerChapterStatus, setDinnerChapterStatus] = useState({ current: 0, total: 0 });
  const [dinnerBuffering, setDinnerBuffering] = useState(false);
  const [dinnerPaused, setDinnerPaused] = useState(false);
  const [dinnerCenterOpen, setDinnerCenterOpen] = useState(false);
  const [dinnerLoading, setDinnerLoading] = useState(false);
  const [dinnerError, setDinnerError] = useState("");
  const [callDeviceRole, setCallDeviceRole] = useState<"home" | "remote">(() => {
    // The wall device is a dedicated iPad. A hosting-domain migration creates a
    // fresh localStorage namespace, so identify it again without manual setup.
    const navigator = window.navigator;
    const isIPad = /\biPad\b/i.test(navigator.userAgent)
      || (/\bMacintosh\b/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (isIPad) return "home";
    try {
      return window.localStorage.getItem(CALL_DEVICE_KEY) === "home" ? "home" : "remote";
    } catch {
      return "remote";
    }
  });
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("家人");
  const [noteRecipient, setNoteRecipient] = useState("全家");
  const [noteMode, setNoteMode] = useState<"text" | "voice">("text");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDataUrl, setVoiceDataUrl] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [due, setDue] = useState("");
  const [reminderRepeat, setReminderRepeat] = useState<NonNullable<FamilyItem["repeat"]>>("once");
  const [reminderWeekdays, setReminderWeekdays] = useState<number[]>([1]);
  const [member, setMember] = useState<"周毅成" | "周毅然">("周毅成");
  const [eventWeekday, setEventWeekday] = useState(1);
  const [eventStartTime, setEventStartTime] = useState("16:30");
  const [eventEndTime, setEventEndTime] = useState("17:30");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [englishVoice, setEnglishVoice] = useState("");
  const [chineseVoice, setChineseVoice] = useState("");
  const cloudDirtyRef = useRef(false);
  const cloudSnapshotRef = useRef("");
  const morningRunRef = useRef(0);
  const morningSeekRef = useRef(0);
  const morningPlaybackStartedAtRef = useRef<number | null>(null);
  const autoMorningPlaybackRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const idleLastActivityRef = useRef(Date.now());
  const nightWakeUntilRef = useRef(0);
  const morningAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioSeekRef = useRef(0);
  const morningAheadPreloadersRef = useRef<HTMLAudioElement[]>([]);
  const knownNoteIdsRef = useRef(new Set(initialState.items.filter((item) => item.kind === "note").map((item) => item.id)));
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const notificationAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const notificationHtmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const notificationAlertRunRef = useRef(0);
  const reminderRingRef = useRef<{ stopped: boolean } | null>(null);
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const dinnerAudioRef = useRef<HTMLAudioElement | null>(null);
  const dinnerAudioUnlockedRef = useRef(false);
  const dinnerAudioUnlockingRef = useRef(false);
  const dinnerPlaybackActiveRef = useRef(false);
  const morningAudioUnlockedRef = useRef(false);
  const morningAudioUnlockingRef = useRef(false);
  const dinnerPlaybackRunRef = useRef(0);
  const dinnerPreparingRef = useRef(false);
  const dinnerPrepareAttemptRef = useRef(0);
  const dinnerAheadPreloadersRef = useRef<HTMLAudioElement[]>([]);
  const idleRestoreTimerRef = useRef<number | null>(null);
  const pollingIdleCountRef = useRef(0);
  const pollingBackoffLevelRef = useRef(0);
  const cloudLastSeenSnapshotRef = useRef("");
  const lastSyncErrorRef = useRef<string>("");

  const applyCloudStateFromWatcher = useCallback(
    (next: StoredDashboard, updatedAt?: number) => {
      if (!next || !Array.isArray(next.items)) return;
      const currentItems = items as FamilyItem[];
      const knownIds = new Set(currentItems.map((i) => String(i.id)));
      const newNotes = next.items.filter((item) => item.kind === "note" && !knownIds.has(String(item.id)));
      setItems([...next.items] as FamilyItem[]);
      setLessonDone(next.lessonDone ?? {});
      setAnnounceEnabled(Boolean(next.announceEnabled));
      setContentQueue(ensureContentHorizon(Array.isArray(next.contentQueue) ? next.contentQueue : [], new Date()));
      setMorningPlan(normalizeMorningPlan(next.morningPlan));
      setDinnerPlan(normalizeDinnerPlan(next.dinnerPlan));
      setCallRequest(next.callRequest ?? null);
      if (next.callRequest && next.callRequest.status === "ringing" && (next.callRequest.expiresAt ?? 0) > Date.now()) {
        nightWakeUntilRef.current = Math.max(nightWakeUntilRef.current, next.callRequest.expiresAt + 30_000);
        idleLastActivityRef.current = Date.now();
        setIdleScreenMode("hidden");
      }
      if (callDeviceRole === "home" && newNotes.length > 0) {
        const latestNote = newNotes[0];
        nightWakeUntilRef.current = Date.now() + 2 * 60 * 1000;
        idleLastActivityRef.current = Date.now();
        setIdleScreenMode("hidden");
        setIncomingNote(latestNote as FamilyItem);
        const callInProgress = next.callRequest && (next.callRequest.status === "ringing" || next.callRequest.status === "accepted");
        if (!morningPlaying && !audioPlaying && !recording && !callInProgress) {
          void playIncomingNoteAlert(latestNote as FamilyItem);
        }
      }
      setCloudStatus("synced");
      setCloudReady(true);
      void updatedAt;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callDeviceRole, morningPlaying, audioPlaying, recording],
  );

  const { status: watcherStatus } = useCloudBaseStateWatcher(applyCloudStateFromWatcher, true);
  const watcherOnline = watcherStatus.state === "online";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    void syncFromCloud(initialState);
    loadWeather();
    return () => window.clearInterval(timer);
  }, [initialState]);

  useEffect(() => {
    void loadMorningPrograms();
    const timer = window.setInterval(() => void loadMorningPrograms(true), 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return;
      setVoices(available);
      let saved: { englishVoice?: string; chineseVoice?: string } = {};
      try {
        saved = JSON.parse(window.localStorage.getItem(VOICE_PREF_KEY) ?? "{}");
      } catch {
        saved = {};
      }
      const preferredEnglish = available.find((voice) => /Samantha|Ava|Serena|Karen|Moira|Tessa|Victoria/i.test(voice.name) && voice.lang.toLowerCase().startsWith("en"))
        ?? available.find((voice) => voice.lang.toLowerCase().startsWith("en"));
      const preferredChinese = available.find((voice) => /Ting|Mei|Yu-shu|Sin-ji|Xiaoxiao|晓晓|婷婷/i.test(voice.name) && voice.lang.toLowerCase().startsWith("zh"))
        ?? available.find((voice) => voice.lang.toLowerCase().startsWith("zh"));
      setEnglishVoice(saved.englishVoice && available.some((voice) => voice.voiceURI === saved.englishVoice) ? saved.englishVoice : preferredEnglish?.voiceURI ?? "");
      setChineseVoice(saved.chineseVoice && available.some((voice) => voice.voiceURI === saved.chineseVoice) ? saved.chineseVoice : preferredChinese?.voiceURI ?? "");
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest }));
    } catch {
      // The dashboard remains usable in memory if storage is unavailable.
    }
  }, [items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CALL_DEVICE_KEY, callDeviceRole);
    } catch {
      // The device role remains active until this page is reloaded.
    }
  }, [callDeviceRole]);

  useEffect(() => {
    try {
      window.localStorage.setItem(IDLE_SCREEN_KEY, JSON.stringify(idleScreenSettings));
    } catch {
      // Screen behavior remains active for this session if local storage is unavailable.
    }
  }, [idleScreenSettings]);

  useEffect(() => {
    const recordActivity = () => {
      const activityTime = Date.now();
      idleLastActivityRef.current = activityTime;
      nightWakeUntilRef.current = activityTime + 2 * 60 * 1000;
      setIdleScreenMode("hidden");
      unlockDinnerAudio();
      unlockMorningAudio();
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        notificationAudioContextRef.current ??= new AudioContextConstructor();
        if (notificationAudioContextRef.current.state === "suspended") {
          void notificationAudioContextRef.current.resume().catch(() => undefined);
        }
      }
      startKeepaliveAudio();
      // iPad 家庭屏首次有用户互动时：请求浏览器通知权限（用于来电横幅提醒）
      if (callDeviceRole === "home" && "Notification" in window && Notification.permission === "default") {
        try {
          void Notification.requestPermission().catch(() => undefined);
        } catch {
          // ignore permission errors
        }
      }
    };
    const checkIdleState = () => {
      if (!idleScreenSettings.enabled) {
        setIdleScreenMode("hidden");
        return;
      }
      const currentTime = new Date();
      const nightTime = idleScreenSettings.nightEnabled && isTimeInsideRange(currentTime, idleScreenSettings.nightStart, idleScreenSettings.nightEnd);
      if (nightTime && Date.now() >= nightWakeUntilRef.current) {
        setIdleScreenMode("black");
        return;
      }
      if (Date.now() - idleLastActivityRef.current >= idleScreenSettings.idleMinutes * 60 * 1000) {
        setIdleScreenMode("clock");
      }
    };
    window.addEventListener("pointerdown", recordActivity);
    window.addEventListener("touchstart", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("scroll", recordActivity, { passive: true });
    checkIdleState();
    const timer = window.setInterval(checkIdleState, 5000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("scroll", recordActivity);
    };
  }, [idleScreenSettings]);

  useEffect(() => () => {
    if (idleRestoreTimerRef.current !== null) window.clearTimeout(idleRestoreTimerRef.current);
  }, []);

  useEffect(() => {
    if (!callRequest || callRequest.status !== "ringing" || callRequest.expiresAt <= Date.now()) return;
    nightWakeUntilRef.current = Math.max(nightWakeUntilRef.current, callRequest.expiresAt + 30000);
    idleLastActivityRef.current = Date.now();
    // Incoming cloud call state intentionally wakes the local screen overlay.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdleScreenMode("hidden");
  }, [callRequest]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MORNING_ARM_KEY, String(morningArmed));
    } catch {
      // This is a device-local convenience and does not affect cloud settings.
    }
  }, [morningArmed]);

  useEffect(() => {
    if (!cloudReady) return;
    const payload = { items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest };
    const snapshot = JSON.stringify(payload);
    if (snapshot === cloudSnapshotRef.current) return;
    cloudDirtyRef.current = true;
    const timer = window.setTimeout(async () => {
      setCloudStatus("saving");
      try {
        await callFamilyApi("put", payload);
        cloudSnapshotRef.current = snapshot;
        cloudDirtyRef.current = false;
        setCloudStatus("synced");
      } catch {
        setCloudStatus("error");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest, cloudReady]);

  useEffect(() => {
    if (!cloudReady) return;
    const refreshFromCloud = async () => {
      if (cloudDirtyRef.current) return false;
      try {
        const result = await callFamilyApi<StoredDashboard | null>("get");
        const state = result.data;
        if (!state || !Array.isArray(state.items)) return false;
        const nextState: StoredDashboard = {
          items: state.items,
          lessonDone: state.lessonDone ?? {},
          announceEnabled: Boolean(state.announceEnabled),
          contentQueue: ensureContentHorizon(Array.isArray(state.contentQueue) ? state.contentQueue : [], new Date()),
          morningPlan: normalizeMorningPlan(state.morningPlan),
          dinnerPlan: normalizeDinnerPlan(state.dinnerPlan),
          callRequest: state.callRequest ?? null,
        };
        const nextSnapshot = JSON.stringify(nextState);
        const currentState: StoredDashboard = { items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest };
        const currentSnapshot = JSON.stringify(currentState);
        cloudSnapshotRef.current = nextSnapshot;
        const changed = nextSnapshot !== currentSnapshot && nextSnapshot !== cloudLastSeenSnapshotRef.current;
        cloudLastSeenSnapshotRef.current = nextSnapshot;
        if (changed) {
          // 数据有变化：立即重置退避等级，后续几轮保持快轮询防止漏同步
          pollingIdleCountRef.current = 0;
          pollingBackoffLevelRef.current = 0;
          const newNotes = nextState.items.filter((item) => item.kind === "note" && !knownNoteIdsRef.current.has(item.id));
          nextState.items.filter((item) => item.kind === "note").forEach((item) => knownNoteIdsRef.current.add(item.id));
          if (callDeviceRole === "home" && newNotes.length > 0) {
            const latestNote = newNotes[0];
            nightWakeUntilRef.current = Date.now() + 2 * 60 * 1000;
            idleLastActivityRef.current = Date.now();
            setIdleScreenMode("hidden");
            setIncomingNote(latestNote);
            const callInProgress = nextState.callRequest && (nextState.callRequest.status === "ringing" || nextState.callRequest.status === "accepted");
            if (!morningPlaying && !audioPlaying && !recording && !callInProgress) {
              void playIncomingNoteAlert(latestNote);
            }
          }
          setItems(nextState.items);
          setLessonDone(nextState.lessonDone);
          setAnnounceEnabled(Boolean(nextState.announceEnabled));
          setContentQueue(nextState.contentQueue ?? []);
          setMorningPlan(normalizeMorningPlan(nextState.morningPlan));
          setDinnerPlan(normalizeDinnerPlan(nextState.dinnerPlan));
          setCallRequest(nextState.callRequest ?? null);
        } else {
          pollingIdleCountRef.current += 1;
          // 连续 2 次没变化 → 升一级退避（间隔翻倍），上限 5 级（约 1-2 小时级）
          if (pollingIdleCountRef.current >= 2) {
            pollingIdleCountRef.current = 0;
            pollingBackoffLevelRef.current = Math.min(5, pollingBackoffLevelRef.current + 1);
          }
        }
        setCloudStatus("synced");
        return changed;
      } catch {
        setCloudStatus("error");
        // 网络/服务失败也退避，避免打爆错误配额
        pollingBackoffLevelRef.current = Math.min(5, pollingBackoffLevelRef.current + 1);
        return false;
      }
    };
    let timer = 0;
    const scheduleNextRefresh = () => {
      const activeCall = callRequest && (callRequest.status === "ringing" || callRequest.status === "accepted");
      const callAlive = activeCall && (callRequest.expiresAt ?? 0) > Date.now() - 180_000;
      if (callAlive) {
        pollingIdleCountRef.current = 0;
        pollingBackoffLevelRef.current = 0;
      }
      const currentHour = new Date().getHours();
      const isDeepNight = currentHour >= 0 && currentHour < 6;
      // CloudBase watch 实时监听在线时：轮询降级为"极度低频兜底"
      //   - 日常 5 分钟一次；深夜 15 分钟一次；仅用于 watch 偶发掉线
      // watch 掉线（fallback / connecting / idle）时：回退到正常的 30s/夜60s 正常轮询
      let baseMs: number;
      let capMs: number;
      let allowBackoff: boolean;
      if (callAlive) {
        baseMs = 3000;
        capMs = 3000;
        allowBackoff = false;
      } else if (watcherOnline) {
        // 实时监听在线：兜底用"超低频"，一天才几十次 SCF 调用
        if (isDeepNight) {
          baseMs = 15 * 60 * 1000;
          capMs = 30 * 60 * 1000;
          allowBackoff = true;
        } else {
          baseMs = 5 * 60 * 1000;
          capMs = 10 * 60 * 1000;
          allowBackoff = true;
        }
      } else if (callDeviceRole === "home") {
        // watch 没连上时：回退到之前你定的 30s / 夜 60s + 封顶 2min（保证不延迟）
        if (isDeepNight) {
          baseMs = 60 * 1000;
          capMs = 2 * 60 * 1000;
          allowBackoff = true;
        } else {
          baseMs = 30 * 1000;
          capMs = 30 * 1000;
          allowBackoff = false;
          pollingIdleCountRef.current = 0;
          pollingBackoffLevelRef.current = 0;
        }
      } else {
        // 手机 / 电脑端 watch 没连上时，也按同样节奏兜底
        if (isDeepNight) {
          baseMs = 60 * 1000;
          capMs = 2 * 60 * 1000;
          allowBackoff = true;
        } else {
          baseMs = 30 * 1000;
          capMs = 30 * 1000;
          allowBackoff = false;
          pollingIdleCountRef.current = 0;
          pollingBackoffLevelRef.current = 0;
        }
      }
      const backoff = allowBackoff ? pollingBackoffLevelRef.current : 0;
      const stepTable = [1, 1.5, 2, 3, 4];
      const multiplier = stepTable[Math.min(backoff, stepTable.length - 1)];
      const jitter = 0.9 + Math.random() * 0.2;
      const refreshInterval = Math.min(capMs, Math.round(baseMs * multiplier * jitter));
      timer = window.setTimeout(async () => {
        await refreshFromCloud();
        scheduleNextRefresh();
      }, Math.max(3000, refreshInterval));
    };
    scheduleNextRefresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      // 用户切回页面/解锁 iPad：短暂退出退避，立即刷新一次；顺手恢复保活音频（锁屏可能停掉它）
      pollingIdleCountRef.current = 0;
      pollingBackoffLevelRef.current = 0;
      startKeepaliveAudio();
      unlockDinnerAudio();
      unlockMorningAudio();
      void refreshFromCloud();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
    // `speak` intentionally follows the currently selected local device voice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest, callDeviceRole, cloudReady, morningPlaying, audioPlaying, recording, watcherOnline, watcherStatus.state]);

  useEffect(() => {
    if (!incomingNote) return;
    const timer = window.setTimeout(() => {
      setIncomingNote(null);
      restoreIdleScreenAfter(500);
    }, 18 * 1000);
    return () => window.clearTimeout(timer);
  }, [incomingNote]);

  useEffect(() => {
    if (!incomingReminder) return;
    // 90 秒无人处理自动收起：走 closeIncomingReminder 一并停掉循环铃声（弹窗没了铃不能还响）
    const timer = window.setTimeout(() => closeIncomingReminder(), 90 * 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingReminder]);

  useEffect(() => {
    if (!announceEnabled || callDeviceRole !== "home") return;
    const checkReminders = () => {
      const currentTime = new Date();
      const dueItems = items.filter((item) => reminderIsDue(item, currentTime));
      if (dueItems.length === 0) return;
      nightWakeUntilRef.current = Date.now() + 2 * 60 * 1000;
      idleLastActivityRef.current = Date.now();
      setIdleScreenMode("hidden");
      setIncomingReminder(dueItems[0]);
      restoreIdleScreenAfter(90 * 1000);
      void playReminderAlert(dueItems);
      const dueIds = new Set(dueItems.map((item) => item.id));
      const currentDayKey = dayKey(currentTime);
      setItems((current) => current.map((item) => dueIds.has(item.id)
        ? isRecurringReminder(item) ? { ...item, lastAnnouncedDate: currentDayKey } : { ...item, announced: true }
        : item));
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(timer);
    // `speak` intentionally follows the currently selected device voices on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announceEnabled, items, callDeviceRole]);

  const date = now;
  const todayKey = dayKey(date);
  const scheduledContent = contentQueue.find((item) => item.date === todayKey);
  const todayMorningProgram = morningPrograms.find((program) => program.date === todayKey);
  const lesson = scheduledContent?.english ?? LESSONS[date.getDate() % LESSONS.length];
  const tonightDinnerProgram = dinnerPrograms.find((program) => program.date === todayKey);
  const tonightInteraction = tonightDinnerProgram?.interaction ?? dinnerInteractionForDate(date);
  const scienceCard = scheduledContent?.science ?? SCIENCE_CARDS[date.getDate() % SCIENCE_CARDS.length];
  const notes = items.filter((item) => item.kind === "note");
  const reminders = items.filter((item) => item.kind === "reminder");
  const familyEvents = items.filter((item) => item.kind === "event");
  const doneCount = reminders.filter((item) => reminderDoneForDate(item, date)).length + (lessonDone[todayKey] ? 1 : 0);
  const totalCount = reminders.length + 1;
  const morningSession = useMemo(
    () => todayMorningProgram ? buildMorningSessionFromProgram(todayMorningProgram) : buildMorningSession(date, lesson, morningPlan.completedSessions),
    [date, lesson, morningPlan.completedSessions, todayMorningProgram],
  );
  const selectedProgram = morningPrograms.find((program) => program.date === selectedProgramDate) ?? morningPrograms[0] ?? null;
  const activeAudioChapter = activeAudioProgram?.audio.chapters[audioChapterIndex] ?? null;
  const activeAudioDuration = activeAudioProgram ? programDuration(activeAudioProgram) : 0;
  const elapsedBeforeChapter = activeAudioProgram
    ? activeAudioProgram.audio.chapters.slice(0, audioChapterIndex).reduce((sum, chapter) => sum + chapter.durationSeconds, 0)
    : 0;
  const activeAudioElapsed = Math.min(activeAudioDuration, elapsedBeforeChapter + audioChapterTime);
  const activeAudioSections = activeAudioProgram ? activeAudioProgram.audio.chapters.reduce<Array<{ index: number; section: string; title: string }>>((sections, chapter, index) => {
    const section = chapter.section ?? chapter.id.split("-")[0];
    if (!sections.some((item) => item.section === section)) {
      const titles: Record<string, string> = { preview: "预告", opening: "开场", words: "单词", story: "短文", explanation: "中文提示", dialogue: "对话", review: "回顾" };
      sections.push({ index, section, title: titles[section] ?? chapter.title });
    }
    return sections;
  }, []) : [];
  const fallbackMorningWords = [lesson, ...LESSONS].flatMap((fallbackLesson) => fallbackLesson.words.map((item) => ({ ...item, example: fallbackLesson.sentence })))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.word === item.word) === index)
    .slice(0, 4);
  const morningWords = (todayMorningProgram?.words?.length ? todayMorningProgram.words : fallbackMorningWords).slice(0, 4);
  const activeMorningWordIndex = Number.isInteger(activeAudioChapter?.wordIndex)
    ? Math.max(0, Math.min((activeAudioProgram?.words.length ?? 1) - 1, activeAudioChapter!.wordIndex!))
    : selectedMorningWordIndex;
  const activeMorningWord = activeAudioProgram?.words[activeMorningWordIndex] ?? morningWords[selectedMorningWordIndex] ?? morningWords[0];
  const currentMorningSection = activeAudioChapter?.section ?? activeAudioChapter?.id.split("-")[0] ?? "opening";
  const morningProgress = morningSegmentIndex < 0 ? 0 : Math.round(((morningSegmentIndex + 1) / morningSession.length) * 100);
  const lastMorningPlayback = morningPlan.playbackHistory[0];
  const morningLevelLabel = morningPlan.completedSessions < 10 ? "慢速入门" : morningPlan.completedSessions < 25 ? "生活基础" : morningPlan.completedSessions < 30 ? "基础加强" : "初中进阶";

  useEffect(() => {
    void loadDinnerPrograms(true, false);
    // Reload once when the calendar date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  useEffect(() => {
    dinnerAheadPreloadersRef.current.forEach((audio) => {
      audio.removeAttribute("src");
      audio.load();
    });
    dinnerAheadPreloadersRef.current = [];
    if (tonightDinnerProgram?.audio.status !== "ready") return;
    dinnerAheadPreloadersRef.current = tonightDinnerProgram.audio.chapters.filter((chapter) => chapter.audioUrl).map((chapter) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = chapter.audioUrl!;
      audio.load();
      return audio;
    });
    return () => {
      dinnerAheadPreloadersRef.current.forEach((audio) => {
        audio.removeAttribute("src");
        audio.load();
      });
      dinnerAheadPreloadersRef.current = [];
    };
  }, [tonightDinnerProgram?.date, tonightDinnerProgram?.preparedAt]);

  useEffect(() => {
    const checkSchedule = () => {
      const current = new Date();
      let blockReason = "";
      if (!morningPlan.enabled) blockReason = "「自动晨读」开关未开启（设置里打开）";
      else if (!morningArmed) blockReason = "这台 iPad 未开启守候（点「启动定时晨读」绿色按钮）";
      else if (!morningPlan.weekdays.includes(current.getDay())) blockReason = `今天周${"日一二三四五六"[current.getDay()]}不在「每周播放」里（点日期按钮加上）`;
      else if (morningPlan.lastAutoPlayedDate === todayKey) blockReason = "今天已自动播放过（改一下「开始时间」即可重排今天）";
      else if (morningPlaying || audioPlaying) blockReason = "有音频正在播放，避免打断暂不触发";
      else {
        const [hours, minutes] = morningPlan.time.split(":").map(Number);
        const targetMinutes = hours * 60 + minutes;
        const currentMinutes = current.getHours() * 60 + current.getMinutes();
        if (currentMinutes < targetMinutes) blockReason = `还没到 ${morningPlan.time}`;
        else if (currentMinutes >= targetMinutes + 15) blockReason = `已过 ${morningPlan.time}（补播窗口 15 分钟已过）`;
        else {
          setMorningAutoBlock("");
          void startMorningSession("auto");
          return;
        }
      }
      setMorningAutoBlock(blockReason);
    };
    checkSchedule();
    // 每 5 秒检查一次：到点后最多 5 秒内开播（间隔内的开销仅是读时间，几乎为零）
    const timer = window.setInterval(checkSchedule, 5000);
    return () => window.clearInterval(timer);
    // The scheduler deliberately rebinds when the synced plan or current day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningPlan, morningArmed, morningPlaying, audioPlaying, todayKey]);

  useEffect(() => {
    const checkDinnerSchedule = () => {
      if (!dinnerPlan.enabled || !cloudReady) return;
      if (callDeviceRole !== "home" || morningPlaying || audioPlaying || recording || composer || callSetupOpen) return;
      if (callRequest && (callRequest.status === "ringing" || callRequest.status === "accepted")) return;
      const current = new Date();
      const currentMinutes = current.getHours() * 60 + current.getMinutes();
      const [dinnerHours, dinnerMinutes] = dinnerPlan.time.split(":").map(Number);
      const dinnerTarget = dinnerHours * 60 + dinnerMinutes;
      if (currentMinutes < dinnerTarget || currentMinutes >= dinnerTarget + 15) return;
      const currentDay = dayKey(current);
      if (dinnerProgramsLoadedDate !== currentDay) return;
      const shownKey = `${currentDay}|${dinnerPlan.time}`;
      try {
        if (window.localStorage.getItem(DINNER_SHOWN_KEY) === shownKey) return;
      } catch {
        // The in-memory interaction still runs if Safari blocks local storage.
      }
      const program = dinnerPrograms.find((item) => item.date === currentDay);
      if (program?.audio.status !== "ready" || !program.audio.chapters.some((chapter) => chapter.audioUrl)) {
        if (dinnerPreparingRef.current || Date.now() - dinnerPrepareAttemptRef.current < 5 * 60 * 1000) return;
        dinnerPreparingRef.current = true;
        dinnerPrepareAttemptRef.current = Date.now();
        void loadDinnerPrograms(true, true).then((programs) => {
          dinnerPreparingRef.current = false;
          const prepared = programs.find((item) => item.date === currentDay && item.audio.status === "ready" && item.audio.chapters.some((chapter) => chapter.audioUrl));
          if (!prepared) return;
          try { window.localStorage.setItem(DINNER_SHOWN_KEY, shownKey); } catch { /* continue in memory */ }
          startDinnerExperience(prepared, prepared.interaction);
        });
        return;
      }
      try { window.localStorage.setItem(DINNER_SHOWN_KEY, shownKey); } catch { /* continue in memory */ }
      startDinnerExperience(program, program.interaction);
    };
    checkDinnerSchedule();
    const timer = window.setInterval(checkDinnerSchedule, 15000);
    return () => window.clearInterval(timer);
    // The scheduler rebinds when a competing activity starts or stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callDeviceRole, morningPlaying, audioPlaying, recording, composer, callSetupOpen, callRequest, todayKey, dinnerPrograms, dinnerProgramsLoadedDate, dinnerPlan, cloudReady]);

  useEffect(() => {
    if (!dinnerInteraction) return;
    const timer = window.setTimeout(() => {
      stopDinnerPlayback();
      setDinnerInteraction(null);
      restoreIdleScreenAfter(300);
    }, 5.5 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [dinnerInteraction]);

  useEffect(() => {
    if (!dinnerInteraction) return;
    const callInProgress = callRequest && (callRequest.status === "ringing" || callRequest.status === "accepted");
    if (!morningPlaying && !audioPlaying && !recording && !composer && !callSetupOpen && !callInProgress) return;
    const timer = window.setTimeout(() => {
      stopDinnerPlayback();
      setDinnerInteraction(null);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      restoreIdleScreenAfter(300);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dinnerInteraction, morningPlaying, audioPlaying, recording, composer, callSetupOpen, callRequest]);

  useEffect(() => {
    const audio = morningAudioRef.current;
    if (!audio || !activeAudioChapter?.audioUrl) return;
    audio.playbackRate = audioRate;
    if (audioPlaying) {
      void audio.play().catch(() => {
        // iOS 自动播放策略拦截：标记未解锁，显示恢复按钮让用户点一下
        morningAudioUnlockedRef.current = false;
        setMorningAudioBlockedBySystem(true);
        setAudioPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [activeAudioChapter?.audioUrl, audioPlaying, audioRate]);

  useEffect(() => {
    morningAheadPreloadersRef.current.forEach((audio) => {
      audio.removeAttribute("src");
      audio.load();
    });
    morningAheadPreloadersRef.current = [];
    if (!activeAudioProgram) return;
    morningAheadPreloadersRef.current = activeAudioProgram.audio.chapters
      .filter((chapter, index) => index !== audioChapterIndex && chapter.audioUrl)
      .map((chapter) => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = chapter.audioUrl!;
        audio.load();
        return audio;
      });
    return () => {
      morningAheadPreloadersRef.current.forEach((audio) => {
        audio.removeAttribute("src");
        audio.load();
      });
      morningAheadPreloadersRef.current = [];
    };
  }, [activeAudioProgram?.date]);

  const greeting = useMemo(() => {
    const hour = date.getHours();
    if (hour < 10) return "早上好，新的一天开始啦";
    if (hour < 13) return "中午好，记得好好吃饭";
    if (hour < 18) return "下午好，欢迎回家";
    return "晚上好，今天辛苦啦";
  }, [date]);

  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
  const timeLabel = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const idleDateLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
  const lunarDateLabel = formatLunarDate(date);

  function unlockMorningAudio() {
    // iOS 自动播放策略：没有用户手势时 play() 会被静默拒绝 → 定时晨读触发后无声。
    // 解法与晚餐音频相同：借任意一次用户触摸，用 0.1 秒静音 WAV「解锁」晨读音频引擎元素。
    if (morningAudioUnlockedRef.current || morningAudioUnlockingRef.current) return;
    const audio = morningAudioRef.current;
    // 元素上已挂真实节目源（暂停续播中）时绝不能动它，否则会丢进度
    if (!audio || audio.getAttribute("src")) return;
    morningAudioUnlockingRef.current = true;
    const silentWav = new Uint8Array([
      82, 73, 70, 70, 37, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
      16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 64, 31, 0, 0,
      1, 0, 8, 0, 100, 97, 116, 97, 1, 0, 0, 0, 128,
    ]);
    const objectUrl = URL.createObjectURL(new Blob([silentWav], { type: "audio/wav" }));
    audio.src = objectUrl;
    audio.volume = 1;
    const playback = audio.play();
    if (!playback) {
      morningAudioUnlockingRef.current = false;
      URL.revokeObjectURL(objectUrl);
      return;
    }
    void playback.then(() => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      morningAudioUnlockingRef.current = false;
      morningAudioUnlockedRef.current = true;
    }).catch(() => {
      morningAudioUnlockingRef.current = false;
      URL.revokeObjectURL(objectUrl);
    });
  }

  function unlockDinnerAudio() {
    if (dinnerAudioUnlockedRef.current || dinnerAudioUnlockingRef.current) return;
    const audio = dinnerAudioRef.current;
    if (!audio) return;
    if (dinnerPlaybackActiveRef.current || !audio.paused) {
      dinnerAudioUnlockedRef.current = true;
      setDinnerSoundReady(true);
      return;
    }
    dinnerAudioUnlockingRef.current = true;
    const silentWav = new Uint8Array([
      82, 73, 70, 70, 37, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
      16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 64, 31, 0, 0,
      1, 0, 8, 0, 100, 97, 116, 97, 1, 0, 0, 0, 128,
    ]);
    const objectUrl = URL.createObjectURL(new Blob([silentWav], { type: "audio/wav" }));
    audio.src = objectUrl;
    audio.volume = 1;
    const playback = audio.play();
    if (!playback) {
      dinnerAudioUnlockingRef.current = false;
      URL.revokeObjectURL(objectUrl);
      return;
    }
    void playback.then(() => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      dinnerAudioUnlockingRef.current = false;
      dinnerAudioUnlockedRef.current = true;
      setDinnerSoundReady(true);
    }).catch(() => {
      dinnerAudioUnlockingRef.current = false;
      URL.revokeObjectURL(objectUrl);
    });
  }

  function restoreIdleScreenAfter(delayMs: number) {
    if (idleRestoreTimerRef.current !== null) window.clearTimeout(idleRestoreTimerRef.current);
    idleRestoreTimerRef.current = window.setTimeout(() => {
      idleRestoreTimerRef.current = null;
      if (!idleScreenSettings.enabled) return;
      const current = new Date();
      const isNight = idleScreenSettings.nightEnabled && isTimeInsideRange(current, idleScreenSettings.nightStart, idleScreenSettings.nightEnd);
      nightWakeUntilRef.current = 0;
      idleLastActivityRef.current = Date.now() - idleScreenSettings.idleMinutes * 60 * 1000;
      setIdleScreenMode(isNight ? "black" : "clock");
    }, delayMs);
  }

  function loadWeather() {
    if (!("geolocation" in navigator)) {
      setWeather({ status: "error" });
      return;
    }
    setWeather({ status: "loading" });
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const latitude = position.coords.latitude.toFixed(4);
        const longitude = position.coords.longitude.toFixed(4);
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`);
        if (!response.ok) throw new Error("Weather request failed");
        const data = await response.json() as {
          current?: { temperature_2m?: number; apparent_temperature?: number; relative_humidity_2m?: number; weather_code?: number; wind_speed_10m?: number };
          daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
        };
        if (typeof data.current?.temperature_2m !== "number") throw new Error("Weather data missing");
        const days = data.daily?.time?.map((date, index) => ({
          date,
          code: data.daily?.weather_code?.[index] ?? -1,
          max: Math.round(data.daily?.temperature_2m_max?.[index] ?? 0),
          min: Math.round(data.daily?.temperature_2m_min?.[index] ?? 0),
          rain: Math.round(data.daily?.precipitation_probability_max?.[index] ?? 0),
        })) ?? [];
        setWeather({
          status: "ready",
          temperature: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          apparentTemperature: Math.round(data.current.apparent_temperature ?? data.current.temperature_2m),
          humidity: Math.round(data.current.relative_humidity_2m ?? 0),
          windSpeed: Math.round(data.current.wind_speed_10m ?? 0),
          daily: days,
        });
      } catch {
        setWeather({ status: "error" });
      }
    }, (error) => setWeather({ status: error.code === error.PERMISSION_DENIED ? "denied" : "error" }), { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 });
  }

  async function loadMorningPrograms(quiet = false, forcePrepare = false) {
    if (!quiet) setProgramsLoading(true);
    setProgramsError("");
    const from = contentDayKey(new Date());
    try {
      let programs = await callSecureFamilyFunction<MorningProgram[]>("get-programs", { from, days: 7 });
      if (forcePrepare || programs.length < 7) {
        programs = await callSecureFamilyFunction<MorningProgram[]>("prepare-programs", { from, days: 8 });
      }
      setMorningPrograms(programs);
      setSelectedProgramDate((current) => current && programs.some((program) => program.date === current) ? current : programs[0]?.date ?? from);
    } catch (error) {
      if (!quiet) setProgramsError(error instanceof Error ? error.message : "未来课程暂时无法读取");
    } finally {
      if (!quiet) setProgramsLoading(false);
    }
  }

  async function loadDinnerPrograms(quiet = false, forcePrepare = false): Promise<DinnerProgram[]> {
    if (!quiet) setDinnerLoading(true);
    setDinnerError("");
    const from = contentDayKey(new Date());
    try {
      let programs = await callSecureFamilyFunction<DinnerProgram[]>("get-dinner-programs", { from, days: 1 });
      if (forcePrepare || programs.length === 0) {
        programs = await callSecureFamilyFunction<DinnerProgram[]>("prepare-dinner-program", { date: from });
      }
      setDinnerPrograms(programs);
      return programs;
    } catch (error) {
      if (!quiet) setDinnerError(error instanceof Error ? error.message : "晚餐内容暂时无法读取");
      return [];
    } finally {
      setDinnerProgramsLoadedDate(from);
      if (!quiet) setDinnerLoading(false);
    }
  }

  function playDinnerNews(program: DinnerProgram, onComplete?: () => void) {
    dinnerAudioRef.current?.pause();
    const chapters = program.audio?.chapters?.filter((chapter) => chapter.audioUrl) ?? [];
    const audio = dinnerAudioRef.current;
    const runId = dinnerPlaybackRunRef.current + 1;
    dinnerPlaybackRunRef.current = runId;
    dinnerPlaybackActiveRef.current = true;
    setDinnerPaused(false);
    setDinnerChapterStatus({ current: chapters.length > 0 ? 1 : 0, total: chapters.length });
    let index = 0;
    let retryCount = 0;
    let nextPreloader: HTMLAudioElement | null = null;
    const finish = () => {
      if (dinnerPlaybackRunRef.current !== runId) return;
      dinnerPlaybackActiveRef.current = false;
      dinnerAudioUnlockedRef.current = true;
      setDinnerSoundReady(true);
      setDinnerChapterStatus({ current: 0, total: 0 });
      setDinnerBuffering(false);
      setDinnerPaused(false);
      if (nextPreloader) {
        nextPreloader.removeAttribute("src");
        nextPreloader.load();
        nextPreloader = null;
      }
      onComplete?.();
    };
    const handlePlaybackFailure = () => {
      if (dinnerPlaybackRunRef.current !== runId) return;
      if (retryCount < 3) {
        retryCount += 1;
        window.setTimeout(() => {
          if (dinnerPlaybackRunRef.current !== runId || !audio) return;
          void audio.play().catch(handlePlaybackFailure);
        }, 650);
        return;
      }
      dinnerPlaybackActiveRef.current = false;
      setDinnerAudioBlocked(true);
      // 音频播放被系统拦截：用语音播报新闻摘要，等播完再进入互动环节
      speak(`晚餐时间到了。${program.newsSummary}`, "zh-CN", () => {
        window.setTimeout(finish, 800);
      });
    };
    const playNext = () => {
      if (dinnerPlaybackRunRef.current !== runId) return;
      const chapter = chapters[index];
      if (!chapter?.audioUrl) {
        if (audio) {
          audio.onended = null;
          audio.onerror = null;
          audio.removeAttribute("src");
          audio.load();
        }
        // 没有音频章节可用：用语音读新闻摘要，等播完再进入互动
        if (index === 0 && program.newsSummary) {
          speak(`晚餐时间到了。${program.newsSummary}`, "zh-CN", () => {
            window.setTimeout(finish, 800);
          });
        } else {
          finish();
        }
        return;
      }
      if (!audio) {
        dinnerPlaybackActiveRef.current = false;
        setDinnerAudioBlocked(true);
        speak(`晚餐时间到了。${program.newsSummary}。${program.interaction.prompt}`, "zh-CN", () => {
          window.setTimeout(finish, 800);
        });
        return;
      }
      retryCount = 0;
      setDinnerChapterStatus({ current: index + 1, total: chapters.length });
      setDinnerBuffering(true);
      audio.autoplay = true;
      audio.preload = "auto";
      audio.src = chapter.audioUrl;
      audio.onended = () => {
        if (dinnerPlaybackRunRef.current !== runId) return;
        index += 1;
        playNext();
      };
      audio.onerror = handlePlaybackFailure;
      audio.onplaying = () => setDinnerBuffering(false);
      audio.onwaiting = () => setDinnerBuffering(true);
      audio.load();
      void audio.play().catch(handlePlaybackFailure);
      const nextChapter = chapters[index + 1];
      if (nextChapter?.audioUrl) {
        if (nextPreloader) {
          nextPreloader.removeAttribute("src");
          nextPreloader.load();
        }
        nextPreloader = new Audio();
        nextPreloader.preload = "auto";
        nextPreloader.src = nextChapter.audioUrl;
        nextPreloader.load();
      }
    };
    playNext();
  }

  function stopDinnerPlayback() {
    dinnerPlaybackRunRef.current += 1;
    dinnerPlaybackActiveRef.current = false;
    const audio = dinnerAudioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
    }
    setDinnerChapterStatus({ current: 0, total: 0 });
    setDinnerBuffering(false);
    setDinnerPaused(false);
  }

  function toggleDinnerPlayback() {
    const audio = dinnerAudioRef.current;
    if (!audio || !dinnerPlaybackActiveRef.current) return;
    if (audio.paused) {
      setDinnerBuffering(true);
      void audio.play().then(() => {
        setDinnerPaused(false);
        setDinnerBuffering(false);
      }).catch(() => {
        setDinnerBuffering(false);
        setDinnerAudioBlocked(true);
      });
      return;
    }
    audio.pause();
    setDinnerPaused(true);
    setDinnerBuffering(false);
  }

  function exitDinnerExperience() {
    stopDinnerPlayback();
    setDinnerInteraction(null);
    setDinnerAudioBlocked(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    restoreIdleScreenAfter(300);
  }

  function startDinnerExperience(program: DinnerProgram | undefined, interaction: DinnerInteraction) {
    if (idleRestoreTimerRef.current !== null) window.clearTimeout(idleRestoreTimerRef.current);
    nightWakeUntilRef.current = Date.now() + 7 * 60 * 1000;
    idleLastActivityRef.current = Date.now();
    setIdleScreenMode("hidden");
    setDinnerInteraction(interaction);
    setDinnerAudioBlocked(false);
    if (program?.audio.status === "ready") {
      setDinnerPhase("news");
      window.setTimeout(() => playDinnerNews(program, () => {
        setDinnerPhase("interaction");
        speak(interaction.prompt, "zh-CN");
        window.setTimeout(() => setDinnerInteraction(null), 90 * 1000);
        restoreIdleScreenAfter(90 * 1000);
      }), 500);
      return;
    }
    setDinnerPhase("interaction");
    window.setTimeout(() => speak(interaction.prompt, "zh-CN"), 500);
    window.setTimeout(() => setDinnerInteraction(null), 90 * 1000);
    restoreIdleScreenAfter(90 * 1000);
  }

  async function testDinnerExperience() {
    unlockDinnerAudio();
    let program = dinnerPrograms.find((item) => item.date === todayKey && item.audio.status === "ready" && item.audio.chapters.some((chapter) => chapter.audioUrl));
    if (!program) {
      let programs = await loadDinnerPrograms(false, false);
      program = programs.find((item) => item.date === todayKey && item.audio.status === "ready" && item.audio.chapters.some((chapter) => chapter.audioUrl));
      if (!program) {
        programs = await loadDinnerPrograms(false, true);
        program = programs.find((item) => item.date === todayKey && item.audio.status === "ready" && item.audio.chapters.some((chapter) => chapter.audioUrl));
      }
    }
    if (!program) {
      setDinnerError("今晚新闻音频仍在准备，请稍后再点一次测试。");
      return;
    }
    setDinnerCenterOpen(false);
    startDinnerExperience(program, program.interaction);
  }

  async function regenerateMorningProgram(dateKey: string) {
    setRegeneratingDate(dateKey);
    setProgramsError("");
    try {
      const programs = await callSecureFamilyFunction<MorningProgram[]>("regenerate-program", { date: dateKey });
      const next = programs[0];
      if (next) setMorningPrograms((current) => [...current.filter((program) => program.date !== dateKey), next].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      setProgramsError(error instanceof Error ? error.message : "更换课程失败");
    } finally {
      setRegeneratingDate("");
    }
  }

  function canPlayProgram(program: MorningProgram | null | undefined) {
    return Boolean(program && program.audio.status === "ready" && program.audio.chapters.length > 0 && program.audio.chapters.every((chapter) => chapter.audioUrl));
  }

  function readAudioPosition(program: MorningProgram) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(MORNING_AUDIO_POSITION_KEY) ?? "null") as { date?: string; chapterIndex?: number; chapterTime?: number; rate?: number } | null;
      if (saved?.date !== program.date) return { chapterIndex: 0, chapterTime: 0, rate: 1 as const };
      const savedRate = saved.rate === 0.9 || saved.rate === 1.1 ? saved.rate : 1;
      return {
        chapterIndex: Math.max(0, Math.min(program.audio.chapters.length - 1, Number(saved.chapterIndex) || 0)),
        chapterTime: Math.max(0, Number(saved.chapterTime) || 0),
        rate: savedRate as 0.9 | 1 | 1.1,
      };
    } catch {
      return { chapterIndex: 0, chapterTime: 0, rate: 1 as const };
    }
  }

  function startProgramAudio(program: MorningProgram, source: "manual" | "auto" = "manual") {
    if (!canPlayProgram(program)) return;
    window.speechSynthesis?.cancel();
    morningRunRef.current += 1;
    setMorningPlaying(false);
    // 自动触发时，iOS 很可能"假成功"：play() Promise resolve、进度条走、UI 显示"正在播放"，
    // 但声音输出通道被系统静默——JS 无法检测这种假成功。
    // 最可靠的办法是主动显示恢复按钮，让用户在手势上下文里点一次，iOS 才真的出声。
    setMorningAudioBlockedBySystem(source === "auto");
    const saved = readAudioPosition(program);
    pendingAudioSeekRef.current = saved.chapterTime;
    setActiveAudioProgram(program);
    setAudioChapterIndex(saved.chapterIndex);
    setAudioChapterTime(saved.chapterTime);
    setAudioRate(saved.rate);
    setAudioPlaying(true);
    setMorningAudioBuffering(true);
    setMorningPlayerOpen(true);
    autoMorningPlaybackRef.current = source === "auto";
    if (source === "auto") {
      nightWakeUntilRef.current = Date.now() + 16 * 60 * 1000;
      idleLastActivityRef.current = Date.now();
      setIdleScreenMode("hidden");
    }
    setMorningPlan((current) => ({
      ...current,
      lastPlayedDate: source === "auto" ? program.date : current.lastPlayedDate,
      lastAutoPlayedDate: source === "auto" ? program.date : current.lastAutoPlayedDate,
      playbackHistory: current.playbackHistory.some((entry) => entry.date === program.date && entry.status === "playing")
        ? current.playbackHistory
        : [{ date: program.date, startedAt: Date.now(), status: "playing" }, ...current.playbackHistory].slice(0, 14),
    }));
  }

  function toggleProgramAudio() {
    if (!activeAudioProgram) return;
    setMorningPlayerOpen(true);
    setAudioPlaying((current) => !current);
  }

  function stopProgramAudio() {
    morningAudioRef.current?.pause();
    setAudioPlaying(false);
    setMorningAudioBlockedBySystem(false);
  }

  function exitMorningProgram() {
    const currentTime = morningAudioRef.current?.currentTime ?? audioChapterTime;
    saveProgramAudioPosition(currentTime);
    morningAudioRef.current?.pause();
    setAudioPlaying(false);
    setMorningAudioBuffering(false);
    setMorningAudioBlockedBySystem(false);
    setMorningPlayerOpen(false);
    setActiveAudioProgram(null);
    autoMorningPlaybackRef.current = false;
    restoreIdleScreenAfter(30 * 1000);
  }

  function saveProgramAudioPosition(chapterTime: number) {
    if (!activeAudioProgram) return;
    try {
      window.localStorage.setItem(MORNING_AUDIO_POSITION_KEY, JSON.stringify({ date: activeAudioProgram.date, chapterIndex: audioChapterIndex, chapterTime, rate: audioRate }));
    } catch {
      // Resume remains available in memory when local storage is unavailable.
    }
  }

  function handleProgramAudioLoaded() {
    const audio = morningAudioRef.current;
    if (!audio) return;
    audio.playbackRate = audioRate;
    const target = Math.min(Math.max(0, pendingAudioSeekRef.current), Math.max(0, audio.duration - 0.25));
    if (Number.isFinite(target) && target > 0) audio.currentTime = target;
    pendingAudioSeekRef.current = 0;
    setMorningAudioBuffering(false);
    if (audioPlaying) void audio.play().catch(() => { setAudioPlaying(false); setMorningAudioBuffering(false); });
  }

  function handleProgramAudioTime() {
    const currentTime = morningAudioRef.current?.currentTime ?? 0;
    setAudioChapterTime(currentTime);
    saveProgramAudioPosition(currentTime);
  }

  function finishProgramAudio() {
    if (!activeAudioProgram) return;
    if (audioChapterIndex < activeAudioProgram.audio.chapters.length - 1) {
      pendingAudioSeekRef.current = 0;
      setAudioChapterTime(0);
      setAudioChapterIndex((current) => current + 1);
      return;
    }
    const completedDate = activeAudioProgram.date;
    setAudioPlaying(false);
    setMorningAudioBuffering(false);
    setMorningPlayerOpen(false);
    setLessonDone((current) => ({ ...current, [completedDate]: true }));
    setMorningPlan((current) => ({
      ...current,
      completedSessions: current.completedSessions + (current.playbackHistory.some((entry) => entry.date === completedDate && entry.status === "completed") ? 0 : 1),
      playbackHistory: current.playbackHistory.map((entry) => entry.date === completedDate && entry.status === "playing" ? { ...entry, status: "completed", completedAt: Date.now() } : entry),
    }));
    try { window.localStorage.removeItem(MORNING_AUDIO_POSITION_KEY); } catch { /* no-op */ }
    if (autoMorningPlaybackRef.current) {
      autoMorningPlaybackRef.current = false;
      restoreIdleScreenAfter(30 * 1000);
    }
    setActiveAudioProgram(null);
  }

  function selectMorningWord(index: number) {
    setSelectedMorningWordIndex(index);
    const word = morningWords[index];
    if (!word) return;
    if (!morningPlayerOpen) speak(word.word, "en-US");
  }

  function seekProgramAudio(value: string) {
    if (!activeAudioProgram) return;
    const target = Math.max(0, Math.min(activeAudioDuration, Number(value) || 0));
    let cursor = 0;
    let nextIndex = 0;
    for (let index = 0; index < activeAudioProgram.audio.chapters.length; index += 1) {
      const duration = activeAudioProgram.audio.chapters[index].durationSeconds;
      if (target <= cursor + duration || index === activeAudioProgram.audio.chapters.length - 1) {
        nextIndex = index;
        break;
      }
      cursor += duration;
    }
    const chapterTime = Math.max(0, target - cursor);
    pendingAudioSeekRef.current = chapterTime;
    setAudioChapterTime(chapterTime);
    if (nextIndex === audioChapterIndex && morningAudioRef.current) {
      morningAudioRef.current.currentTime = chapterTime;
      pendingAudioSeekRef.current = 0;
    } else {
      setAudioChapterIndex(nextIndex);
    }
    saveProgramAudioPosition(chapterTime);
  }

  async function syncFromCloud(localState: StoredDashboard) {
    if (!isCloudBaseConfigured()) {
      setCloudStatus("local");
      lastSyncErrorRef.current = "未配置 CloudBase（缺少 VITE_CLOUDBASE_ACCESS_URL）";
      return;
    }
    try {
      setCloudStatus("connecting");
      const result = await callFamilyApi<StoredDashboard | null>("get");
      const state = result.data;
      if (state && Array.isArray(state.items)) {
        const nextState: StoredDashboard = {
          items: state.items,
          lessonDone: state.lessonDone ?? {},
          announceEnabled: Boolean(state.announceEnabled),
          contentQueue: ensureContentHorizon(Array.isArray(state.contentQueue) ? state.contentQueue : [], new Date()),
          morningPlan: normalizeMorningPlan(state.morningPlan),
          dinnerPlan: normalizeDinnerPlan(state.dinnerPlan),
          callRequest: state.callRequest ?? null,
        };
        cloudSnapshotRef.current = JSON.stringify(nextState);
        knownNoteIdsRef.current = new Set(state.items.filter((item) => item.kind === "note").map((item) => item.id));
        setItems(nextState.items);
        setLessonDone(nextState.lessonDone);
        setAnnounceEnabled(Boolean(nextState.announceEnabled));
        setContentQueue(nextState.contentQueue ?? []);
        setMorningPlan(normalizeMorningPlan(nextState.morningPlan));
        setDinnerPlan(normalizeDinnerPlan(nextState.dinnerPlan));
        setCallRequest(nextState.callRequest ?? null);
      } else {
        await callFamilyApi("put", localState);
        cloudSnapshotRef.current = JSON.stringify(localState);
      }
      lastSyncErrorRef.current = "";
      setCloudReady(true);
      setCloudStatus("synced");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "未知错误");
      lastSyncErrorRef.current = `HTTP 云同步失败：${msg}（这会导致“设备·本机模式”，但 watch 实时监听仍可独立运行）`;
      setCloudStatus("local");
    }
  }

  async function publishCallRequest(nextCallRequest: FamilyCallRequest | null) {
    setCallRequest(nextCallRequest);
    if (!isCloudBaseConfigured()) throw new Error("家庭云端尚未配置，呼叫信号未能发送。");
    cloudDirtyRef.current = true;
    setCloudStatus("saving");
    try {
      await callFamilyApi("put", { items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest: nextCallRequest });
      cloudSnapshotRef.current = JSON.stringify({ items, lessonDone, announceEnabled, contentQueue, morningPlan, dinnerPlan, callRequest: nextCallRequest });
      cloudDirtyRef.current = false;
      setCloudStatus("synced");
    } catch (error) {
      cloudDirtyRef.current = false;
      setCloudStatus("error");
      const detail = error instanceof Error ? error.message : "";
      const hasSpecificMessage = detail && !/暂时无法连接|network|fetch|Failed to fetch/i.test(detail);
      throw new Error(hasSpecificMessage ? detail : `呼叫信号未能发送到家中。${detail || "请检查这台设备的网络后重试。"}`);
    }
  }

  function waitForMorningPause(milliseconds: number, runId: number) {
    return new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (morningRunRef.current !== runId || Date.now() - startedAt >= milliseconds) resolve();
        else window.setTimeout(check, Math.min(250, milliseconds));
      };
      check();
    });
  }

  function speakMorningSegment(currentSegment: MorningSegment, runId: number) {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window) || morningRunRef.current !== runId) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(currentSegment.text);
      const preferredVoice = currentSegment.language === "zh-CN" ? chineseVoice : englishVoice;
      utterance.lang = currentSegment.language;
      utterance.voice = voices.find((voice) => voice.voiceURI === preferredVoice)
        ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(currentSegment.language.slice(0, 2).toLowerCase()))
        ?? null;
      utterance.rate = currentSegment.rate ?? (currentSegment.language === "zh-CN" ? 0.95 : 1);
      utterance.volume = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function startMorningSession(source: "manual" | "auto", startIndex = 0, isSeek = false) {
    if (!isSeek && canPlayProgram(todayMorningProgram)) {
      startProgramAudio(todayMorningProgram!, source);
      return;
    }
    if (morningPlaying && !isSeek) return;
    if (!("speechSynthesis" in window)) {
      window.alert("这台设备不支持网页语音播放。");
      return;
    }
    const runId = morningRunRef.current + 1;
    if (source === "auto") {
      nightWakeUntilRef.current = Date.now() + 16 * 60 * 1000;
      idleLastActivityRef.current = Date.now();
      setIdleScreenMode("hidden");
    }
    const startedAt = isSeek && morningPlaybackStartedAtRef.current ? morningPlaybackStartedAtRef.current : Date.now();
    const shouldCountCompletion = !morningPlan.playbackHistory.some((entry) => entry.date === todayKey && entry.status === "completed");
    morningPlaybackStartedAtRef.current = startedAt;
    morningRunRef.current = runId;
    window.speechSynthesis.cancel();
    setMorningPlaying(true);
    setSpeaking(true);
    if (!isSeek) {
      setMorningPlan((current) => ({
        ...current,
        lastPlayedDate: todayKey,
        // 只有定时自动触发才占用当天的自动播放名额；手动试听/播放不影响定时
        lastAutoPlayedDate: source === "auto" ? todayKey : current.lastAutoPlayedDate,
        playbackHistory: [{ date: todayKey, startedAt, status: "playing" }, ...current.playbackHistory].slice(0, 14),
      }));
    }

    for (let index = startIndex; index < morningSession.length; index += 1) {
      if (morningRunRef.current !== runId) break;
      const currentSegment = morningSession[index];
      setMorningSegmentIndex(index);
      setMorningSeekIndex(index);
      morningSeekRef.current = index;
      setMorningCurrentSegment(currentSegment);
      await speakMorningSegment(currentSegment, runId);
      await waitForMorningPause(currentSegment.pauseAfterMs, runId);
    }

    if (morningRunRef.current !== runId) return;
    setLessonDone((current) => ({ ...current, [todayKey]: true }));
    setMorningPlan((current) => ({
      ...current,
      completedSessions: current.completedSessions + (shouldCountCompletion ? 1 : 0),
      playbackHistory: current.playbackHistory.map((entry) => entry.startedAt === startedAt ? { ...entry, status: "completed", completedAt: Date.now() } : entry),
    }));
    setMorningPlaying(false);
    setSpeaking(false);
    setMorningCurrentSegment(null);
    if (source === "auto") {
      setMorningArmed(true);
      restoreIdleScreenAfter(30 * 1000);
    }
  }

  function stopMorningSession() {
    if (activeAudioProgram) stopProgramAudio();
    const stoppedRun = morningRunRef.current;
    morningRunRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setMorningPlan((current) => ({
      ...current,
      playbackHistory: current.playbackHistory.map((entry) => entry.status === "playing" ? { ...entry, status: "stopped", completedAt: Date.now() } : entry),
    }));
    if (stoppedRun > 0) {
      setMorningPlaying(false);
      setSpeaking(false);
      setMorningCurrentSegment(null);
    }
    if (autoMorningPlaybackRef.current) {
      autoMorningPlaybackRef.current = false;
      restoreIdleScreenAfter(300);
    }
  }

  function updateMorningSeek(value: string) {
    const nextIndex = Math.max(0, Math.min(morningSession.length - 1, Number(value)));
    morningSeekRef.current = nextIndex;
    setMorningSeekIndex(nextIndex);
  }

  function commitMorningSeek() {
    const nextIndex = morningSeekRef.current;
    if (!morningPlaying || nextIndex === morningSegmentIndex) return;
    morningRunRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    window.setTimeout(() => void startMorningSession("manual", nextIndex, true), 80);
  }

  function armMorningPlayback() {
    const nextArmed = !morningArmed;
    setMorningArmed(nextArmed);
    if (nextArmed) {
      // 「启动定时晨读」一键全开：自动晨读开关同步打开（用户意图就是要定时播放），
      // 星期为空时默认每天播放，避免选了时间却因为开关/星期漏选而静默不响
      setMorningPlan((current) => ({
        ...current,
        enabled: true,
        weekdays: current.weekdays.length > 0 ? current.weekdays : [0, 1, 2, 3, 4, 5, 6],
      }));
      speak(`客厅晨间英语已启动，${morningPlan.time} 自动播放。请保持页面打开，并确认 iPad 已连接小度蓝牙。`, "zh-CN");
    }
  }

  function speak(textToSpeak: string, language = "en-US", onDone?: () => void) {
    if (!("speechSynthesis" in window)) {
      window.alert("这台 iPad 暂不支持网页发音，未来可以改用百度音箱播放。 ");
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = language;
    const preferredVoice = language.toLowerCase().startsWith("zh") ? chineseVoice : englishVoice;
    utterance.voice = voices.find((voice) => voice.voiceURI === preferredVoice)
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()))
      ?? null;
    utterance.rate = language === "zh-CN" ? 0.95 : 1;
    utterance.volume = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => { setSpeaking(false); onDone?.(); };
    utterance.onerror = () => { setSpeaking(false); onDone?.(); };
    window.speechSynthesis.speak(utterance);
  }

  function playMessageChime() {
    return new Promise<void>((resolve) => {
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) {
        window.setTimeout(resolve, 350);
        return;
      }
      const context = notificationAudioContextRef.current ?? new AudioContextConstructor();
      notificationAudioContextRef.current = context;
      const play = () => {
        const start = context.currentTime + 0.05;
        const notes = [
          { frequency: 523.25, delay: 0, duration: 0.72 },
          { frequency: 659.25, delay: 0.55, duration: 0.72 },
          { frequency: 783.99, delay: 1.1, duration: 0.82 },
          { frequency: 1046.5, delay: 1.78, duration: 1.05 },
        ];
        notes.forEach((note) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = start + note.delay;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(note.frequency, noteStart);
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteStart + note.duration + 0.05);
        });
        window.setTimeout(resolve, 3000);
      };
      if (context.state === "suspended") {
        void context.resume().then(play).catch(() => window.setTimeout(resolve, 350));
      } else {
        play();
      }
    });
  }

  function decodeNotificationAudio(context: AudioContext, encodedAudio: string) {
    const binary = window.atob(encodedAudio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const audioData = bytes.buffer.slice(0);
    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const succeed = (buffer: AudioBuffer) => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      const fail = (error?: DOMException) => {
        if (settled) return;
        settled = true;
        reject(error ?? new Error("NOTIFICATION_AUDIO_DECODE_FAILED"));
      };
      try {
        // iOS 13 Safari only reliably supports the callback form. Newer browsers
        // also return a Promise, so accept either without decoding twice.
        const pending = context.decodeAudioData(audioData, succeed, fail);
        if (pending && typeof pending.then === "function") void pending.then(succeed).catch(fail);
      } catch (error) {
        fail(error instanceof DOMException ? error : undefined);
      }
    });
  }

  async function playNotificationVoice(encodedAudio: string, mimeType = "audio/mpeg") {
    const context = notificationAudioContextRef.current;
    if (context) {
      try {
        if (context.state === "suspended") await context.resume();
        const audioBuffer = await decodeNotificationAudio(context, encodedAudio);
        const source = context.createBufferSource();
        notificationAudioSourceRef.current = source;
        source.buffer = audioBuffer;
        source.connect(context.destination);
        source.onended = () => {
          if (notificationAudioSourceRef.current === source) notificationAudioSourceRef.current = null;
        };
        source.start();
        return;
      } catch {
        // Continue with the HTMLAudio fallback below.
      }
    }

    // Fallback for browsers without Web Audio. This path also helps devices that
    // can play MP3 but expose an incomplete AudioContext implementation.
    const audio = new Audio(`data:${mimeType};base64,${encodedAudio}`);
    notificationHtmlAudioRef.current = audio;
    audio.volume = 1;
    audio.onended = () => {
      if (notificationHtmlAudioRef.current === audio) notificationHtmlAudioRef.current = null;
    };
    await audio.play();
  }

  async function playIncomingNoteAlert(note: FamilyItem) {
    const runId = notificationAlertRunRef.current + 1;
    notificationAlertRunRef.current = runId;
    const recipient = note.recipient || "全家";
    const cloudAudio = callSecureFamilyFunction<{ audio: string; mimeType: string }>("message-alert-audio", { recipient });
    await playMessageChime();
    if (notificationAlertRunRef.current !== runId) return;
    try {
      const result = await cloudAudio;
      if (notificationAlertRunRef.current !== runId) return;
      await playNotificationVoice(result.audio, result.mimeType);
    } catch {
      speak(`有一条给${recipient}的新留言。`, "zh-CN");
    }
  }

  function startKeepaliveAudio() {
    // 无声循环音频：iOS 上正在播放音频的页面在锁屏后不会被冻结/杀掉，
    // 到点提醒与来电铃声能在锁屏状态下照常出声（屏幕不亮也响）
    if (keepaliveAudioRef.current) {
      if (keepaliveAudioRef.current.paused) void keepaliveAudioRef.current.play().catch(() => undefined);
      return;
    }
    try {
      const audio = new Audio(createSilentWavDataUrl());
      audio.loop = true;
      audio.volume = 1;
      audio.setAttribute("playsinline", "true");
      keepaliveAudioRef.current = audio;
      void audio.play().catch(() => { keepaliveAudioRef.current = null; });
    } catch {
      keepaliveAudioRef.current = null;
    }
  }

  async function playReminderAlert(remindersToRead: FamilyItem[]) {
    const reminderText = remindersToRead.map((item) => item.text.trim()).filter(Boolean).join("。");
    if (!reminderText) return;
    const runId = notificationAlertRunRef.current + 1;
    notificationAlertRunRef.current = runId;
    const cloudAudio = callSecureFamilyFunction<{ audio: string; mimeType: string }>("reminder-alert-audio", { text: reminderText });
    stopLoopRingtone(reminderRingRef.current);
    reminderRingRef.current = null;
    await playMessageChime();
    if (notificationAlertRunRef.current !== runId) return;
    try {
      const result = await cloudAudio;
      if (notificationAlertRunRef.current !== runId) return;
      await playNotificationVoice(result.audio, result.mimeType);
    } catch {
      speak(`家庭提醒。${reminderText}。`, "zh-CN");
    }
    if (notificationAlertRunRef.current !== runId) return;
    // 语音播完 → 嘀嘀循环响，直到点「知道了」（复用来电铃声通道，iOS 上已验证可靠）
    reminderRingRef.current = startLoopRingtone();
  }

  function closeIncomingNote() {
    notificationAlertRunRef.current += 1;
    setIncomingNote(null);
    try { notificationAudioSourceRef.current?.stop(); } catch { /* audio has already ended */ }
    notificationAudioSourceRef.current = null;
    notificationHtmlAudioRef.current?.pause();
    notificationHtmlAudioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    restoreIdleScreenAfter(300);
  }

  function closeIncomingReminder() {
    notificationAlertRunRef.current += 1;
    setIncomingReminder(null);
    stopLoopRingtone(reminderRingRef.current);
    reminderRingRef.current = null;
    try { notificationAudioSourceRef.current?.stop(); } catch { /* audio has already ended */ }
    notificationAudioSourceRef.current = null;
    notificationHtmlAudioRef.current?.pause();
    notificationHtmlAudioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    restoreIdleScreenAfter(300);
  }

  function chooseVoice(kind: "english" | "chinese", voiceURI: string) {
    const nextEnglish = kind === "english" ? voiceURI : englishVoice;
    const nextChinese = kind === "chinese" ? voiceURI : chineseVoice;
    if (kind === "english") setEnglishVoice(voiceURI);
    else setChineseVoice(voiceURI);
    try {
      window.localStorage.setItem(VOICE_PREF_KEY, JSON.stringify({ englishVoice: nextEnglish, chineseVoice: nextChinese }));
    } catch {
      // Voice choice is a device-local preference.
    }
  }

  function toggleAnnouncements() {
    const next = !announceEnabled;
    setAnnounceEnabled(next);
    if (next) speak("家庭提醒播报已开启", "zh-CN");
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function finishRecordingResources() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setRecording(false);
  }

  function readVoiceBlob(blob: Blob, durationSeconds: number) {
    if (blob.size > 350000) {
      setVoiceError("语音文件太大，请控制在 12 秒以内。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setVoiceDataUrl(typeof reader.result === "string" ? reader.result : "");
      setRecordingSeconds(Math.max(1, durationSeconds));
      setVoiceError("");
    };
    reader.onerror = () => setVoiceError("读取语音失败，请重新录制。");
    reader.readAsDataURL(blob);
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else finishRecordingResources();
  }

  async function startVoiceRecording() {
    setVoiceError("");
    setVoiceDataUrl("");
    if (!("mediaDevices" in navigator) || !("MediaRecorder" in window)) {
      setVoiceError("这台设备的 Safari 版本不支持网页直接录音，请使用下面的“选择录音文件”。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mimeTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : undefined);
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        setVoiceError("录音失败，请重试或选择录音文件。");
        finishRecordingResources();
      };
      recorder.onstop = () => {
        const duration = Math.min(12, Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/mp4" });
        finishRecordingResources();
        readVoiceBlob(blob, duration);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setRecordingSeconds(0);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= 12) stopVoiceRecording();
      }, 500);
    } catch {
      setVoiceError("没有获得麦克风权限，请允许访问后重试。");
      finishRecordingResources();
    }
  }

  function selectVoiceFile(file?: File) {
    if (!file) return;
    if (file.size > 350000) {
      setVoiceError("录音文件太大，请选择约 12 秒以内的短语音。");
      return;
    }
    readVoiceBlob(file, Math.max(1, recordingSeconds || 1));
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanText = text.trim();
    const isVoiceNote = composer === "note" && noteMode === "voice";
    if (!composer || (!cleanText && !isVoiceNote) || (isVoiceNote && !voiceDataUrl)) return;
    if (isVoiceNote && notes.filter((item) => item.audioDataUrl).length >= 4) {
      window.alert("最多保留 4 条语音留言，请先删除一条旧语音。");
      return;
    }
    const createdAt = new Date();
    const dueDate = composer === "reminder" && due ? parseLocalReminderValue(due) : null;
    if (composer === "reminder" && !dueDate) {
      window.alert("请选择完整的提醒日期和时间。");
      return;
    }
    if (composer === "reminder" && reminderRepeat === "weekly" && reminderWeekdays.length === 0) {
      window.alert("请至少选择一个需要提醒的星期。");
      return;
    }
    const dueLabel = reminderDueLabel(dueDate, reminderRepeat, reminderWeekdays);
    const weekdayLabel = WEEKDAYS.find((day) => day.value === eventWeekday)?.label ?? "周一";
    const nextItem: FamilyItem = {
      id: editingItemId ?? makeId(), kind: composer, text: cleanText || "语音留言",
      author: composer === "note" ? author.trim() || "家人" : undefined,
      recipient: composer === "note" ? noteRecipient : undefined,
      messageType: composer === "note" ? noteMode : undefined,
      audioDataUrl: isVoiceNote ? voiceDataUrl : undefined,
      audioDuration: isVoiceNote ? recordingSeconds : undefined,
      member: composer === "event" ? member : undefined,
      due: composer === "reminder" ? dueLabel : composer === "event" ? `${weekdayLabel} ${eventStartTime}–${eventEndTime}` : undefined,
      dueAt: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : undefined,
      repeat: composer === "reminder" ? reminderRepeat : undefined,
      repeatWeekdays: composer === "reminder" && reminderRepeat === "weekly" ? reminderWeekdays : undefined,
      weekday: composer === "event" ? eventWeekday : undefined,
      startTime: composer === "event" ? eventStartTime : undefined,
      endTime: composer === "event" ? eventEndTime : undefined,
      done: false, announced: false, createdAt: createdAt.toISOString(), createdAtMs: createdAt.getTime(),
    };
    if (nextItem.kind === "note") knownNoteIdsRef.current.add(nextItem.id);
    if (nextItem.kind === "reminder") setAnnounceEnabled(true);
    setItems((current) => editingItemId ? current.map((item) => item.id === editingItemId ? { ...item, ...nextItem } : item) : [nextItem, ...current]);
    setText("");
    setVoiceDataUrl("");
    setVoiceError("");
    setRecordingSeconds(0);
    setNoteMode("text");
    setNoteRecipient("全家");
    setDue("");
    setReminderRepeat("once");
    setReminderWeekdays([1]);
    setEditingItemId(null);
    setComposer(null);
  }

  function openEventComposer(child: "周毅成" | "周毅然", weekday = 1, item?: FamilyItem) {
    setMember(child);
    setEventWeekday(item?.weekday ?? weekday);
    setEventStartTime(item?.startTime ?? "16:30");
    setEventEndTime(item?.endTime ?? "17:30");
    setText(item?.text ?? "");
    setEditingItemId(item?.id ?? null);
    setComposer("event");
  }

  function loadContentDraft(type: "english" | "science", dateKey: string) {
    const existing = contentQueue.find((item) => item.date === dateKey);
    setContentType(type);
    setContentDate(dateKey);
    setContentSaved(false);
    if (type === "english") {
      setContentTitle(existing?.english?.theme ?? "");
      setContentWords(existing?.english?.words.map((word) => `${word.word} | ${word.phonetic} | ${word.meaning}`).join("\n") ?? "");
      setContentBody(existing?.english?.sentence ?? "");
      setContentExtra(existing?.english?.translation ?? "");
    } else {
      setContentTitle(existing?.science?.title ?? "");
      setContentWords("");
      setContentBody(existing?.science?.copy ?? "");
      setContentExtra(existing?.science?.icon ?? "💡");
    }
  }

  function openContentCenter() {
    loadContentDraft("english", todayKey);
    setSettingsOpen(false);
    setContentCenterOpen(true);
  }

  function saveDailyContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dateKey = contentDate || todayKey;
    const existing = contentQueue.find((item) => item.date === dateKey);
    const next: DailyContent = {
      id: existing?.id ?? `family-${dateKey}`,
      date: dateKey,
      english: existing?.english,
      science: existing?.science,
      source: "family",
      updatedAt: Date.now(),
    };
    if (contentType === "english") {
      const words = contentWords.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const [word = "", phonetic = "", meaning = ""] = line.split(/[|｜]/).map((part) => part.trim());
        return { word, phonetic, meaning };
      }).filter((word) => word.word && word.meaning);
      if (words.length === 0) {
        window.alert("请至少填写一个单词，格式为：单词 | 音标 | 中文");
        return;
      }
      next.english = { theme: contentTitle.trim(), words, sentence: contentBody.trim(), translation: contentExtra.trim() };
    } else {
      next.science = { icon: contentExtra.trim() || "💡", title: contentTitle.trim(), copy: contentBody.trim() };
    }
    setContentQueue((current) => ensureContentHorizon([...current.filter((item) => item.date !== dateKey), next], new Date()));
    setContentSaved(true);
    window.setTimeout(() => setContentSaved(false), 1800);
  }

  function toggleReminder(id: string) {
    const currentDayKey = dayKey(new Date());
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      if (isRecurringReminder(item)) {
        return { ...item, lastCompletedDate: item.lastCompletedDate === currentDayKey ? undefined : currentDayKey };
      }
      return { ...item, done: !item.done };
    }));
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function refreshAppVersion() {
    const refreshUrl = new URL(window.location.href);
    refreshUrl.searchParams.set("refresh", Date.now().toString());
    window.location.replace(refreshUrl.toString());
  }

  function showWatcherReport() {
    const lines: string[] = [];
    lines.push(`【版本】${new Date(__APP_BUILD_TS__).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}`);
    lines.push(`【晨读自动播放】${morningAutoBlock ? `⚠ ${morningAutoBlock}` : `✓ 条件满足，${morningPlan.time} 到点即播`}`);
    lines.push(`【实时连接状态】${watcherStatus.state === "online" ? "✅ 在线（毫秒级同步）" : watcherStatus.state === "connecting" ? "⏳ 连接中" : "⚠ 未上线（走30秒兜底轮询）"}`);
    lines.push("");
    if (watcherStatus.state === "fallback") lines.push(`Watcher 掉线原因：\n${watcherStatus.reason}`);
    else if (watcherStatus.state === "online") lines.push("正常：CloudBase WebSocket watch 已建立。留言/呼叫/改提醒 ≤ 1 秒同步到所有设备。");
    else if (watcherStatus.state === "connecting") lines.push("正在匿名登录 CloudBase + 建立长连接…稍等几秒即可（最多 15 秒会出最终状态）。");
    else lines.push("状态：尚未启动（若持续显示该状态，通常是 Pages 域名访问 CloudBase 的 HTTP/CORS 失败）。");
    lines.push("");
    if (lastSyncErrorRef.current) lines.push(`【HTTP 云同步状态】❌ ${lastSyncErrorRef.current}\n`);
    else lines.push(`【HTTP 云同步状态】✅ 正常（${cloudStatus === "synced" ? "已与腾讯云同步" : cloudStatus === "local" ? "暂时本机模式（未同步）" : "连接中"}）`);
    lines.push("💡 小提示：若 watcher 一直未上线，请确认 CloudBase 控制台已打开「匿名登录」开关，且 family_state 集合安全规则为自定义 JSON {\"read\":true,\"write\":false}。若 HTTP 云同步失败（非 200 / CORS），需在 CloudBase 云函数 HTTP 服务安全域里添加 family-wall-ipad.pages.dev。");
    alert(lines.join("\n"));
  }

  return (
    <main className="dashboard-shell" id="home">
      <header className="topbar">
        <div>
          <p className="eyebrow">{dateLabel} · {timeLabel}</p>
          <h1>{greeting}</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`watch-dot watch-${watcherStatus.state}`}
            title={watcherStatus.state === "online" ? "实时同步在线（≤1s）· 点击查详情" : watcherStatus.state === "connecting" ? "正在建立实时连接…" : "实时离线（走30s兜底）· 点击看原因"}
            onClick={showWatcherReport}
            aria-label="实时同步状态"
          >
            <span>{watcherStatus.state === "online" ? "⚡" : watcherStatus.state === "connecting" ? "◎" : "!"}</span>
          </button>
          <button className="weather-pill" type="button" onClick={() => { setWeatherOpen(true); if (weather.status !== "ready") loadWeather(); }} aria-label="查看详细天气">
            <span className="weather-icon">{weather.status === "ready" ? weatherIcon(weather.code) : "○"}</span>
            <span>
              <strong>{weather.status === "ready" ? `${weather.temperature}°` : weather.status === "loading" ? "定位中" : "天气"}</strong>
              <small>{weather.status === "ready" ? `当前位置 · ${WEATHER_LABELS[weather.code ?? -1] ?? "天气更新"}` : weather.status === "denied" ? "请允许定位" : weather.status === "error" ? "轻点重试" : "正在获取"}</small>
            </span>
          </button>
          <button className={`announce-pill ${announceEnabled ? "enabled" : ""}`} type="button" onClick={toggleAnnouncements}><strong>{announceEnabled ? "🔊" : "🔕"}</strong><small>{announceEnabled ? "播报已开" : "开启播报"}</small></button>
          <button className="update-pill" type="button" onClick={refreshAppVersion}><strong>↻</strong><small>刷新新版</small></button>
          <button type="button" className={`sync-pill ${cloudStatus} watch-sync-${watcherStatus.state}`} onClick={showWatcherReport} title="点击查看实时同步状态">
            <strong>{cloudStatus === "synced" ? "☁✓" : cloudStatus === "saving" ? "☁…" : cloudStatus === "connecting" ? "☁" : "设备"}</strong>
            <small>
              {watcherStatus.state === "online"
                ? "实时在线·毫秒"
                : watcherStatus.state === "connecting"
                  ? "实时连接中…"
                  : watcherStatus.state === "fallback"
                    ? `实时离线·30s兜底`
                    : cloudStatus === "synced"
                      ? "已同步（点看实时）"
                      : cloudStatus === "saving"
                        ? "保存中"
                        : cloudStatus === "connecting"
                          ? "连接中"
                          : "本机模式"}
            </small>
          </button>
          <div className="progress-pill"><strong>{doneCount}/{totalCount}</strong><small>今日完成</small></div>
        </div>
      </header>

      <section className="dashboard-grid">
        <article className={`panel english-panel ${lessonDone[todayKey] ? "lesson-complete" : ""}`} id="english">
          <div className="english-intro">
            <div className="morning-title-row"><div><span className="section-label">BREAKFAST RADIO</span><h2>12 分钟早餐英语</h2></div><button className="morning-settings-button" type="button" onClick={() => setMorningSettingsOpen(true)}>设置</button></div>
            <p>工作日 {morningPlan.time} · {morningLevelLabel} · 已完成 {morningPlan.completedSessions} 次 · 自动变难</p>
            {morningAutoBlock && <p className="morning-selfcheck">⚠ 自动播放未触发：{morningAutoBlock}</p>}
            <div className="morning-route"><span><b>1</b>英文开场</span><span><b>2</b>常用单词</span><span><b>3</b>生活短文</span><span><b>4</b>生活对话</span></div>
            {activeAudioProgram && activeAudioChapter && <div className="morning-audio-now">
              <div className="morning-now-heading"><div><small>{activeAudioProgram.date === todayKey ? "今日云端音频" : `${activeAudioProgram.date} · 提前试听`}</small><strong>{activeAudioChapter.title}</strong></div><b>{playbackTime(activeAudioElapsed)} / {playbackTime(activeAudioDuration)}</b></div>
              <input className="morning-seek" type="range" min="0" max={Math.max(1, activeAudioDuration)} step="1" value={Math.round(activeAudioElapsed)} onChange={(event) => seekProgramAudio(event.target.value)} aria-label="完整音频节目进度" />
              <div className="audio-player-actions"><button type="button" onClick={toggleProgramAudio}>{audioPlaying ? "❚❚ 暂停" : "▶ 继续"}</button><button type="button" onClick={stopProgramAudio}>■ 停止</button><div className="audio-rate-picker">{([0.9, 1, 1.1] as const).map((rate) => <button className={audioRate === rate ? "selected" : ""} type="button" key={rate} onClick={() => setAudioRate(rate)}>{rate.toFixed(1)}×</button>)}</div></div>
              <div className="audio-chapter-row">{activeAudioSections.map((item) => <button className={(activeAudioChapter.section ?? activeAudioChapter.id.split("-")[0]) === item.section ? "selected" : ""} type="button" key={item.section} onClick={() => { pendingAudioSeekRef.current = 0; setAudioChapterTime(0); setAudioChapterIndex(item.index); }}>{item.title}</button>)}</div>
            </div>}
            {morningPlaying && morningCurrentSegment && <div className="morning-now">
              <div className="morning-now-heading"><div><small>正在播放 · 第 {morningSegmentIndex + 1}/{morningSession.length} 段</small><strong>{morningCurrentSegment.title}</strong></div><div className="morning-now-actions"><b>{morningProgress}%</b><button type="button" onClick={stopMorningSession}>■ 停止</button></div></div>
              <input className="morning-seek" type="range" min="0" max={Math.max(0, morningSession.length - 1)} step="1" value={morningSeekIndex} onChange={(event) => updateMorningSeek(event.target.value)} onMouseUp={commitMorningSeek} onTouchEnd={commitMorningSeek} onKeyUp={commitMorningSeek} aria-label="晨间英语播放进度，松开后从所选段落继续" />
              <small className="seek-help">拖动后松开，从对应段落继续</small>
            </div>}
            <div className="lesson-actions">
              <button className="primary-button" type="button" onClick={() => morningPlaying ? stopMorningSession() : audioPlaying ? stopProgramAudio() : void startMorningSession("manual")}>{morningPlaying || audioPlaying ? "■ 停止晨读" : activeAudioProgram?.date === todayKey ? "▶ 继续完整课程" : "▶ 立即播放完整课程"}</button>
              <button className={`complete-button ${morningArmed ? "is-done" : ""}`} type="button" onClick={armMorningPlayback}>{morningArmed ? `✓ 本机守候 ${morningPlan.time}` : "启动定时晨读"}</button>
              <button className={`complete-button ${lessonDone[todayKey] ? "is-done" : ""}`} type="button" onClick={() => setLessonDone((current) => ({ ...current, [todayKey]: !current[todayKey] }))}>
                {lessonDone[todayKey] ? "✓ 今天已学会" : "○ 完成小任务"}
              </button>
            </div>
            <small className="audio-note">{todayMorningProgram?.audio.status === "ready" ? `云端完整音频已准备 · 固定音色 ${todayMorningProgram.audio.voiceName}` : lastMorningPlayback?.date === todayKey ? `今日记录：${lastMorningPlayback.status === "completed" ? "已完成" : lastMorningPlayback.status === "stopped" ? "中途停止" : "播放中"}` : "边吃边听即可，不需要回答或操作 · 云端音频未就绪时自动使用本机播报"}</small>
          </div>
          <div className="lesson-content">
            <div className="word-grid">
              {morningWords.map((item, index) => (
                <button className={`word-card ${activeAudioProgram?.date === todayKey && currentMorningSection === "words" && activeMorningWordIndex === index ? "current" : selectedMorningWordIndex === index ? "selected" : ""}`} key={item.word} type="button" onClick={() => selectMorningWord(index)} aria-label={`朗读 ${item.word}`}>
                  <span className="speaker">♪</span><strong>{item.word}</strong><small>{item.phonetic}</small><em>{item.meaning}</em>
                </button>
              ))}
            </div>
            <button className="sentence-card" type="button" onClick={() => speak(activeMorningWord?.example || lesson.sentence, "en-US")}>
              <span><strong>{activeMorningWord?.example || lesson.sentence}</strong><small>{activeMorningWord ? `${activeMorningWord.word} · ${activeMorningWord.meaning}` : lesson.translation}</small></span><span className="sentence-play">▶</span>
            </button>
          </div>
        </article>

        <article className="panel calendar-panel" id="calendar">
          <div className="panel-heading">
            <div><span className="panel-kicker">WEEKLY SCHEDULE</span><h2>家庭周课表</h2></div>
            <button className="add-button" type="button" onClick={() => openEventComposer("周毅成")}><span>＋</span> 添加课程</button>
          </div>
          <p className="schedule-help">统一从右上角添加课程，点课程块编辑。手机上可左右滑动查看一周。</p>
          <div className="weekly-table-wrap">
            <div className="weekly-table">
              <div className="weekly-corner">成员</div>
              {WEEKDAYS.map((weekday) => <div className={`weekly-day ${date.getDay() === weekday.value ? "today" : ""}`} key={weekday.value}><strong>周{weekday.short}</strong><small>{weekday.value === 0 || weekday.value === 6 ? "周末" : ""}</small></div>)}
              {(["周毅成", "周毅然"] as const).map((child, childIndex) => (
                <div className="weekly-row" key={child}>
                  <div className="weekly-member"><span className={childIndex === 0 ? "child-avatar coral-avatar" : "child-avatar green-avatar"}>{child.slice(-1)}</span><strong>{child}</strong><small>{childIndex === 0 ? "六年级" : "四年级"}</small></div>
                  {WEEKDAYS.map((weekday) => {
                    const cellEvents = familyEvents.filter((item) => item.member === child && item.weekday === weekday.value).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
                    const morningEvents = cellEvents.filter((item) => (item.startTime ?? "") < "12:00");
                    const afternoonEvents = cellEvents.filter((item) => (item.startTime ?? "") >= "12:00" && (item.startTime ?? "") < "18:00");
                    const eveningEvents = cellEvents.filter((item) => (item.startTime ?? "") >= "18:00");
                    const courseBlock = (item: FamilyItem) => <button className={`course-block ${item.id.startsWith("school-") ? "course-school" : "course-extra"} course-${childIndex}`} type="button" key={item.id} onClick={() => openEventComposer(child, weekday.value, item)}><strong>{item.text}</strong></button>;
                    return <div className={`weekly-cell ${date.getDay() === weekday.value ? "today" : ""}`} key={weekday.value}>
                      <div className="course-period-group"><span className="course-period-label">上午</span>{morningEvents.map(courseBlock)}</div>
                      <div className="course-period-group afternoon"><span className="course-period-label">下午</span>{afternoonEvents.map(courseBlock)}</div>
                      <div className="course-period-group evening"><span className="course-period-label">晚上</span>{eveningEvents.map(courseBlock)}</div>
                    </div>;
                  })}
                </div>
              ))}
            </div>
          </div>
          {familyEvents.some((item) => typeof item.weekday !== "number") && <div className="unscheduled-courses"><strong>待补充时间</strong>{familyEvents.filter((item) => typeof item.weekday !== "number").map((item) => <button type="button" key={item.id} onClick={() => openEventComposer(item.member ?? "周毅成", 1, item)}>{item.member} · {item.text} · 点此安排</button>)}</div>}
        </article>

        <article className="panel schedule-panel" id="reminders">
          <div className="panel-heading">
            <div><span className="panel-kicker">REMINDERS</span><h2>家庭提醒</h2></div>
            <div className="note-heading-actions"><button className="note-center-button" type="button" onClick={() => setReminderCenterOpen(true)}>全部 {reminders.length}</button><button className="add-button" type="button" onClick={() => { setDue(defaultReminderValue()); setReminderRepeat("once"); setReminderWeekdays([1]); setComposer("reminder"); }}><span>＋</span> 添加</button></div>
          </div>
          <div className="item-list">
            {reminders.length === 0 && <p className="empty-state">今天还没有提醒。</p>}
            {reminders.slice(0, 3).map((item) => {
              const completed = reminderDoneForDate(item, date);
              return <div className={`reminder-row ${completed ? "done" : ""}`} key={item.id}>
                <button className="round-check" type="button" onClick={() => toggleReminder(item.id)} aria-label={completed ? "恢复提醒" : "完成提醒"}>{completed ? "✓" : ""}</button>
                <button className="reminder-row-content" type="button" onClick={() => setReminderCenterOpen(true)}><strong>{item.text}</strong><small>{item.due}</small></button>
                <button className="delete-button" type="button" onClick={() => removeItem(item.id)} aria-label="删除提醒">×</button>
              </div>;
            })}
            {reminders.length > 3 && <button className="reminder-more-button" type="button" onClick={() => setReminderCenterOpen(true)}>查看其余 {reminders.length - 3} 条提醒 →</button>}
          </div>
        </article>

        <article className="panel notes-panel" id="notes">
          <div className="panel-heading">
            <div><span className="panel-kicker">NOTES</span><h2>家庭留言</h2></div>
            <div className="note-heading-actions"><button className="note-center-button" type="button" onClick={() => setNoteCenterOpen(true)}>全部 {notes.length}</button><button className="add-button" type="button" onClick={() => setComposer("note")}><span>＋</span> 新留言</button></div>
          </div>
          <div className="notes-stack">
            {notes.length === 0 && <p className="empty-state">留一句话给家人吧。</p>}
            {notes.slice(0, 3).map((item, index) => (
              <div className={`note-card note-${index % 3}`} key={item.id}>
                <button className="delete-button note-delete" type="button" onClick={() => removeItem(item.id)} aria-label="删除留言">×</button>
                {item.audioDataUrl ? <><div className="voice-note-label"><span>🎙</span><strong>{item.text}</strong><b>{item.audioDuration ?? ""}秒</b></div><audio className="voice-note-audio" controls preload="metadata" src={item.audioDataUrl} /></> : <p>{item.text}</p>}<small>{item.author}{item.recipient ? ` → ${item.recipient}` : ""} · {formatItemCreatedAt(item, now)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel call-panel" id="call">
          <div className="call-icon">◉</div>
          <div><span className="panel-kicker">FAMILY CALL</span><h2>呼叫家里</h2><p>外地登录看板后一键呼叫；客厅 iPad 响铃，家人接听后开启语音或视频。</p></div>
          <button className="call-button" type="button" onClick={() => setCallSetupOpen(true)}>☎ 呼叫家里</button>
          <small>摄像头不会被远程静默打开</small>
        </article>

        <article className="panel dinner-status-panel" id="dinner">
          <div className="dinner-status-icon" aria-hidden="true">{tonightInteraction.icon}</div>
          <div><span className="panel-kicker">DINNER TOGETHER</span><h2>晚餐互动</h2><p>{tonightDinnerProgram?.status === "ready" ? `${tonightDinnerProgram.newsSummary} · 约3分钟` : `今晚 ${dinnerPlan.time} 自动出现儿童新闻和互动话题。`}</p><button className="dinner-preview-button" type="button" onClick={() => { setDinnerCenterOpen(true); void loadDinnerPrograms(false, false); }}>提前看今晚内容</button></div>
          <time>{dinnerPlan.time}</time>
        </article>

        <article className="panel science-panel" id="science">
          <div className="science-icon">{scienceCard.icon}</div>
          <div><span className="panel-kicker">今日小科普</span><h2>{scienceCard.title}</h2><p>{scienceCard.copy}</p></div>
          <button className="outline-button" type="button" onClick={() => speak(`${scienceCard.title}。${scienceCard.copy}`, "zh-CN")}>▶ 听一听</button>
        </article>
      </section>

      <nav className="dock" aria-label="主要功能">
        <button className="dock-item active" type="button" onClick={() => scrollTo("home")}><span>⌂</span>首页</button>
        <button className="dock-item" type="button" onClick={() => scrollTo("english")}><span>Aa</span>英语</button>
        <button className="dock-item" type="button" onClick={() => scrollTo("calendar")}><span>▦</span>日历</button>
        <button className="dock-item" type="button" onClick={() => { setDue(defaultReminderValue()); setReminderRepeat("once"); setReminderWeekdays([1]); setComposer("reminder"); }}><span>＋</span>提醒</button>
        <button className="dock-item" type="button" onClick={() => setComposer("note")}><span>✎</span>留言</button>
        <button className="dock-item" type="button" onClick={() => { scrollTo("call"); setCallSetupOpen(true); }}><span>☎</span>通话</button>
        <button className="dock-item" type="button" onClick={() => setSettingsOpen(true)}><span>⚙</span>扩展</button>
      </nav>

      {composer && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setComposer(null); setEditingItemId(null); } }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="composer-title">
            <div className="modal-heading"><div><span className="panel-kicker">{editingItemId ? "EDIT" : "NEW"}</span><h2 id="composer-title">{composer === "note" ? "写一条家庭留言" : composer === "event" ? editingItemId ? "编辑课程" : "添加课程或兴趣班" : "添加一个提醒"}</h2></div><button className="modal-close" type="button" onClick={() => { setComposer(null); setEditingItemId(null); }} aria-label="关闭">×</button></div>
            <form onSubmit={submitItem}>
              {composer === "event" && <label>家庭成员<select value={member} onChange={(event) => setMember(event.target.value as "周毅成" | "周毅然")}><option>周毅成</option><option>周毅然</option></select></label>}
              {composer === "note" && <div className="note-mode-switch"><button className={noteMode === "text" ? "selected" : ""} type="button" onClick={() => setNoteMode("text")}>✎ 文字留言</button><button className={noteMode === "voice" ? "selected" : ""} type="button" onClick={() => setNoteMode("voice")}>🎙 语音留言</button></div>}
              {(composer !== "note" || noteMode === "text") && <label>{composer === "event" ? "课程名称" : "内容"}<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={composer === "note" ? "例如：晚上记得带篮球" : composer === "event" ? "例如：英语课、篮球训练" : "例如：周六去看牙医"} rows={composer === "event" ? 2 : 3} /></label>}
              {composer === "note" && noteMode === "voice" && <section className="voice-recorder"><div className={`recording-orb ${recording ? "active" : ""}`}>{recording ? recordingSeconds : "🎙"}</div><strong>{recording ? "正在录音…最长 12 秒" : voiceDataUrl ? "语音已准备好" : "录一条短语音"}</strong>{voiceDataUrl && <audio controls preload="metadata" src={voiceDataUrl} />}<div className="voice-recorder-actions"><button type="button" onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}>{recording ? "■ 停止录音" : voiceDataUrl ? "重新录制" : "开始录音"}</button><label>选择录音文件<input type="file" accept="audio/*" onChange={(event) => selectVoiceFile(event.target.files?.[0])} /></label></div>{voiceError && <p>{voiceError}</p>}<small>旧版 iPad 如果不能直接录音，可选择系统中已有的短录音。</small></section>}
              {composer === "note" ? <div className="note-address-fields"><label>留言人<input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="家人" /></label><label>留言给谁<select value={noteRecipient} onChange={(event) => setNoteRecipient(event.target.value)}><option>全家</option><option>周毅成</option><option>周毅然</option><option>爸爸</option><option>妈妈</option></select></label></div> : composer === "event" ? <div className="course-time-fields"><label>星期<select value={eventWeekday} onChange={(event) => setEventWeekday(Number(event.target.value))}>{WEEKDAYS.map((weekday) => <option value={weekday.value} key={weekday.value}>{weekday.label}</option>)}</select></label><label>开始时间<input type="time" value={eventStartTime} onChange={(event) => setEventStartTime(event.target.value)} required /></label><label>结束时间<input type="time" value={eventEndTime} min={eventStartTime} onChange={(event) => setEventEndTime(event.target.value)} required /></label></div> : <><div className="reminder-schedule-fields"><label>提醒日期<input type="date" value={due.slice(0, 10)} onChange={(event) => setDue(`${event.target.value}T${due.slice(11, 16) || defaultReminderValue().slice(11, 16)}`)} required /></label><label>提醒时间<input type="time" value={due.slice(11, 16)} onChange={(event) => setDue(`${due.slice(0, 10) || defaultReminderValue().slice(0, 10)}T${event.target.value}`)} required /></label><label>重复方式<select value={reminderRepeat} onChange={(event) => setReminderRepeat(event.target.value as NonNullable<FamilyItem["repeat"]>)}><option value="once">不重复</option><option value="daily">每天</option><option value="weekdays">每个工作日</option><option value="weekly">每周指定日期</option></select></label></div>{reminderRepeat === "weekly" && <div className="weekday-picker reminder-weekday-picker"><strong>选择每周提醒日（可多选）</strong><div>{WEEKDAYS.map((weekday) => <button className={reminderWeekdays.includes(weekday.value) ? "selected" : ""} type="button" key={weekday.value} onClick={() => setReminderWeekdays((current) => current.includes(weekday.value) ? current.filter((day) => day !== weekday.value) : [...current, weekday.value])}>{weekday.short}</button>)}</div></div>}</>}
              <button className="primary-button form-submit" type="submit" disabled={(composer === "note" && noteMode === "voice" ? !voiceDataUrl : !text.trim()) || (composer === "event" && eventEndTime <= eventStartTime)}>{editingItemId ? "保存课程修改" : "保存到家庭看板"}</button>
              {editingItemId && composer === "event" && <button className="danger-button" type="button" onClick={() => { removeItem(editingItemId); setComposer(null); setEditingItemId(null); }}>删除这门课程</button>}
            </form>
            <p className="storage-note">{composer === "event" ? "发布后会保存到家庭云端，可在 iPad、手机和电脑上维护。" : "发布后会同步到家庭云端；页面保持打开并开启播报后，到点会朗读提醒。"}</p>
          </section>
        </div>
      )}

      {noteCenterOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteCenterOpen(false); }}>
        <section className="modal-card note-center-modal" role="dialog" aria-modal="true" aria-labelledby="note-center-title">
          <div className="modal-heading"><div><span className="panel-kicker">FAMILY MESSAGE CENTER</span><h2 id="note-center-title">家庭留言中心</h2></div><button className="modal-close" type="button" onClick={() => setNoteCenterOpen(false)} aria-label="关闭留言中心">×</button></div>
          <div className="note-center-toolbar">
            <p>共 {notes.length} 条留言，最新留言排在前面。</p>
            <button type="button" onClick={() => { setNoteCenterOpen(false); setComposer("note"); }}>＋ 新留言</button>
          </div>
          <div className="note-center-list">
            {notes.length === 0 && <p className="empty-state">这里还没有留言。</p>}
            {notes.map((item, index) => <article className={`note-center-item note-${index % 3}`} key={item.id}>
              <header><div><strong>{item.author || "家人"} <span>→ {item.recipient || "全家"}</span></strong><small>{formatItemCreatedAt(item, now)}</small></div><button className="delete-button" type="button" onClick={() => removeItem(item.id)} aria-label="删除留言">×</button></header>
              {item.audioDataUrl ? <><div className="voice-note-label"><span>🎙</span><strong>{item.text}</strong><b>{item.audioDuration ?? ""}秒</b></div><audio className="voice-note-audio" controls preload="metadata" src={item.audioDataUrl} /></> : <p>{item.text}</p>}
            </article>)}
          </div>
        </section>
      </div>}

      {reminderCenterOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReminderCenterOpen(false); }}>
        <section className="modal-card note-center-modal reminder-center-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-center-title">
          <div className="modal-heading"><div><span className="panel-kicker">FAMILY REMINDER CENTER</span><h2 id="reminder-center-title">家庭提醒中心</h2></div><button className="modal-close" type="button" onClick={() => setReminderCenterOpen(false)} aria-label="关闭提醒中心">×</button></div>
          <div className="note-center-toolbar">
            <p>共 {reminders.length} 条提醒，可以完成、恢复或删除。</p>
            <button type="button" onClick={() => { setReminderCenterOpen(false); setDue(defaultReminderValue()); setReminderRepeat("once"); setReminderWeekdays([1]); setComposer("reminder"); }}>＋ 新提醒</button>
          </div>
          <div className="note-center-list reminder-center-list">
            {reminders.length === 0 && <p className="empty-state">这里还没有提醒。</p>}
            {reminders.map((item) => {
              const completed = reminderDoneForDate(item, date);
              return <article className={`reminder-center-item ${completed ? "done" : ""}`} key={item.id}>
                <button className="round-check" type="button" onClick={() => toggleReminder(item.id)} aria-label={completed ? "恢复提醒" : "完成提醒"}>{completed ? "✓" : ""}</button>
                <div><strong>{item.text}</strong><small>{item.due || "未设置时间"}</small><span>{completed ? "今天已完成" : item.repeat && item.repeat !== "once" ? "重复提醒" : "等待提醒"}</span></div>
                <button className="delete-button" type="button" onClick={() => removeItem(item.id)} aria-label="删除提醒">×</button>
              </article>;
            })}
          </div>
          <button className="reminder-center-exit" type="button" onClick={() => setReminderCenterOpen(false)}>关闭提醒中心</button>
        </section>
      </div>}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="modal-card integrations-modal" role="dialog" aria-modal="true" aria-labelledby="integrations-title">
            <div className="modal-heading"><div><span className="panel-kicker">EXTENSIONS</span><h2 id="integrations-title">扩展接口</h2></div><button className="modal-close" type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭">×</button></div>
            <p className="modal-lead">留言、提醒、课程和每日内容会通过 CloudBase 同步到 iPad、手机和电脑。</p>
            <section className="idle-settings-card">
              <div className="morning-switch-row"><div><strong>闲置屏保</strong><small>仅影响这台设备；来电时会自动唤醒</small></div><button className={idleScreenSettings.enabled ? "enabled" : ""} type="button" onClick={() => setIdleScreenSettings((current) => ({ ...current, enabled: !current.enabled }))}>{idleScreenSettings.enabled ? "已开启" : "已关闭"}</button></div>
              <div className="idle-settings-row"><label>无人操作后<select value={idleScreenSettings.idleMinutes} onChange={(event) => setIdleScreenSettings((current) => ({ ...current, idleMinutes: Number(event.target.value) }))}><option value={1}>1 分钟</option><option value={3}>3 分钟</option><option value={5}>5 分钟</option><option value={10}>10 分钟</option></select></label><div><strong>白天显示低亮时钟</strong><small>轻点屏幕立即返回看板</small></div></div>
              <div className="morning-switch-row idle-night-switch"><div><strong>夜间纯黑</strong><small>保留来电、提醒和晨间英语运行</small></div><button className={idleScreenSettings.nightEnabled ? "enabled" : ""} type="button" onClick={() => setIdleScreenSettings((current) => ({ ...current, nightEnabled: !current.nightEnabled }))}>{idleScreenSettings.nightEnabled ? "已开启" : "已关闭"}</button></div>
              {idleScreenSettings.nightEnabled && <div className="morning-form-row"><label>开始<input type="time" value={idleScreenSettings.nightStart} onChange={(event) => setIdleScreenSettings((current) => ({ ...current, nightStart: event.target.value }))} /></label><label>结束<input type="time" value={idleScreenSettings.nightEnd} onChange={(event) => setIdleScreenSettings((current) => ({ ...current, nightEnd: event.target.value }))} /></label></div>}
            </section>
            <button className="content-center-button program-center-button" type="button" onClick={() => { setSettingsOpen(false); setProgramCenterOpen(true); void loadMorningPrograms(); }}><span>7</span><div><strong>未来 7 天课程后台</strong><small>查看单词、短文、对话和音频准备状态；可提前试听或换一套</small></div><b>→</b></button>
            <button className="content-center-button morning-center-button" type="button" onClick={() => { setSettingsOpen(false); setMorningSettingsOpen(true); }}><span>♪</span><div><strong>早餐英语与小度播放</strong><small>内容每天自动轮换；设置 07:20、试听音量和查看记录</small></div><b>→</b></button>
            <button className="content-center-button" type="button" onClick={openContentCenter}><span>✎</span><div><strong>手动指定每日内容（可选）</strong><small>临时补充某一天的开场句或小科普，不操作也会自动更新</small></div><b>→</b></button>
            <section className="voice-settings">
              <div className="voice-settings-heading"><div><span className="panel-kicker">VOICE</span><h3>声音选择</h3></div><small>只影响这台设备</small></div>
              <div className="voice-field"><label>英语点读<select value={englishVoice} onChange={(event) => chooseVoice("english", event.target.value)}>{voices.filter((voice) => voice.lang.toLowerCase().startsWith("en")).map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label><button type="button" onClick={() => speak("Good morning! Have a wonderful day.", "en-US")}>试听</button></div>
              <div className="voice-field"><label>中文提醒<select value={chineseVoice} onChange={(event) => chooseVoice("chinese", event.target.value)}>{voices.filter((voice) => voice.lang.toLowerCase().startsWith("zh")).map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label><button type="button" onClick={() => speak("家庭提醒播报声音试听。", "zh-CN")}>试听</button></div>
              {voices.length === 0 && <p className="voice-empty">Safari 暂未返回可用声音，请在 iPad 设置中下载语音后重新打开页面。</p>}
            </section>
            <div className="integration-grid">
              {FUTURE_INTEGRATIONS.map((integration) => <div className="integration-card" key={integration.id}><span>预留</span><strong>{integration.name}</strong><small>{integration.description}</small></div>)}
            </div>
          </section>
        </div>
      )}

      <FamilyCall
        open={callSetupOpen}
        onOpenChange={setCallSetupOpen}
        request={callRequest}
        onRequestChange={publishCallRequest}
        deviceRole={callDeviceRole}
        onDeviceRoleChange={setCallDeviceRole}
        sharedAudioContextRef={notificationAudioContextRef}
      />

      {weatherOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWeatherOpen(false); }}>
        <section className="modal-card weather-modal" role="dialog" aria-modal="true" aria-labelledby="weather-title">
          <div className="modal-heading"><div><span className="panel-kicker">LOCAL WEATHER</span><h2 id="weather-title">当前位置天气</h2></div><button className="modal-close" type="button" onClick={() => setWeatherOpen(false)} aria-label="关闭天气">×</button></div>
          {weather.status === "loading" && <div className="weather-loading">正在获取当前位置天气…</div>}
          {weather.status === "denied" && <div className="weather-loading">请在 Safari 设置中允许此网站使用位置。</div>}
          {weather.status === "error" && <div className="weather-loading"><span>天气暂时无法读取</span><button type="button" onClick={loadWeather}>重新获取</button></div>}
          {weather.status === "ready" && <>
            <div className="weather-current-card">
              <div className="weather-current-icon">{weatherIcon(weather.code)}</div>
              <div><strong>{weather.temperature}°</strong><span>{WEATHER_LABELS[weather.code ?? -1] ?? "当前天气"}</span></div>
              <button type="button" onClick={loadWeather}>更新</button>
            </div>
            <div className="weather-details"><div><small>体感</small><strong>{weather.apparentTemperature}°</strong></div><div><small>湿度</small><strong>{weather.humidity}%</strong></div><div><small>风速</small><strong>{weather.windSpeed} km/h</strong></div></div>
            <h3 className="weather-forecast-title">未来 7 天天气</h3>
            <div className="weather-forecast">
              {(weather.daily ?? []).map((day, index) => { const forecastDate = new Date(`${day.date}T12:00:00`); return <div className="weather-day" key={day.date}><span>{index === 0 ? "今天" : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(forecastDate)}</span><small>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(forecastDate)}</small><b>{weatherIcon(day.code)}</b><strong>{day.max}° <em>{day.min}°</em></strong><i>降雨 {day.rain}%</i></div>; })}
            </div>
          </>}
        </section>
      </div>}

      <audio className="program-audio-engine" ref={dinnerAudioRef} preload="auto" />
      <audio
        className="program-audio-engine"
        ref={morningAudioRef}
        src={activeAudioChapter?.audioUrl || undefined}
        preload="auto"
        onLoadedMetadata={handleProgramAudioLoaded}
        onCanPlay={() => setMorningAudioBuffering(false)}
        onPlaying={() => setMorningAudioBuffering(false)}
        onWaiting={() => setMorningAudioBuffering(true)}
        onTimeUpdate={handleProgramAudioTime}
        onEnded={finishProgramAudio}
      />

      {idleScreenMode !== "hidden" && <button className={`idle-screen ${idleScreenMode === "black" ? "night-black" : "clock-screen"}`} type="button" aria-label="轻点唤醒家庭看板" onClick={() => { nightWakeUntilRef.current = Date.now() + 2 * 60 * 1000; idleLastActivityRef.current = Date.now(); setIdleScreenMode("hidden"); }}>
        {idleScreenMode === "clock" && <div className="idle-clock-content">
          <time>{timeLabel}</time>
          <strong className="idle-date">{idleDateLabel}</strong>
          <span className="idle-lunar">{lunarDateLabel}</span>
          {weather.status === "ready"
            ? <div className="idle-weather"><b>{weatherIcon(weather.code)}</b><strong>{Math.round(weather.temperature ?? 0)}°</strong><span>{WEATHER_LABELS[weather.code ?? 0] ?? "今日天气"}</span></div>
            : <div className="idle-weather idle-weather-waiting"><span>家庭看板正在守候</span></div>}
          <small className="idle-wake-hint">轻点屏幕唤醒</small>
        </div>}
      </button>}

      {morningPlayerOpen && activeAudioProgram && activeAudioChapter && <section className="morning-program-screen" aria-label="晨间英语播放界面">
        <div className="morning-program-glow morning-program-glow-one" />
        <div className="morning-program-glow morning-program-glow-two" />
        <button className="morning-program-exit" type="button" onClick={exitMorningProgram}>× 退出</button>
        <div className="morning-program-card">
          <header>
            <div><span>BREAKFAST ENGLISH · {activeAudioProgram.date === todayKey ? "TODAY" : activeAudioProgram.date}</span><h2>{activeAudioChapter.title}</h2></div>
            <strong>{playbackTime(activeAudioElapsed)} / {playbackTime(activeAudioDuration)}</strong>
          </header>
          <div className={`morning-program-focus ${currentMorningSection}`}>
            {currentMorningSection === "preview" ? <div className="morning-live-preview">
              <small>TODAY&apos;S WORDS · 今日要学的单词</small>
              <div className="morning-preview-list">
                {activeAudioProgram.words.slice(0, 4).map((item, index) => <article key={item.word} className={index === 0 ? "first" : ""}>
                  <span className="preview-index">{index + 1}</span>
                  <strong>{item.word}</strong>
                  <b>{item.meaning}</b>
                </article>)}
              </div>
            </div> : currentMorningSection === "words" && activeMorningWord ? <div className="morning-live-word">
              <small>WORD {activeMorningWordIndex + 1} / 4</small>
              <strong>{activeMorningWord.word}</strong>
              <em>{activeMorningWord.phonetic}</em>
              <b>{activeMorningWord.meaning}</b>
              <p>{activeMorningWord.example}</p>
            </div> : currentMorningSection === "story" ? <div className="morning-live-script"><small>LIFE STORY</small><h3>{activeAudioProgram.storyTitle}</h3><p>{activeAudioProgram.story}</p></div> : currentMorningSection === "dialogue" ? <div className="morning-live-script dialogue"><small>EVERYDAY DIALOGUE</small><h3>Listen to a natural conversation</h3><p>{activeAudioProgram.dialogue.replace(/ ([A-Z][a-z]+):/g, "\n$1:")}</p></div> : currentMorningSection === "explanation" ? <div className="morning-live-script chinese"><small>中文小提示</small><h3>{activeAudioProgram.explanation}</h3><p>不用逐字翻译，先听懂人物、地点和发生的事情。</p></div> : <div className="morning-live-script"><small>{currentMorningSection === "review" ? "TODAY'S REVIEW" : "GOOD MORNING"}</small><h3>{activeAudioProgram.theme}</h3><p>{currentMorningSection === "review" ? activeAudioProgram.challenge : "Listen, enjoy your breakfast, and learn four useful words."}</p></div>}
          </div>
          <div className="morning-program-words">
            {activeAudioProgram.words.slice(0, 4).map((word, index) => <button className={currentMorningSection === "words" && activeMorningWordIndex === index ? "current" : ""} type="button" key={word.word} onClick={() => {
              const chapterIndex = activeAudioProgram.audio.chapters.findIndex((chapter) => chapter.wordIndex === index);
              if (chapterIndex >= 0) { pendingAudioSeekRef.current = 0; setAudioChapterTime(0); setAudioChapterIndex(chapterIndex); setAudioPlaying(true); }
            }}><strong>{word.word}</strong><small>{word.meaning}</small></button>)}
          </div>
          <div className="morning-program-controls">
            <input type="range" min="0" max={Math.max(1, activeAudioDuration)} step="1" value={Math.round(activeAudioElapsed)} onChange={(event) => seekProgramAudio(event.target.value)} aria-label="晨间英语播放进度" />
            <div><button className="morning-main-control" type="button" onClick={toggleProgramAudio}>{audioPlaying ? "❚❚ 暂停" : "▶ 继续播放"}</button><span>{morningAudioBuffering ? "正在提前加载音频…" : audioPlaying ? "正在播放" : "已暂停"}</span><div className="morning-screen-rate">{([0.9, 1, 1.1] as const).map((rate) => <button className={audioRate === rate ? "selected" : ""} type="button" key={rate} onClick={() => setAudioRate(rate)}>{rate.toFixed(1)}×</button>)}</div></div>
          </div>
          {morningAudioBlockedBySystem && <p className="morning-selfcheck warn">🔇 音频被系统拦截，轻点下方按钮解锁并继续 ▶</p>}
          {morningAudioBlockedBySystem && <button className="arm-device-button" type="button" onClick={() => { const a = morningAudioRef.current; if (a) { void a.play().then(() => { morningAudioUnlockedRef.current = true; setMorningAudioBlockedBySystem(false); setAudioPlaying(true); }).catch(() => { /* 还是不行也没法再提示了 */ }); } }}>🔊 轻点开始播放（解锁系统限制）</button>}
          <nav className="morning-program-chapters" aria-label="节目章节">{activeAudioSections.map((item) => <button className={currentMorningSection === item.section ? "current" : ""} type="button" key={item.section} onClick={() => { pendingAudioSeekRef.current = 0; setAudioChapterTime(0); setAudioChapterIndex(item.index); setAudioPlaying(true); }}>{item.title}</button>)}</nav>
        </div>
      </section>}

      {dinnerInteraction && <section className="dinner-interaction-screen" aria-label="晚餐互动">
        <div className="dinner-glow dinner-glow-one" />
        <div className="dinner-glow dinner-glow-two" />
        <button className="dinner-exit-button" type="button" onClick={exitDinnerExperience} aria-label="退出晚餐播报">× 退出</button>
        <div className="dinner-interaction-card">
          {dinnerPhase === "news" && tonightDinnerProgram?.status === "ready" ? <>
            <span className="dinner-kicker">{dinnerPlan.time} · 今日儿童新闻</span>
            <div className="dinner-illustration" aria-hidden="true">📰</div>
            <h2>{tonightDinnerProgram.newsTitle}</h2>
            <div className="dinner-news-now"><p>{tonightDinnerProgram.newsSummary}</p><small>{dinnerPaused ? `已暂停在第 ${dinnerChapterStatus.current}/${dinnerChapterStatus.total} 段` : dinnerBuffering ? `正在缓冲第 ${Math.max(1, dinnerChapterStatus.current)}/${dinnerChapterStatus.total || 7} 段…` : dinnerChapterStatus.total > 0 ? `正在播放第 ${dinnerChapterStatus.current}/${dinnerChapterStatus.total} 段` : "正在连接新闻音频"} · 科技 / 地理 / 历史</small><button className="dinner-playback-toggle" type="button" onClick={toggleDinnerPlayback}>{dinnerPaused ? "▶ 继续播报" : "❚❚ 暂停播报"}</button></div>
          </> : <>
            <span className="dinner-kicker">新闻播报完毕 · 晚餐互动</span>
            <div className="dinner-illustration" aria-hidden="true">{dinnerInteraction.icon}</div>
            <h2>{dinnerInteraction.prompt}</h2>
            <p>不用回答屏幕，和家人聊聊就好。</p>
          </>}
          {dinnerAudioBlocked && tonightDinnerProgram?.audio.status === "ready" && <button className="dinner-audio-retry" type="button" onClick={() => { unlockDinnerAudio(); setDinnerAudioBlocked(false); setDinnerPhase("news"); window.setTimeout(() => playDinnerNews(tonightDinnerProgram, () => { setDinnerPhase("interaction"); speak(dinnerInteraction.prompt, "zh-CN"); restoreIdleScreenAfter(90 * 1000); }), 180); }}>▶ 轻点播放今晚新闻</button>}
        </div>
      </section>}

      {dinnerCenterOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDinnerCenterOpen(false); }}>
        <section className="modal-card dinner-center-modal" role="dialog" aria-modal="true" aria-labelledby="dinner-center-title">
          <div className="modal-heading"><div><span className="panel-kicker">DINNER PREVIEW</span><h2 id="dinner-center-title">晚餐互动与今日新闻</h2></div><button className="modal-close" type="button" onClick={() => setDinnerCenterOpen(false)} aria-label="关闭">×</button></div>
          <p className="modal-lead">每天 16:30 云端准备当天新闻；到设定时间后客厅 iPad 自动显示。新闻以科技、自然地理和历史为主，已按儿童适宜方式改写。</p>
          <section className="dinner-time-setting"><div><strong>晚餐自动播报时间</strong><small>电脑修改后自动同步到客厅 iPad；修改时间后当天也可重新触发</small></div><input type="time" value={dinnerPlan.time} onChange={(event) => setDinnerPlan((current) => ({ ...current, time: event.target.value }))} />{callDeviceRole === "home" && <button className={dinnerSoundReady ? "ready" : ""} type="button" onClick={unlockDinnerAudio}>{dinnerSoundReady ? "✓ 本机声音已启用" : "启用本机自动声音"}</button>}</section>
          <button className="dinner-test-button" type="button" disabled={dinnerLoading} onClick={() => void testDinnerExperience()}>{dinnerLoading ? "正在准备今晚新闻和音频…" : "▶ 立即测试今晚播报"}</button>
          <div className="dinner-preview-grid">
            <section><span className="panel-kicker">今晚互动</span><div className="dinner-preview-icon">{tonightInteraction.icon}</div><h3>{tonightInteraction.prompt}</h3></section>
            <section><span className="panel-kicker">未来 7 天话题</span><div className="dinner-week-list">{Array.from({ length: 7 }, (_, offset) => { const previewDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset); const item = dinnerInteractionForDate(previewDate); return <div key={dayKey(previewDate)}><time>{offset === 0 ? "今天" : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(previewDate)}</time><span>{item.icon}</span><p>{item.prompt}</p></div>; })}</div></section>
          </div>
          <section className="dinner-news-preview">
            <div><span className="panel-kicker">今日儿童新闻</span><button type="button" onClick={() => void loadDinnerPrograms(false, false)} disabled={dinnerLoading}>{dinnerLoading ? "刷新中…" : "刷新内容"}</button></div>
            {dinnerError && <p className="program-error">{dinnerError}</p>}
            {dinnerLoading && !tonightDinnerProgram && <div className="program-loading">正在收集和整理今天的公开新闻…</div>}
            {tonightDinnerProgram && <><h3>{tonightDinnerProgram.newsTitle}</h3><p>{tonightDinnerProgram.newsSummary}</p>{tonightDinnerProgram.status === "fallback" && <p className="program-error">生文模型尚未开启；开启后由云端下一次定时任务自动重试。</p>}{tonightDinnerProgram.audio.status === "ready" && <div className="dinner-audio-preview">{tonightDinnerProgram.audio.chapters.map((chapter) => <div key={chapter.id}><span>{chapter.title}</span><audio controls preload="none" src={chapter.audioUrl} /></div>)}</div>}<details><summary>查看播报稿和来源</summary><p>{tonightDinnerProgram.newsScript || "今天的新闻暂未生成，晚餐互动仍会照常出现。"}</p>{tonightDinnerProgram.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.provider} · {source.title}</a>)}</details></>}
          </section>
        </section>
      </div>}

      {incomingReminder && <div className="incoming-note-backdrop reminder-alert-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeIncomingReminder(); }}>
        <section className="incoming-note-card reminder-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="reminder-alert-title">
          <button className="incoming-note-close" type="button" onClick={closeIncomingReminder} aria-label="关闭提醒">×</button>
          <div className="incoming-note-icon reminder-alert-icon">🔔</div>
          <span className="panel-kicker">FAMILY REMINDER</span>
          <h2 id="reminder-alert-title">家庭提醒</h2>
          <p>{incomingReminder.text}</p>
          <small>{incomingReminder.due}</small>
          <button className="reminder-dismiss-button" type="button" onClick={closeIncomingReminder}>知道了</button>
        </section>
      </div>}

      {incomingNote && <div className="incoming-note-backdrop" role="presentation" onClick={closeIncomingNote}>
        <section className="incoming-note-card" role="status" aria-live="polite">
          <button className="incoming-note-close" type="button" onClick={closeIncomingNote} aria-label="关闭新留言">×</button>
          <div className="incoming-note-icon">✉</div>
          <span className="panel-kicker">NEW FAMILY MESSAGE</span>
          <h2>给{incomingNote.recipient || "全家"}的新留言</h2>
          <p>{incomingNote.audioDataUrl ? "收到一条语音留言" : incomingNote.text}</p>
          <small>{incomingNote.author || "家人"} · {formatItemCreatedAt(incomingNote, now)}</small>
          <b>稍后自动收起</b>
        </section>
      </div>}

      {programCenterOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProgramCenterOpen(false); }}>
          <section className="modal-card program-center-modal" role="dialog" aria-modal="true" aria-labelledby="program-center-title">
            <div className="modal-heading"><div><span className="panel-kicker">CLOUD MORNING PROGRAMS</span><h2 id="program-center-title">未来 7 天课程后台</h2></div><button className="modal-close" type="button" onClick={() => setProgramCenterOpen(false)} aria-label="关闭">×</button></div>
            <div className="program-center-summary"><div><strong>{morningPrograms.length}/7</strong><small>课程已准备</small></div><p>云端每天 21:00 自动补齐未来一周。今天和明天优先生成完整音频。</p><button type="button" onClick={() => void loadMorningPrograms(false, true)} disabled={programsLoading}>{programsLoading ? "准备中…" : "立即补齐"}</button></div>
            {programsError && <p className="program-error">{programsError}</p>}
            <div className="program-date-strip">
              {morningPrograms.map((program, index) => {
                const programDate = new Date(`${program.date}T12:00:00`);
                return <button className={selectedProgram?.date === program.date ? "selected" : ""} type="button" key={program.date} onClick={() => setSelectedProgramDate(program.date)}><small>{index === 0 ? "今天" : index === 1 ? "明天" : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(programDate)}</small><strong>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(programDate)}</strong><span className={`program-audio-dot ${program.audio.status}`} /></button>;
              })}
            </div>
            {programsLoading && morningPrograms.length === 0 && <div className="program-loading">正在从云端准备未来课程…</div>}
            {selectedProgram && <div className="program-detail">
              <div className="program-detail-heading"><div><span className="panel-kicker">{selectedProgram.date} · 约 {selectedProgram.estimatedMinutes} 分钟</span><h3>{selectedProgram.theme}</h3></div><button type="button" onClick={() => void regenerateMorningProgram(selectedProgram.date)} disabled={Boolean(regeneratingDate)}>{regeneratingDate === selectedProgram.date ? "更换中…" : "换一套"}</button></div>
              <section className="program-word-preview"><h4>初中核心词汇</h4><div>{selectedProgram.words.map((word) => <article key={word.word}><strong>{word.word}</strong><span>{word.phonetic}</span><small>{word.meaning}</small><p>{word.example}</p></article>)}</div></section>
              <div className="program-script-grid">
                <section><span className="panel-kicker">LISTENING STORY</span><h4>{selectedProgram.storyTitle}</h4><p>{selectedProgram.story}</p><small>{selectedProgram.explanation}</small></section>
                <section><span className="panel-kicker">EVERYDAY DIALOGUE</span><h4>生活对话</h4><p className="dialogue-script">{selectedProgram.dialogue}</p><small>挑战句：{selectedProgram.challenge}</small></section>
              </div>
              <section className={`program-audio-card status-${selectedProgram.audio.status}`}>
                <div><span>{selectedProgram.audio.status === "ready" ? "♪" : "○"}</span><div><strong>{selectedProgram.audio.status === "ready" ? "完整音频已准备" : selectedProgram.audio.status === "needs-setup" ? "文字课程已准备，等待开通云端音色" : selectedProgram.audio.status === "error" ? "文字课程可用，音频生成失败" : "完整音频正在准备"}</strong><small>{selectedProgram.audio.status === "ready" ? `${selectedProgram.audio.voiceName} · 约 ${Math.round(programDuration(selectedProgram) / 60)} 分钟 · 4 词生活听力` : "即使音频未生成，客厅 iPad 仍会用本机声音播放备用课程。"}</small></div></div>
                {selectedProgram.audio.status === "ready" && <div className="program-audio-controls"><button type="button" onClick={() => activeAudioProgram?.date === selectedProgram.date ? toggleProgramAudio() : startProgramAudio(selectedProgram)}>{activeAudioProgram?.date === selectedProgram.date && audioPlaying ? "❚❚ 暂停试听" : activeAudioProgram?.date === selectedProgram.date ? "▶ 继续试听" : "▶ 试听完整节目"}</button><div>{([0.9, 1, 1.1] as const).map((rate) => <button className={audioRate === rate ? "selected" : ""} type="button" key={rate} onClick={() => setAudioRate(rate)}>{rate.toFixed(1)}×</button>)}</div></div>}
                {activeAudioProgram?.date === selectedProgram.date && activeAudioChapter && <div className="program-preview-progress"><span>{activeAudioChapter.title}</span><strong>{playbackTime(activeAudioElapsed)} / {playbackTime(activeAudioDuration)}</strong><input type="range" min="0" max={Math.max(1, activeAudioDuration)} value={Math.round(activeAudioElapsed)} onChange={(event) => seekProgramAudio(event.target.value)} /></div>}
              </section>
            </div>}
          </section>
        </div>
      )}

      {morningSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMorningSettingsOpen(false); }}>
          <section className="modal-card morning-modal" role="dialog" aria-modal="true" aria-labelledby="morning-settings-title">
            <div className="modal-heading"><div><span className="panel-kicker">MORNING ENGLISH</span><h2 id="morning-settings-title">晨间英语设置</h2></div><button className="modal-close" type="button" onClick={() => setMorningSettingsOpen(false)} aria-label="关闭">×</button></div>
            <p className="modal-lead">词汇、短文和对话会按日期自动轮换；设置同步到所有设备，“本机守候”只需在客厅 iPad 上开启。</p>
            <div className="morning-switch-row"><div><strong>自动晨读</strong><small>到点立即自动播放；若到点时页面没开，15 分钟内打开也会补播一次</small></div><button className={morningPlan.enabled ? "enabled" : ""} type="button" onClick={() => setMorningPlan((current) => ({ ...current, enabled: !current.enabled }))}>{morningPlan.enabled ? "已开启" : "已关闭"}</button></div>
            <div className="morning-form-row"><label>开始时间<input type="time" value={morningPlan.time} onChange={(event) => setMorningPlan((current) => current.time === event.target.value ? current : { ...current, time: event.target.value, lastAutoPlayedDate: undefined })} /></label><label>课程时长<input value="约 12 分钟" readOnly /></label></div>
            <div className="weekday-picker"><strong>每周播放</strong><div>{WEEKDAYS.map((weekday) => <button className={morningPlan.weekdays.includes(weekday.value) ? "selected" : ""} type="button" key={weekday.value} onClick={() => setMorningPlan((current) => ({ ...current, weekdays: current.weekdays.includes(weekday.value) ? current.weekdays.filter((day) => day !== weekday.value) : [...current.weekdays, weekday.value] }))}>{weekday.short}</button>)}</div></div>
            <section className="volume-check-card"><div><span>🔊</span><div><strong>小度声音偏小？要调两级音量</strong><small>先打开 iPad 控制中心，把媒体音量调高；再对小度说“音量调到 100”。网页语音本身已设为最大。</small></div></div><button type="button" onClick={() => speak("Good morning, Zhou Yicheng and Zhou Yiran. This is the maximum website volume test.", "en-US")}>播放音量测试</button></section>
            <button className={`arm-device-button ${morningArmed ? "armed" : ""}`} type="button" onClick={armMorningPlayback}>{morningArmed ? `✓ 客厅 iPad 正在守候 ${morningPlan.time}` : "在这台 iPad 上启动定时晨读"}</button>
            <p className="morning-selfcheck">{morningAutoBlock ? `⚠ 自动播放未触发：${morningAutoBlock}` : `✓ 条件全部满足，${morningPlan.time} 到点立即播放`}</p>
            <section className="morning-history"><div className="voice-settings-heading"><div><span className="panel-kicker">HISTORY</span><h3>最近播放</h3></div><small>云端同步</small></div>{morningPlan.playbackHistory.length === 0 ? <p>还没有播放记录。</p> : morningPlan.playbackHistory.slice(0, 5).map((entry) => <div className="history-row" key={entry.startedAt}><span>{entry.date}</span><strong>{entry.status === "completed" ? "✓ 已完成" : entry.status === "stopped" ? "■ 中途停止" : "▶ 播放中"}</strong><time>{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.startedAt))}</time></div>)}</section>
          </section>
        </div>
      )}

      {contentCenterOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContentCenterOpen(false); }}>
          <section className="modal-card content-modal" role="dialog" aria-modal="true" aria-labelledby="content-title">
            <div className="modal-heading"><div><span className="panel-kicker">REMOTE CONTENT</span><h2 id="content-title">每日内容中心</h2></div><button className="modal-close" type="button" onClick={() => setContentCenterOpen(false)} aria-label="关闭">×</button></div>
            <p className="modal-lead">你在手机或电脑保存后，客厅 iPad 会自动同步。可以提前安排未来日期。</p>
            <form onSubmit={saveDailyContent}>
              <div className="content-fields-row">
                <label>日期<input type="date" value={contentDate} onChange={(event) => loadContentDraft(contentType, event.target.value)} required /></label>
                <label>内容类型<select value={contentType} onChange={(event) => loadContentDraft(event.target.value as "english" | "science", contentDate || todayKey)}><option value="english">早餐英语</option><option value="science">今日小科普</option></select></label>
              </div>
              <label>{contentType === "english" ? "学习主题" : "科普标题"}<input value={contentTitle} onChange={(event) => setContentTitle(event.target.value)} placeholder={contentType === "english" ? "例如：快乐的周末" : "例如：云为什么不会掉下来？"} required /></label>
              {contentType === "english" && <label>单词（每行一个）<textarea value={contentWords} onChange={(event) => setContentWords(event.target.value)} placeholder={"happy | /ˈhæpi/ | 开心的\nweekend | /ˌwiːkˈend/ | 周末"} rows={4} required /><small className="field-help">格式：英文单词 | 音标 | 中文意思</small></label>}
              <label>{contentType === "english" ? "英文句子" : "科普内容"}<textarea value={contentBody} onChange={(event) => setContentBody(event.target.value)} rows={3} required /></label>
              <label>{contentType === "english" ? "句子中文翻译" : "图标（一个 Emoji）"}<input value={contentExtra} onChange={(event) => setContentExtra(event.target.value)} required /></label>
              <button className="primary-button form-submit" type="submit">{contentSaved ? "✓ 已保存并等待同步" : "保存到家庭云端"}</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
