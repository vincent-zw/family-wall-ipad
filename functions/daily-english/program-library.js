"use strict";

const crypto = require("crypto");

const PROGRAM_LIBRARY = [
  {
    theme: "Getting ready for school",
    words: [
      ["prepare", "/prɪˈper/", "准备", "I prepare my schoolbag the night before."],
      ["remember", "/rɪˈmembər/", "记得", "Remember to take your water bottle."],
      ["hurry", "/ˈhɜːri/", "匆忙", "We do not need to hurry this morning."],
      ["check", "/tʃek/", "检查", "I check my books before I leave."],
      ["ready", "/ˈredi/", "准备好的", "Everyone is ready for school."],
    ],
    storyTitle: "The missing notebook",
    story: "Yicheng is almost ready for school. He has his books, pencil case, and water bottle, but he cannot find his science notebook. He checks the desk and looks under the chair. Then Yiran sees a green notebook beside the sofa. Yicheng puts it in his bag and thanks his brother. They still have five minutes, so nobody needs to hurry.",
    explanation: "短文讲的是出门前寻找笔记本。",
    dialogue: "Mum: Is everyone ready? Yicheng: Almost. I cannot find my science notebook. Yiran: Is that green notebook yours? Yicheng: Yes, it is. Where was it? Yiran: It was beside the sofa. Mum: Great. Check your bags once more, and then we can leave.",
    challenge: "A careful check can make the whole morning feel calmer.",
  },
  {
    theme: "A healthy breakfast",
    words: [
      ["healthy", "/ˈhelθi/", "健康的", "A healthy breakfast gives us energy."],
      ["choose", "/tʃuːz/", "选择", "I choose an egg and some fruit."],
      ["enough", "/ɪˈnʌf/", "足够的", "Do you have enough time to eat?"],
      ["fresh", "/freʃ/", "新鲜的", "The strawberries are fresh and sweet."],
      ["energy", "/ˈenərdʒi/", "精力", "Breakfast gives me energy for school."],
    ],
    storyTitle: "A different choice",
    story: "Yiran usually eats bread for breakfast, but today there is fresh fruit on the table. He chooses a banana, an egg, and a small piece of bread. Dad reminds him to drink some water too. The meal is simple, but it gives Yiran enough energy for the morning. He finishes breakfast and leaves home feeling ready for class.",
    explanation: "短文讲的是选择简单而健康的早餐。",
    dialogue: "Dad: What would you like for breakfast? Yiran: An egg and some bread, please. Dad: Would you like a banana too? Yiran: Yes. The fruit looks fresh. Dad: Good choice. Do you have enough time? Yiran: Yes, I have ten minutes.",
    challenge: "A balanced breakfast helps us stay focused before lunch.",
  },
  {
    theme: "A rainy school day",
    words: [
      ["weather", "/ˈweðər/", "天气", "The weather may change this afternoon."],
      ["umbrella", "/ʌmˈbrelə/", "雨伞", "Put a small umbrella in your bag."],
      ["instead", "/ɪnˈsted/", "代替", "We take the bus instead of walking."],
      ["careful", "/ˈkerfəl/", "小心的", "Be careful on the wet ground."],
      ["arrive", "/əˈraɪv/", "到达", "We arrive at school before eight."],
    ],
    storyTitle: "The grey clouds",
    story: "Dark clouds cover the sky when the family finishes breakfast. Dad checks the weather and says it may rain soon. Yicheng puts an umbrella in his schoolbag, and Yiran wears a light jacket. They usually walk to school, but today they take the bus instead. The bus arrives quickly, and they reach school before the rain begins.",
    explanation: "短文讲的是雨天上学前的准备。",
    dialogue: "Dad: It may rain before eight. Yicheng: I will take my umbrella. Yiran: Are we walking today? Dad: Let us take the bus instead. Yiran: Good idea. The ground may be wet. Yicheng: We should leave now so we can arrive on time.",
    challenge: "Changing a plan can be the safest choice when the weather changes.",
  },
  {
    theme: "Working together",
    words: [
      ["team", "/tiːm/", "团队", "Our team works well together."],
      ["share", "/ʃer/", "分享、分担", "We share the work fairly."],
      ["support", "/səˈpɔːrt/", "支持", "Good teammates support one another."],
      ["idea", "/aɪˈdiːə/", "想法", "She has a useful idea for the poster."],
      ["solve", "/sɒlv/", "解决", "We can solve the problem together."],
    ],
    storyTitle: "The class poster",
    story: "Yicheng and two classmates are making a poster about clean cities. One student writes the facts, another finds pictures, and Yicheng plans the layout. At first, they disagree about the title. Instead of arguing, they listen to each idea and choose a shorter title together. Sharing the work helps them finish the poster before the lesson ends.",
    explanation: "短文讲的是同学合作完成海报。",
    dialogue: "Student A: I can find some pictures. Student B: I will write three short facts. Yicheng: Then I can plan the layout. Student A: What should the title be? Student B: Let us hear everyone's idea first. Yicheng: Good plan. We can choose together.",
    challenge: "Different ideas can lead to a stronger result when people listen carefully.",
  },
  {
    theme: "After-school exercise",
    words: [
      ["practice", "/ˈpræktɪs/", "练习", "Basketball practice starts at five."],
      ["exercise", "/ˈeksərsaɪz/", "锻炼", "Regular exercise keeps us healthy."],
      ["balance", "/ˈbæləns/", "平衡", "Try to balance study and exercise."],
      ["improve", "/ɪmˈpruːv/", "提高", "Daily practice can improve your skills."],
      ["rest", "/rest/", "休息", "Take a short rest after the game."],
    ],
    storyTitle: "Ten more minutes",
    story: "After school, Yicheng goes to basketball practice. The team warms up and works on passing the ball. Yicheng wants to improve his left-hand dribble, so he practises for ten extra minutes. The coach tells him that regular practice is useful, but rest is important too. Yicheng drinks some water, stretches his legs, and walks home with a teammate.",
    explanation: "短文讲的是篮球训练和适当休息。",
    dialogue: "Coach: What do you want to improve today? Yicheng: My left-hand dribble. Coach: Practise slowly first. Yicheng: Can I stay for ten more minutes? Coach: Yes, but remember to rest and drink water. Yicheng: I will. Thank you, Coach.",
    challenge: "Real improvement comes from regular practice, not from rushing.",
  },
  {
    theme: "At the school library",
    words: [
      ["borrow", "/ˈbɒroʊ/", "借入", "I borrow a book from the library."],
      ["return", "/rɪˈtɜːrn/", "归还", "Please return the book next Friday."],
      ["quiet", "/ˈkwaɪət/", "安静的", "The reading room is quiet."],
      ["recommend", "/ˌrekəˈmend/", "推荐", "Can you recommend a science book?"],
      ["chapter", "/ˈtʃæptər/", "章节", "I read one chapter before bed."],
    ],
    storyTitle: "A book about space",
    story: "Yiran visits the school library after lunch. He wants a book about planets but does not know which one to choose. The librarian recommends a short book with clear pictures and six chapters. Yiran borrows it for one week. He writes the return date in his notebook and plans to read one chapter each evening.",
    explanation: "短文讲的是在图书馆借一本太空书。",
    dialogue: "Yiran: Could you recommend a book about space? Librarian: This one has clear pictures and short chapters. Yiran: How long can I keep it? Librarian: You can borrow it for one week. Yiran: Great. I will write down the return date. Librarian: Good idea.",
    challenge: "A clear reading plan can turn a big book into small, enjoyable steps.",
  },
  {
    theme: "Using time wisely",
    words: [
      ["schedule", "/ˈskedʒuːl/", "日程安排", "Check your schedule before school."],
      ["focus", "/ˈfoʊkəs/", "专注", "I focus better in a quiet room."],
      ["interrupt", "/ˌɪntəˈrʌpt/", "打断", "Messages can interrupt our work."],
      ["finish", "/ˈfɪnɪʃ/", "完成", "I finish my homework before dinner."],
      ["later", "/ˈleɪtər/", "稍后", "I can check the message later."],
    ],
    storyTitle: "Twenty quiet minutes",
    story: "Yicheng needs to finish a maths exercise before dinner. His phone receives several messages, and each sound interrupts him. He puts the phone on a shelf in another room and sets a timer for twenty minutes. Without the messages, he can focus more easily. He finishes the exercise early and checks his phone later.",
    explanation: "短文讲的是减少手机打扰、专心完成作业。",
    dialogue: "Dad: Do the messages interrupt you? Yicheng: Yes. I keep looking at my phone. Dad: Would a twenty-minute timer help? Yicheng: I think so. I will put the phone outside. Dad: Good. You can check it later. Yicheng: That already feels easier.",
    challenge: "Protecting our attention often saves more time than working faster.",
  },
  {
    theme: "Helping at home",
    words: [
      ["responsible", "/rɪˈspɒnsəbəl/", "负责任的", "A responsible person keeps a promise."],
      ["simple", "/ˈsɪmpəl/", "简单的", "Setting the table is a simple job."],
      ["clean", "/kliːn/", "打扫、干净的", "We clean the kitchen together."],
      ["carry", "/ˈkæri/", "携带", "I carry the plates carefully."],
      ["later", "/ˈleɪtər/", "稍后", "We can wash the dishes later."],
    ],
    storyTitle: "A small family job",
    story: "Mum is busy preparing dinner, so Yiran offers to set the table. He carries the plates carefully and puts a cup beside each plate. Yicheng brings the rice and cleans a small spill. The jobs are simple, but they save Mum time. After dinner, everyone shares the work again and the kitchen is soon clean.",
    explanation: "短文讲的是家人一起做简单家务。",
    dialogue: "Yiran: Can I help with dinner? Mum: Yes, please set the table. Yiran: How many plates do we need? Mum: Four plates and four cups. Yicheng: I can carry the rice. Mum: Thank you. Sharing the work makes everything easier.",
    challenge: "Being responsible often begins with one small job done carefully.",
  },
  {
    theme: "A greener journey",
    words: [
      ["journey", "/ˈdʒɜːrni/", "旅程", "The journey takes twenty minutes."],
      ["route", "/ruːt/", "路线", "This route goes through the park."],
      ["public", "/ˈpʌblɪk/", "公共的", "Public transport carries many people."],
      ["reduce", "/rɪˈduːs/", "减少", "Walking can reduce air pollution."],
      ["convenient", "/kənˈviːniənt/", "方便的", "The metro is fast and convenient."],
    ],
    storyTitle: "The trip to the museum",
    story: "The family plans to visit a museum on Saturday. Driving may take a long time because the streets are busy. Yiran checks the metro map and finds a convenient route with only one change. They decide to take public transport and walk through a park on the way back. The journey is easy, and nobody needs to look for a parking space.",
    explanation: "短文讲的是坐地铁去博物馆。",
    dialogue: "Mum: Shall we drive to the museum? Yiran: The streets may be busy. Dad: What about the metro? Yiran: I found a convenient route. We only need to change once. Mum: Great. We can walk through the park on the way home.",
    challenge: "A greener route can save time and make a journey more interesting.",
  },
  {
    theme: "Asking useful questions",
    words: [
      ["curious", "/ˈkjʊriəs/", "好奇的", "Curious students ask useful questions."],
      ["observe", "/əbˈzɜːrv/", "观察", "Observe the water carefully."],
      ["compare", "/kəmˈper/", "比较", "Compare the two results."],
      ["discover", "/dɪˈskʌvər/", "发现", "We discover new facts by testing ideas."],
      ["explain", "/ɪkˈspleɪn/", "解释", "Can you explain what happened?"],
    ],
    storyTitle: "The spoon in the glass",
    story: "At breakfast, Yiran notices that a spoon looks bent inside a glass of water. He asks why, and Yicheng says that light may change direction when it enters water. They try the same thing with a pencil and compare what they see. One small question becomes a simple experiment that they can explain to their science teacher.",
    explanation: "短文讲的是从日常观察开始一个小实验。",
    dialogue: "Yiran: Why does the spoon look bent? Yicheng: The water may change the direction of light. Yiran: Can we test that idea? Yicheng: Yes. Let us compare the spoon with a pencil. Yiran: Great. I will write down what we observe.",
    challenge: "Curiosity becomes learning when we observe, compare, and explain.",
  },
];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function absoluteDay(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function buildProgram(key, variant = 0) {
  const date = dateFromKey(key);
  const template = PROGRAM_LIBRARY[Math.abs(absoluteDay(date) + variant * 3) % PROGRAM_LIBRARY.length];
  const words = template.words.slice(0, 4).map(([word, phonetic, meaning, example]) => ({ word, phonetic, meaning, example }));
  const preparedAt = Date.now();
  return {
    id: `morning-${key}`,
    date: key,
    status: "ready",
    source: "cloud-library",
    variant,
    contentVersion: 4,
    theme: template.theme,
    words,
    storyTitle: template.storyTitle,
    story: template.story,
    explanation: template.explanation,
    dialogue: template.dialogue,
    challenge: template.challenge,
    estimatedMinutes: 12,
    preparedAt,
    updatedAt: preparedAt,
    audio: {
      status: "pending",
      voiceName: "WeWinny",
      playbackRate: 1,
      chapters: [],
    },
  };
}

function programTextChapters(program) {
  const wordPreview = program.words.map((item) => item.word).join(". ");
  const vocabulary = program.words.map((item, index) => ({
    id: `word-${index + 1}`,
    title: `核心单词 ${index + 1} · ${item.word}`,
    section: "words",
    wordIndex: index,
    language: "en",
    text: `Word number ${index + 1}. ${item.word}. Listen again: ${item.word}. Here is an everyday example. ${item.example} Notice the word ${item.word} in that sentence. ${item.example} One last time: ${item.word}.`,
  }));
  const review = program.words.map((item) => `${item.word}. ${item.example}`).join(" ");
  const chineseMeanings = program.words.map((item) => `${item.word}，${item.meaning}`).join("；");
  return [
    { id: "opening", title: "英文开场", section: "opening", language: "en", text: `Good morning, Yicheng and Yiran. Welcome to breakfast English. Today's theme is ${program.theme}. Our four words are ${wordPreview}. Listen, enjoy your breakfast, and do not worry about remembering everything at once.` },
    ...vocabulary,
    { id: "word-meaning", title: "四词中文提示", section: "explanation", language: "zh", text: `四个词的意思是：${chineseMeanings}。接下来听生活短文。` },
    { id: "story", title: "生活短文", section: "story", language: "en", text: `Now listen to a short story from everyday life. The title is ${program.storyTitle}. ${program.story} Think about this idea: ${program.challenge}` },
    { id: "explanation", title: "短文中文提示", section: "explanation", language: "zh", text: `${program.explanation} 不用逐字翻译，听懂人物、地点和发生的事情就可以。` },
    { id: "dialogue", title: "生活对话", section: "dialogue", language: "en", text: `Now listen to an everyday conversation. Pay attention to how the speakers ask and answer naturally. ${program.dialogue}` },
    { id: "review", title: "英文回顾", section: "review", language: "en", text: `Before we finish, hear today's words in useful sentences one more time. ${review} Today's final sentence is: ${program.challenge} That is all for breakfast English. Have a wonderful day at school.` },
  ];
}

function sessionId(program, chapter) {
  return crypto.createHash("sha1").update(`${program.date}:${program.variant}:v4:${chapter.id}`).digest("hex").slice(0, 24);
}

module.exports = { PROGRAM_LIBRARY, buildProgram, dateKey, dateFromKey, programTextChapters, sessionId };
