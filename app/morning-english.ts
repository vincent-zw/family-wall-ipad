export type MorningPlayback = {
  date: string;
  startedAt: number;
  completedAt?: number;
  status: "playing" | "completed" | "stopped";
};

export type MorningPlan = {
  enabled: boolean;
  time: string;
  weekdays: number[];
  durationMinutes: number;
  completedSessions: number;
  lastPlayedDate?: string;
  /** 最近一次「自动触发」晨读的日期（手动试听/播放不写入，避免手动操作吞掉当天的定时播放） */
  lastAutoPlayedDate?: string;
  playbackHistory: MorningPlayback[];
};

export type MorningSegment = {
  id: string;
  title: string;
  audience: "全家" | "周毅然" | "周毅成";
  language: "zh-CN" | "en-US";
  text: string;
  pauseAfterMs: number;
  rate?: number;
};

type DashboardLesson = { sentence: string };

export const DEFAULT_MORNING_PLAN: MorningPlan = {
  enabled: true,
  time: "07:20",
  weekdays: [1, 2, 3, 4, 5],
  durationMinutes: 12,
  completedSessions: 0,
  playbackHistory: [],
};

const EASY_WORD_PACKS: Array<{ theme: string; words: JuniorWord[] }> = [
  { theme: "Getting ready", words: [
    ["ready", "准备好的", "I am ready for school."], ["remember", "记得", "Remember to take your water bottle."],
    ["carry", "携带", "I carry my books in a schoolbag."], ["leave", "离开", "We leave home at seven thirty."],
    ["early", "早的、提早", "I get up early on school days."], ["important", "重要的", "Breakfast is important for students."],
  ] },
  { theme: "At breakfast", words: [
    ["enough", "足够的", "Do you have enough time for breakfast?"], ["choose", "选择", "I choose an egg and some bread."],
    ["fresh", "新鲜的", "The fruit is fresh and sweet."], ["usually", "通常", "I usually drink milk in the morning."],
    ["finish", "完成、吃完", "Please finish your breakfast."], ["hungry", "饥饿的", "I feel hungry after exercise."],
  ] },
  { theme: "A school day", words: [
    ["arrive", "到达", "We arrive at school before eight."], ["during", "在……期间", "We stay quiet during the lesson."],
    ["practice", "练习", "I practice English every day."], ["subject", "学科", "Science is my favourite subject."],
    ["question", "问题", "The teacher asks an easy question."], ["answer", "回答、答案", "I know the answer."],
  ] },
  { theme: "After school", words: [
    ["together", "一起", "We walk home together."], ["borrow", "借入", "I borrow a book from the library."],
    ["return", "归还、返回", "Please return the book on Friday."], ["before", "在……之前", "I finish homework before dinner."],
    ["relax", "放松", "Music helps me relax."], ["plan", "计划", "We plan our weekend on Friday."],
  ] },
  { theme: "Weather and clothes", words: [
    ["weather", "天气", "The weather is cool today."], ["cloudy", "多云的", "It is cloudy but not cold."],
    ["umbrella", "雨伞", "Take an umbrella with you."], ["wear", "穿着", "I wear a light jacket."],
    ["change", "变化、改变", "The weather can change quickly."], ["outside", "在外面", "It is windy outside."],
  ] },
  { theme: "Sports and health", words: [
    ["exercise", "锻炼", "Regular exercise keeps us healthy."], ["strong", "强壮的", "Running makes my legs strong."],
    ["rest", "休息", "Take a short rest after the game."], ["team", "队伍", "Our basketball team trains on Saturday."],
    ["enjoy", "享受、喜欢", "I enjoy playing with my friends."], ["careful", "小心的", "Be careful on the wet ground."],
  ] },
  { theme: "Helping at home", words: [
    ["help", "帮助", "I help set the table."], ["clean", "打扫、干净的", "We clean the room together."],
    ["share", "分享、分担", "Family members share the work."], ["simple", "简单的", "This is a simple job."],
    ["busy", "忙碌的", "Mum is busy this evening."], ["later", "稍后", "I will wash the dishes later."],
  ] },
  { theme: "Around the city", words: [
    ["station", "车站", "The bus station is near our home."], ["street", "街道", "The street is busy in the morning."],
    ["wait", "等待", "We wait for the green light."], ["cross", "穿过", "Do not cross the road now."],
    ["near", "在附近", "The library is near the park."], ["safe", "安全的", "This is a safe place to cross."],
  ] },
];

type JuniorWord = [word: string, meaning: string, example: string];

const JUNIOR_WORD_PACKS: Array<{ theme: string; words: JuniorWord[] }> = [
  { theme: "Learning and progress", words: [
    ["improve", "提高、改善", "A little practice can improve your English."], ["effort", "努力", "Your effort today will make tomorrow easier."],
    ["progress", "进步", "Small steps can lead to great progress."], ["patient", "有耐心的", "Be patient when something feels difficult."],
    ["review", "复习", "I review new words before school."], ["achieve", "实现、达到", "We can achieve a goal step by step."],
  ] },
  { theme: "Thinking and discovery", words: [
    ["curious", "好奇的", "Curious students often ask useful questions."], ["observe", "观察", "Observe the sky and notice how it changes."],
    ["discover", "发现", "Scientists discover new facts through experiments."], ["explain", "解释", "Can you explain the idea in simple words?"],
    ["compare", "比较", "Compare the two pictures and find the difference."], ["reason", "原因、理由", "There is a good reason for every careful choice."],
  ] },
  { theme: "People and teamwork", words: [
    ["cooperate", "合作", "We cooperate to finish the project."], ["responsible", "负责任的", "A responsible person keeps a promise."],
    ["support", "支持", "Family members support one another."], ["communicate", "沟通", "Good teams communicate clearly."],
    ["respect", "尊重", "We should respect different ideas."], ["solution", "解决办法", "Together we can find a better solution."],
  ] },
  { theme: "Time and attention", words: [
    ["attention", "注意力", "Please give your full attention to the road."], ["interrupt", "打断", "Messages can interrupt your work."],
    ["focus", "专注", "I can focus better in a quiet room."], ["habit", "习惯", "Reading every morning is a useful habit."],
    ["schedule", "日程安排", "Check your schedule before you leave home."], ["prepare", "准备", "Prepare your schoolbag the night before."],
  ] },
  { theme: "Nature and environment", words: [
    ["environment", "环境", "We all share the same environment."], ["reduce", "减少", "Walking can reduce air pollution."],
    ["protect", "保护", "Small actions help protect the ocean."], ["energy", "能源、精力", "Turn off the light to save energy."],
    ["natural", "自然的", "Sunlight is a natural source of energy."], ["increase", "增加", "The temperature may increase this afternoon."],
  ] },
  { theme: "Health and daily life", words: [
    ["healthy", "健康的", "A healthy breakfast gives us energy."], ["balance", "平衡", "Try to balance study, exercise, and rest."],
    ["regular", "规律的", "Regular exercise helps us sleep well."], ["avoid", "避免", "Avoid using a bright screen before bed."],
    ["instead", "代替、反而", "Take the stairs instead of the lift."], ["necessary", "必要的", "Enough water is necessary for your body."],
  ] },
  { theme: "Travel and the city", words: [
    ["journey", "旅程", "Every journey begins with a first step."], ["route", "路线", "This route takes us through the city centre."],
    ["public", "公共的", "Public transport can carry many people."], ["local", "当地的", "We tried some local food on our trip."],
    ["direction", "方向", "Could you show me the right direction?"], ["convenient", "方便的", "The metro is fast and convenient."],
  ] },
  { theme: "Change and decisions", words: [
    ["choice", "选择", "A careful choice can save time."], ["decide", "决定", "We need to decide what to do first."],
    ["possible", "可能的", "Is it possible to finish before Friday?"], ["result", "结果", "Good preparation often brings a better result."],
    ["advantage", "优势、好处", "One advantage of cycling is that it keeps us fit."], ["consider", "考虑", "Consider both sides before you make a decision."],
  ] },
];

const EASY_LISTENING_STORIES = [
  { title: "A quick breakfast", passage: "Yiran gets up at seven o'clock. He washes his face and comes to the kitchen. There is an egg, some bread, and a glass of milk on the table. He is not very hungry, but he knows breakfast is important. He eats the egg, takes a piece of bread, and puts his water bottle in his schoolbag. Now he is ready to leave home.", explanation: "短文讲的是吃早餐和准备上学。", dialogue: "Mum: Good morning. Would you like an egg? Yiran: Yes, please. Is there any bread? Mum: It is beside the milk. Yiran: Great. I have enough time today. Mum: Good. Do not forget your water bottle. Yiran: It is already in my schoolbag." },
  { title: "Where is my English book?", passage: "Yicheng is ready for school, but he cannot find his English book. He looks on the desk and under the chair. It is not there. Then his brother points to the sofa. The book is beside a blue jacket. Yicheng puts it in his bag and checks his other books. He still has five minutes before they leave, so everyone can relax.", explanation: "短文讲的是出门前寻找英语书。", dialogue: "Yicheng: Have you seen my English book? Yiran: Is it on your desk? Yicheng: No, I checked the desk. Yiran: Look beside your blue jacket. Yicheng: There it is. Thank you. Yiran: You are welcome. Let us go." },
  { title: "A rainy morning", passage: "The sky is grey this morning. Dad checks the weather on his phone. It may rain before noon. Yiran puts a small umbrella in his schoolbag, and Yicheng wears a light jacket. They usually walk to school, but today they decide to take the bus. The bus stop is near their home, so they do not need to hurry.", explanation: "短文讲的是下雨天如何准备出门。", dialogue: "Dad: It may rain this morning. Yicheng: Should I take an umbrella? Dad: Yes, and wear your light jacket. Yiran: Are we walking to school? Dad: Let us take the bus today. Yiran: Good idea. The bus stop is very near." },
  { title: "After-school basketball", passage: "Yicheng has basketball practice after school. He finishes his homework early and changes his shoes. At the playground, the team runs for ten minutes and then practises passing the ball. The ground is a little wet, so the coach asks everyone to be careful. Yicheng enjoys the practice because he can exercise and spend time with his friends.", explanation: "短文讲的是放学后的篮球训练。", dialogue: "Coach: Is everyone ready? Team: Yes, we are. Coach: The ground is wet, so please be careful. Yicheng: Shall we practise passing first? Coach: Yes. Work in pairs. Yicheng: Come on, let us start." },
  { title: "A library book", passage: "Yiran borrows a science book from the school library. The book has many pictures of animals and plants. He reads two pages on the bus and shows one picture to his brother. The book must go back on Friday, so Yiran writes the date on a note. He plans to read a few pages every evening before dinner.", explanation: "短文讲的是借阅和归还图书。", dialogue: "Yiran: Look at this science book. Yicheng: The pictures are great. When must you return it? Yiran: On Friday. I wrote the date here. Yicheng: Good plan. Can I read it after you? Yiran: Of course." },
  { title: "Helping with dinner", passage: "Mum is busy making dinner, so the boys help in the kitchen. Yiran puts bowls and chopsticks on the table. Yicheng washes some tomatoes and carries the soup carefully. The work is simple when everyone helps. After dinner, the boys put the dishes near the sink. They finish quickly and have time to relax together.", explanation: "短文讲的是一家人一起准备晚餐。", dialogue: "Mum: Could you help set the table? Yiran: Sure. How many bowls do we need? Mum: Four, please. Yicheng: I can wash the tomatoes. Mum: Thank you. Dinner will be ready soon. Yiran: Everything is on the table now." },
  { title: "The bus to school", passage: "The boys take the number twelve bus to school. There are many people at the station, but the bus arrives on time. They find two seats near the window. On the way, they see a park, a library, and a busy shopping street. After fifteen minutes, Yicheng sees the school gate and presses the stop button.", explanation: "短文讲的是乘公交车去学校。", dialogue: "Yiran: Is this the right bus? Yicheng: Yes, number twelve goes to our school. Yiran: Can we sit near the window? Yicheng: Sure. There are two seats over there. Yiran: Please tell me when we are close. Yicheng: No problem." },
];

const LISTENING_STORIES = [
  { title: "A calm start", passage: "A good morning does not need to be perfect. It can begin with a glass of water, a healthy breakfast, and a few quiet minutes. When we prepare our clothes and schoolbags the night before, the morning feels less hurried. We have more attention for the people around us and more energy for the day ahead. Small routines may look unimportant, but they often shape the way we feel and work.", explanation: "短文说，好的早晨不需要完美。提前准备书包、安静吃早餐这些小习惯，会让一天更从容、更有精力。", dialogue: "Dad: Is everything ready for school? Ethan: Almost. I just need my water bottle. Dad: It is beside your schoolbag. Ethan: Great, thank you. Dad: What is your first class today? Ethan: English. We are going to read a short story. Dad: Sounds good. Have a calm and productive day. Ethan: I will. See you this evening." },
  { title: "The power of small steps", passage: "People sometimes wait for a perfect moment to begin. However, real progress usually comes from small actions repeated every day. Reading one page, learning one useful phrase, or walking for ten minutes may seem simple. Over time, these actions build confidence and skill. The important thing is not to move quickly all the time. It is to keep moving in the right direction, even when the step is small.", explanation: "短文的核心是积少成多。真正的进步常常来自每天重复的小行动，速度不一定快，但方向要正确。", dialogue: "Mum: What is one small goal for today? Yiran: I want to remember six new words. Mum: How will you do that? Yiran: I will listen to them twice and review them after school. Mum: That sounds possible. Yiran: Yes. A small goal is easier to start. Mum: Exactly. Small steps can bring big progress." },
  { title: "Why curiosity matters", passage: "Curious people do more than remember answers. They observe carefully, notice patterns, and ask why things happen. A good question can lead to an experiment, a discovery, or a completely new idea. Curiosity also makes ordinary life more interesting. A cloud, an insect, or even a spoon in a glass of water can become the beginning of a science question. Learning starts when we pay attention.", explanation: "短文介绍了好奇心的重要性。仔细观察日常生活并提出好问题，是学习和发现的开始。", dialogue: "Yicheng: Why does the spoon look bent in the water? Yiran: Maybe the water changes the light. Yicheng: That is a good guess. We can look it up after breakfast. Yiran: Or we can try the same thing with a pencil. Yicheng: Great idea. One question has already become an experiment." },
  { title: "A stronger team", passage: "A strong team does not mean that everyone thinks in the same way. Team members listen, share responsibility, and support one another. Different ideas can help the group see a problem from more than one direction. When people communicate clearly and respect each other, disagreements do not have to become fights. They can become useful discussions that lead to a better solution.", explanation: "短文说，好的团队并不是所有人想法都一样，而是能够倾听、分工、尊重不同意见，并一起找到更好的办法。", dialogue: "Student A: I think our poster needs more pictures. Student B: I prefer more facts and fewer pictures. Student A: Could we use one large picture and three short facts? Student B: That sounds balanced. Student A: Great. I will find the picture. Student B: And I will check the facts." },
  { title: "Protect your attention", passage: "Phones and messages can interrupt us many times a day. Each interruption looks short, but our mind needs time to return to difficult work. When we protect our attention, studying becomes calmer and often faster. Turning off one notification, putting the phone in another room, or focusing for fifteen minutes can be a useful habit. Attention is limited, so we should choose carefully where to place it.", explanation: "短文提醒我们，注意力是有限的。减少通知和打断、短时间专注学习，往往会让效率更高。", dialogue: "Yicheng: I need twenty minutes to finish this exercise. Dad: Do you want me to keep your phone? Yicheng: Yes, please. The messages interrupt me. Dad: I will put it on the shelf. Yicheng: Thanks. I can check it when the exercise is done." },
  { title: "A greener journey", passage: "Many cities are trying to make travel cleaner and easier. More people walk, cycle, or take public transport for short journeys. A good route can save time and reduce pollution at the same time. Of course, one choice cannot solve every environmental problem. But millions of small daily choices can change a city. A greener journey can also give us exercise and a better view of the place where we live.", explanation: "短文讲绿色出行。步行、骑车或公共交通既能减少污染，也能让我们运动并更好地观察城市。", dialogue: "Mum: Shall we take a taxi to the library? Yiran: The metro may be faster today. Mum: Good point. The station is only five minutes away. Yiran: And we can walk through the park on the way back. Mum: Perfect. That sounds like a greener journey." },
  { title: "Sleep helps us learn", passage: "Sleep is not simply a time when the brain turns off. While we sleep, the brain organises information and strengthens important memories. That is one reason a good night's sleep can help us learn. Staying up late may give us more time with a book, but it can reduce attention the next day. Regular sleep, exercise, and a calm bedtime routine are all useful parts of effective study.", explanation: "短文说明睡眠也是学习的一部分。睡眠帮助大脑整理信息、加强记忆，熬夜反而可能降低第二天的注意力。", dialogue: "Dad: You look tired this morning. Yicheng: I went to bed too late. Dad: Were you studying? Yicheng: At first, yes. Then I watched some videos. Dad: Let us move the phone out of the bedroom tonight. Yicheng: Good idea. I need a more regular sleep schedule." },
];

function segment(id: string, title: string, audience: MorningSegment["audience"], language: MorningSegment["language"], text: string, pauseAfterMs = 2500, rate?: number): MorningSegment {
  return { id, title, audience, language, text, pauseAfterMs, rate };
}

export function normalizeMorningPlan(value?: Partial<MorningPlan> | null): MorningPlan {
  const weekdays = Array.isArray(value?.weekdays)
    ? value.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : DEFAULT_MORNING_PLAN.weekdays;
  return {
    enabled: value?.enabled !== false,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(value?.time ?? "") ? value!.time! : DEFAULT_MORNING_PLAN.time,
    weekdays: weekdays.length > 0 ? weekdays : DEFAULT_MORNING_PLAN.weekdays,
    durationMinutes: 12,
    completedSessions: typeof value?.completedSessions === "number" && value.completedSessions >= 0 ? Math.floor(value.completedSessions) : 0,
    lastPlayedDate: value?.lastPlayedDate,
    lastAutoPlayedDate: value?.lastAutoPlayedDate,
    playbackHistory: Array.isArray(value?.playbackHistory) ? value!.playbackHistory!.slice(0, 14) : [],
  };
}

export function buildMorningSession(date: Date, lesson: DashboardLesson, completedSessions = 0): MorningSegment[] {
  const absoluteDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const isFoundationStage = completedSessions < 30;
  const wordPacks = isFoundationStage ? EASY_WORD_PACKS : JUNIOR_WORD_PACKS;
  const stories = isFoundationStage ? EASY_LISTENING_STORIES : LISTENING_STORIES;
  const wordCount = completedSessions < 10 ? 4 : completedSessions < 25 ? 5 : 6;
  const englishRate = 1;
  const dialogueRate = 1;
  const wordPack = wordPacks[absoluteDay % wordPacks.length];
  const story = stories[absoluteDay % stories.length];
  const activeWords = wordPack.words.slice(0, wordCount);
  const wordPreview = activeWords.map(([word]) => word).join(". ");
  const vocabularySegments = activeWords.map(([word, , example], index) =>
    segment(`word-${index}-english`, "初中核心单词", "全家", "en-US", `Word number ${index + 1}. ${word}. ${word}. ${example} Once again. ${word}. ${example}`, 700),
  );
  const meaningReview = activeWords.map(([word, meaning]) => `${word}，${meaning}`).join("；");
  const exampleReview = activeWords.map(([word, , example]) => `${word}. ${example}`).join(" ");
  const shortStoryHint = `${story.explanation.split("。")[0]}。`;

  const sequence = [
    segment("welcome", "早餐英语电台", "全家", "zh-CN", `早餐英语开始。先听今天的${wordCount}个常用单词。`, 250),
    segment("opening", "英文开场", "全家", "en-US", "Good morning, Yicheng and Yiran. Today's English starts now.", 350),
    segment("word-preview", "今日单词预告", "全家", "en-US", `Today's vocabulary theme is ${wordPack.theme}. Listen to the words first. ${wordPreview}.`, 850),
    ...vocabularySegments,
    segment("word-meanings", "单词词义", "全家", "zh-CN", meaningReview, 500),
    segment("word-review", "单词例句连听", "全家", "en-US", exampleReview, 900),
    segment("daily-sentence", "今日英文", "全家", "en-US", `Here is today's English sentence. ${lesson.sentence} Listen once more. ${lesson.sentence}`, 650),
    segment("story-intro", "英文听力短文", "全家", "en-US", `Now it is time for a short listening story. The title is: ${story.title}. Listen for the main idea.`, 650),
    segment("story-first", "短文第一遍", "全家", "en-US", story.passage, 1000),
    segment("story-explain", "一句中文提示", "全家", "zh-CN", shortStoryHint, 500),
    segment("story-second-intro", "短文第二遍", "全家", "en-US", `Here is the story again. This time, notice the useful expressions and the rhythm of each sentence.`, 500),
    segment("story-second", "短文第二遍", "全家", "en-US", story.passage, 900),
    segment("story-keywords", "听力词汇回顾", "全家", "en-US", `Before the dialogue, here are today's words again. ${wordPreview}. Keep listening and see if you can hear a familiar idea.`, 650),
    segment("dialogue-intro", "生活情景对话", "全家", "en-US", "Now listen to a short everyday conversation. It will play twice at a natural speed.", 500),
    segment("dialogue-first", "对话第一遍", "全家", "en-US", story.dialogue, 650, dialogueRate),
    segment("dialogue-second", "对话第二遍", "全家", "en-US", story.dialogue, 650, dialogueRate),
    segment("final-review", "今日内容回放", "全家", "en-US", `Let's finish with a quick review. ${exampleReview} Today's sentence was: ${lesson.sentence} Today's listening story was ${story.title}.`, 850),
    segment("english-close", "英文结束语", "全家", "en-US", "That is all for today's breakfast English. You do not need to remember everything. Listening a little every day is already useful. Have a good breakfast and a wonderful day at school.", 500),
  ];
  return sequence.map((item) => item.language === "en-US" && typeof item.rate !== "number" ? { ...item, rate: englishRate } : item);
}
