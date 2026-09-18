export type EnglishWord = { word: string; phonetic: string; meaning: string };

export type EnglishLesson = {
  theme: string;
  words: EnglishWord[];
  sentence: string;
  translation: string;
};

export type ScienceCard = { icon: string; title: string; copy: string };

export type DailyContent = {
  id: string;
  date: string;
  english?: EnglishLesson;
  science?: ScienceCard;
  source: "library" | "family";
  updatedAt: number;
};

const LESSON_LIBRARY: EnglishLesson[] = [
  { theme: "早餐桌上的好心情", words: [{ word: "sunny", phonetic: "/ˈsʌni/", meaning: "晴朗的" }, { word: "share", phonetic: "/ʃer/", meaning: "分享" }, { word: "ready", phonetic: "/ˈredi/", meaning: "准备好的" }], sentence: "I am ready for a sunny day!", translation: "我准备好迎接晴朗的一天啦！" },
  { theme: "勇敢开始新一天", words: [{ word: "brave", phonetic: "/breɪv/", meaning: "勇敢的" }, { word: "begin", phonetic: "/bɪˈɡɪn/", meaning: "开始" }, { word: "smile", phonetic: "/smaɪl/", meaning: "微笑" }], sentence: "Begin the day with a brave smile.", translation: "用一个勇敢的微笑开始今天。" },
  { theme: "一起吃早餐", words: [{ word: "breakfast", phonetic: "/ˈbrekfəst/", meaning: "早餐" }, { word: "delicious", phonetic: "/dɪˈlɪʃəs/", meaning: "美味的" }, { word: "together", phonetic: "/təˈɡeðər/", meaning: "一起" }], sentence: "We have a delicious breakfast together.", translation: "我们一起吃美味的早餐。" },
  { theme: "观察今天的天气", words: [{ word: "cloud", phonetic: "/klaʊd/", meaning: "云" }, { word: "breeze", phonetic: "/briːz/", meaning: "微风" }, { word: "weather", phonetic: "/ˈweðər/", meaning: "天气" }], sentence: "A gentle breeze moves the clouds.", translation: "轻柔的微风推动着云朵。" },
  { theme: "开心去上学", words: [{ word: "learn", phonetic: "/lɜːrn/", meaning: "学习" }, { word: "friend", phonetic: "/frend/", meaning: "朋友" }, { word: "question", phonetic: "/ˈkwestʃən/", meaning: "问题" }], sentence: "I learn new things with my friends.", translation: "我和朋友们一起学习新事物。" },
  { theme: "温暖的家", words: [{ word: "family", phonetic: "/ˈfæməli/", meaning: "家庭" }, { word: "help", phonetic: "/help/", meaning: "帮助" }, { word: "kind", phonetic: "/kaɪnd/", meaning: "友善的" }], sentence: "We help each other in our family.", translation: "我们家人互相帮助。" },
  { theme: "发现大自然", words: [{ word: "forest", phonetic: "/ˈfɔːrɪst/", meaning: "森林" }, { word: "river", phonetic: "/ˈrɪvər/", meaning: "河流" }, { word: "protect", phonetic: "/prəˈtekt/", meaning: "保护" }], sentence: "Let us protect the forest and river.", translation: "让我们保护森林和河流。" },
  { theme: "运动让身体有力量", words: [{ word: "energy", phonetic: "/ˈenərdʒi/", meaning: "能量" }, { word: "balance", phonetic: "/ˈbæləns/", meaning: "平衡" }, { word: "practice", phonetic: "/ˈpræktɪs/", meaning: "练习" }], sentence: "Practice gives me energy and balance.", translation: "练习给我能量和平衡。" },
  { theme: "打开一本好书", words: [{ word: "story", phonetic: "/ˈstɔːri/", meaning: "故事" }, { word: "imagine", phonetic: "/ɪˈmædʒɪn/", meaning: "想象" }, { word: "chapter", phonetic: "/ˈtʃæptər/", meaning: "章节" }], sentence: "Every chapter opens a new world.", translation: "每个章节都会打开一个新世界。" },
  { theme: "保持好奇心", words: [{ word: "wonder", phonetic: "/ˈwʌndər/", meaning: "想知道" }, { word: "discover", phonetic: "/dɪˈskʌvər/", meaning: "发现" }, { word: "experiment", phonetic: "/ɪkˈsperɪmənt/", meaning: "实验" }], sentence: "I wonder, explore, and discover.", translation: "我好奇、探索，然后发现。" },
  { theme: "安排好时间", words: [{ word: "minute", phonetic: "/ˈmɪnɪt/", meaning: "分钟" }, { word: "plan", phonetic: "/plæn/", meaning: "计划" }, { word: "finish", phonetic: "/ˈfɪnɪʃ/", meaning: "完成" }], sentence: "A simple plan helps me finish on time.", translation: "简单的计划帮助我按时完成。" },
  { theme: "认识健康食物", words: [{ word: "healthy", phonetic: "/ˈhelθi/", meaning: "健康的" }, { word: "fresh", phonetic: "/freʃ/", meaning: "新鲜的" }, { word: "taste", phonetic: "/teɪst/", meaning: "品尝" }], sentence: "Fresh fruit is healthy and tasty.", translation: "新鲜水果健康又美味。" },
  { theme: "说出自己的感受", words: [{ word: "happy", phonetic: "/ˈhæpi/", meaning: "开心的" }, { word: "calm", phonetic: "/kɑːm/", meaning: "平静的" }, { word: "feeling", phonetic: "/ˈfiːlɪŋ/", meaning: "感受" }], sentence: "I can talk about my feelings.", translation: "我可以说出自己的感受。" },
  { theme: "一起合作完成", words: [{ word: "team", phonetic: "/tiːm/", meaning: "团队" }, { word: "listen", phonetic: "/ˈlɪsən/", meaning: "倾听" }, { word: "solve", phonetic: "/sɒlv/", meaning: "解决" }], sentence: "Our team listens and solves problems together.", translation: "我们的团队一起倾听并解决问题。" },
];

const SCIENCE_LIBRARY: ScienceCard[] = [
  { icon: "🌱", title: "植物也会“呼吸”吗？", copy: "会。植物白天和夜晚都进行呼吸作用，同时在有光时通过光合作用制造养分。" },
  { icon: "🌙", title: "月亮为什么会变形？", copy: "月亮没有真的变形。它绕地球运动时，被太阳照亮、又能被我们看到的部分不断变化。" },
  { icon: "🐬", title: "海豚睡觉时会溺水吗？", copy: "海豚会让左右大脑轮流休息，另一半保持清醒，帮助它浮出水面呼吸。" },
  { icon: "🌈", title: "彩虹为什么是弯的？", copy: "阳光进入小水滴后发生折射和反射。我们看到的是一个圆形光环的一部分，所以像一座弯桥。" },
  { icon: "🧊", title: "冰为什么会浮在水上？", copy: "水结冰时分子排列得更松，体积变大、密度变小，所以冰会浮在液态水上。" },
  { icon: "🦉", title: "猫头鹰为什么能悄悄飞？", copy: "猫头鹰翅膀边缘的细小结构能打散气流、减少噪声，帮助它安静地靠近猎物。" },
  { icon: "🫧", title: "肥皂泡为什么有彩色花纹？", copy: "泡泡膜不同位置厚度不同，光在薄膜内相互加强或抵消，于是出现不断变化的颜色。" },
  { icon: "🌍", title: "地球为什么不会掉下去？", copy: "太空中没有固定的“下方”。地球被太阳引力拉着，同时高速向前运动，因此一直绕太阳运行。" },
  { icon: "🐜", title: "蚂蚁怎样找到回家的路？", copy: "许多蚂蚁会留下带气味的信息素，同伴沿着气味路线寻找食物并返回巢穴。" },
  { icon: "⚡", title: "闪电为什么总比雷声先到？", copy: "光传播得比声音快得多，所以我们先看到闪电，过一会儿才听到雷声。" },
  { icon: "🪐", title: "土星的光环是什么做的？", copy: "土星光环由无数冰块、岩石和尘埃组成，它们大小不一，共同绕着土星运动。" },
  { icon: "🐦", title: "鸟为什么站在电线上不触电？", copy: "鸟的两只脚电势几乎相同，电流很少经过身体；如果同时接触另一条线路就可能很危险。" },
  { icon: "🍎", title: "切开的苹果为什么变褐色？", copy: "苹果果肉接触空气后，其中的物质在酶帮助下发生氧化，因此颜色逐渐变深。" },
  { icon: "🧲", title: "磁铁为什么有两个极？", copy: "磁铁内部许多微小磁性区域排列一致，形成南北两极；即使切开，每一块仍有两个极。" },
  { icon: "🦋", title: "蝴蝶翅膀上的粉是什么？", copy: "那些彩色粉末其实是微小的鳞片状结构，排列方式不同会反射不同颜色的光。" },
  { icon: "🐢", title: "乌龟为什么长寿？", copy: "乌龟新陈代谢很慢，心跳可以一分钟只跳 10 次左右，细胞衰老速度也比很多动物慢。" },
  { icon: "🌡️", title: "为什么体温计用水银？", copy: "水银遇热膨胀明显、体积变化均匀，而且不粘玻璃，测量起来精准又可靠。" },
  { icon: "🧊", title: "雪和冰有什么不同？", copy: "雪是很多细小的冰晶体组成的，里面夹着空气；冰是一整块固态的水，比较结实。" },
  { icon: "🐙", title: "章鱼有几颗心脏？", copy: "章鱼有 3 颗心脏：2 颗把血液送到鳃里，1 颗把血液送到身体其他部分。" },
  { icon: "🌸", title: "为什么有的树春天开花？", copy: "春天温度升高、日照变长，树木感受到季节变化后，储存的营养就用来开花结果。" },
  { icon: "🏔️", title: "山是怎么长高的？", copy: "有些山位于板块碰撞带，两个大陆板块挤压时地层被推上去，山就慢慢变高了。" },
  { icon: "🐳", title: "鲸鱼为什么能潜那么深？", copy: "鲸鱼的胸腔可以被水压压得很小，肺里的空气也会被挤入血液和肌肉，减少减压病风险。" },
  { icon: "🔋", title: "电池为什么会没电？", copy: "电池内部发生化学反应产生电流，反应物用完了，电池就没电了。" },
  { icon: "🐝", title: "蜜蜂跳舞是什么意思？", copy: "蜜蜂用「8」字舞告诉同伴：食物源在哪个方向、离蜂巢多远。" },
  { icon: "🌫️", title: "雾和云有什么区别？", copy: "雾是靠近地面的云，都是无数小水滴悬浮在空气中。云飘在天上，雾贴在地面。" },
  { icon: "🦴", title: "为什么关节会发出响声？", copy: "关节里有滑液帮助润滑，活动时气泡被挤破就会发出「咔哒」声，通常不代表有问题。" },
  { icon: "🌱", title: "种子怎么知道往哪长？", copy: "种子根部会朝着重力方向长（向下），芽则朝着光线方向长（向上），这叫向地性和向光性。" },
  { icon: "🐉", title: "蚂蚁为什么不怕摔？", copy: "蚂蚁很轻，空气阻力能有效减缓下落速度，而且它的身体结构不容易摔断。" },
  { icon: "🌊", title: "海浪是怎么来的？", copy: "大部分海浪是风吹出来的，远海的风暴也能把海浪传到很远的岸边。" },
  { icon: "🍞", title: "面包为什么会发酵变大？", copy: "酵母在面团里产生二氧化碳气泡，烤的时候气泡膨胀，面包就松软变大了。" },
  { icon: "🦗", title: "蟋蟀为什么在晚上叫？", copy: "蟋蟀摩擦翅膀发出声音，主要是为了吸引异性、宣告领地。晚上更安静，声音传得远。" },
  { icon: "🗻", title: "火山为什么会喷发？", copy: "地下的岩浆被压力推上来，遇到薄弱的地壳就喷出地面。" },
  { icon: "🧠", title: "大脑为什么只睡一半会累？", copy: "大脑在睡眠时会清除代谢废物、整理记忆，长期不睡这些过程无法完成，所以会累。" },
  { icon: "🐸", title: "青蛙为什么能变颜色？", copy: "青蛙的皮肤里有多种色素细胞，环境变化时不同细胞收缩或扩张，颜色就改变了。" },
  { icon: "⚓", title: "船为什么不会沉？", copy: "船排开的水所受的重力等于船的重力时，水的浮力就把船托起来了。" },
  { icon: "🐌", title: "蜗牛的粘液有什么用？", copy: "蜗牛分泌的粘液帮助它在各种表面上滑行，还能防止身体脱水。" },
  { icon: "🌞", title: "太阳光到地球要多久？", copy: "光速每秒约 30 万公里，太阳到地球平均约 1.5 亿公里，所以阳光大约 8 分钟到达。" },
  { icon: "🦅", title: "鹰的眼睛为什么这么好？", copy: "鹰的视网膜上有很多光感受器，而且视网膜中央还有一个特殊的凹陷，让它能看清很远的物体。" },
  { icon: "🧪", title: "pH 值是什么？", copy: "pH 值用来表示液体的酸碱性，0 到 14 之间，7 是中性，越低越酸、越高越碱。" },
  { icon: "🐣", title: "鸡蛋为什么能孵出小鸡？", copy: "受精后的鸡蛋里有小鸡的胚胎，温度合适时胚胎慢慢发育，21 天左右就能破壳。" },
  { icon: "🌋", title: "岩石是怎么来的？", copy: "岩石分三大类：岩浆冷却变成火成岩；沉积堆积变成沉积岩；再经高温高压变成变质岩。" },
  { icon: "🪱", title: "蚯蚓为什么对泥土好？", copy: "蚯蚓在土里钻来钻去，帮助空气和水进入土壤，粪便里还含有植物喜欢的营养。" },
  { icon: "🎈", title: "为什么有的气球会飘起来？", copy: "充入氦气或氢气的气球，平均密度比空气小，所以空气的浮力就把它托起来了。" },
  { icon: "🌵", title: "沙漠里的仙人掌为什么耐旱？", copy: "仙人掌的叶子退化成了刺，减少水分蒸发；它的茎可以储存大量的水。" },
  { icon: "🦔", title: "刺猬为什么卷成一团？", copy: "遇到危险时刺猬把身子蜷成球，刺朝外、肚子朝内，让敌人无从下口。" },
  { icon: "🧬", title: "DNA 是什么？", copy: "DNA 是存储遗传信息的分子，长得像螺旋梯子，决定了我们身体的很多特征。" },
  { icon: "🐘", title: "大象的鼻子能做什么？", copy: "大象的鼻子有四万多块肌肉，可以喝水、拿食物、发出声音、甚至安慰同伴。" },
  { icon: "🌍", title: "地球内部是什么样的？", copy: "从外到内依次是地壳、地幔、外核（液态金属）、内核（固态金属）。" },
  { icon: "🕷️", title: "蜘蛛网为什么不会被风吹破？", copy: "蜘蛛丝非常细但韧性很强，而且网的结构能分散风力，不容易整体破坏。" },
  { icon: "🌾", title: "植物是怎么喝水的？", copy: "根部把水吸上来，茎里的细小管道把水运到每一片叶子，叶子再把多余的水汽蒸发出去。" },
  { icon: "🍯", title: "蜂蜜为什么不会变质？", copy: "蜂蜜水分极少、糖分很高，微生物难以生存；加上它呈弱酸性，能抑制细菌繁殖。" },
  { icon: "🦒", title: "长颈鹿的脖子为什么那么长？", copy: "长颈鹿的祖先脖子长短不一，长脖子能吃到更高处的树叶，所以就一代代变长了。" },
  { icon: "💨", title: "风是怎么形成的？", copy: "太阳照在地球上，不同地方升温不同，空气温度差就造成了空气流动，这就是风。" },
  { icon: "🦢", title: "天鹅为什么终生配对？", copy: "天鹅繁殖时需要共同照顾幼鸟，长期配对能提高幼鸟的成活率。" },
  { icon: "🕳️", title: "黑洞真的是黑色的吗？", copy: "黑洞引力太强，连光都逃不出来，所以我们看不到它本体，只能通过周围物质判断它的存在。" },
  { icon: "🐸", title: "为什么下雨后青蛙特别多？", copy: "青蛙繁殖需要水，雨水填满池塘后，它们就跳出来产卵了。" },
  { icon: "🧲", title: "指南针为什么指北？", copy: "地球本身就是一个大磁铁，指南针的磁针会被地球磁场吸引，指向地球的北极附近。" },
  { icon: "🐧", title: "企鹅为什么不会飞？", copy: "企鹅进化成了游泳能手，翅膀变成了「鳍状肢」，用于在水里快速前进。" },
  { icon: "🌈", title: "彩虹有几种颜色？", copy: "通常说七种，但其实是连续的光谱，不同波长的光逐渐变化，没有明确的分界线。" },
  { icon: "🐺", title: "为什么有些动物夜里发光？", copy: "一些深海动物、萤火虫等能通过生物化学反应在体内产生光，帮助捕食或求偶。" },
  { icon: "🪨", title: "化石是怎么形成的？", copy: "动植物遗体被泥沙掩埋后，软组织慢慢分解，矿物质慢慢替换硬组织，就形成了化石。" },
  { icon: "🌰", title: "为什么猫总是落在脚上？", copy: "猫的平衡感和反射神经特别发达，下落时能迅速调整姿势，而且身体柔软、有缓冲。" },
  { icon: "🧊", title: "冬天为什么能呼出白气？", copy: "呼出来的空气里含有水蒸气，遇到外面的冷空气迅速凝成小水滴，就变成了白气。" },
  { icon: "🐻", title: "熊为什么要冬眠？", copy: "冬天食物少、温度低，熊进入冬眠状态，心跳和呼吸放慢，靠储存的脂肪过冬。" },
  { icon: "🧱", title: "闪电为什么总是劈高的地方？", copy: "闪电会选择电阻最小的路径，突出的物体离云层近，容易形成放电通道。" },
  { icon: "🐝", title: "为什么蜜蜂酿蜜？", copy: "蜜蜂酿的蜜主要是自己的食物。一只蜜蜂一生能生产约十二分之一茶匙的蜜。" },
  { icon: "🌍", title: "地球会转得越来越慢吗？", copy: "是的。月球的引力会略微拖慢地球自转，每过一个世纪一天就会变长约 2 毫秒。" },
  { icon: "🦎", title: "壁虎为什么能爬墙？", copy: "壁虎脚趾上有无数细小的绒毛，能和墙面分子产生微弱的吸引力，加起来就很强了。" },
  { icon: "🥚", title: "为什么鸭蛋腌了会变咸？", copy: "盐水透过蛋壳和蛋膜慢慢渗透进鸭蛋里，盐分留在蛋黄和蛋白里，就变咸了。" },
  { icon: "🐿️", title: "松鼠怎么找回藏起来的坚果？", copy: "松鼠靠记忆和嗅觉找坚果。有些忘了吃的坚果会发芽，帮着植树造林。" },
  { icon: "💡", title: "爱迪生的灯泡为什么出名？", copy: "不是他第一个发明灯泡，但他第一个找到了实用的灯丝材料，让灯泡真正走进千家万户。" },
  { icon: "🦩", title: "火烈鸟为什么单脚站？", copy: "科学家发现单脚站能帮助火烈鸟保持体温，尤其是在冷水里的时候。" },
  { icon: "🧭", title: "北极是冰还是陆地？", copy: "北极中心是北冰洋的海冰，下面是海水；南极才是大陆，覆盖着厚厚的冰盖。" },
  { icon: "🐢", title: "蛇为什么要吐信子？", copy: "蛇的舌头能收集空气中的化学分子，帮助它闻气味，判断猎物和天敌的位置。" },
];

export function contentDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function libraryIndex(date: Date) {
  return Math.abs(Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)) % LESSON_LIBRARY.length;
}

// 科普独立索引：按科普库自身长度取模。之前和英语共用 14 的模，
// 导致 75 条科普库只有前 14 条能被轮到、两周就重复
function scienceIndex(date: Date) {
  return Math.abs(Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)) % SCIENCE_LIBRARY.length;
}

export const SCIENCE_LIBRARY_VERSION = 2;

export function ensureContentHorizon(existing: DailyContent[], start = new Date(), days = 14) {
  const byDate = new Map(existing.map((item) => [item.date, item]));
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const key = contentDayKey(date);
    const index = libraryIndex(date);
    const current = byDate.get(key);
    // science 每次强制从最新库取（用户自己写的会被覆盖，但默认场景下没人手动改科普）——
    // 这样扩库后立刻生效，不会被旧云端 contentQueue 的缓存挡住
    byDate.set(key, {
      id: current?.id ?? `library-${key}`,
      date: key,
      english: current?.english ?? LESSON_LIBRARY[index],
      science: SCIENCE_LIBRARY[scienceIndex(date)],
      source: current?.source ?? "library",
      updatedAt: Date.now(),
    });
  }
  const cutoff = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 60);
  const cutoffKey = contentDayKey(cutoff);
  return Array.from(byDate.values()).filter((item) => item.date >= cutoffKey).sort((a, b) => a.date.localeCompare(b.date));
}
