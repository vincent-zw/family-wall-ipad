export type DinnerInteraction = {
  id: string;
  icon: string;
  prompt: string;
};

const DINNER_INTERACTIONS: DinnerInteraction[] = [
  { id: "happy-moment", icon: "☀️", prompt: "每个人说一件今天让自己开心的小事。" },
  { id: "movie-title", icon: "🎬", prompt: "如果把今天拍成一部电影，你会给它取什么名字？" },
  { id: "new-thing", icon: "💡", prompt: "每个人说一件今天新学会的小事。" },
  { id: "thank-you", icon: "🤝", prompt: "今天有没有一个人，让你想对他说声谢谢？" },
  { id: "funny-moment", icon: "😄", prompt: "今天发生过什么好笑的事？每个人说一件。" },
  { id: "superpower", icon: "⚡️", prompt: "如果今晚可以拥有一种超能力，你会选择什么？" },
  { id: "small-win", icon: "🏅", prompt: "今天哪件小事，让你觉得自己做得不错？" },
  { id: "tomorrow", icon: "🌱", prompt: "明天你最期待的一件事是什么？" },
  { id: "three-words", icon: "💬", prompt: "用三个词形容你的今天。" },
  { id: "family-trip", icon: "🗺️", prompt: "如果周末全家出发，你最想一起去哪里？" },
  { id: "kind-thing", icon: "❤️", prompt: "今天你为别人做过一件什么小事？" },
  { id: "change-one-thing", icon: "🔄", prompt: "如果今天可以重来一次，你最想改变哪一件小事？" },
  { id: "best-sound", icon: "🎧", prompt: "今天你听到过最好听或最有趣的声音是什么？" },
  { id: "teach-us", icon: "🧠", prompt: "每个人用一句话，教全家一个自己知道的小知识。" },
];

export function dinnerInteractionForDate(date: Date) {
  const absoluteDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return DINNER_INTERACTIONS[Math.abs(absoluteDay) % DINNER_INTERACTIONS.length];
}
