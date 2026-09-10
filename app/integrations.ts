export type IntegrationCapability =
  | "weather"
  | "calendar"
  | "audio"
  | "smart-home"
  | "cloud-sync"
  | "ai-content";

export interface DashboardIntegration {
  id: IntegrationCapability;
  name: string;
  description: string;
  status: "ready" | "reserved";
}

export interface AudioProvider {
  id: string;
  speak(text: string, language?: string): Promise<void>;
  stop(): void;
}

export interface WeatherProvider {
  getCurrentWeather(location: string): Promise<{
    temperature: number;
    summary: string;
  }>;
}

export interface FamilySyncProvider<T> {
  load(): Promise<T>;
  save(state: T): Promise<void>;
}

export interface RemoteContentProvider<T> {
  getDailyContent(date: string): Promise<T>;
  publish(content: T): Promise<void>;
}

export const FUTURE_INTEGRATIONS: DashboardIntegration[] = [
  { id: "audio", name: "百度音箱", description: "播放早餐英语、家庭提醒和晚安广播", status: "reserved" },
  { id: "weather", name: "实时天气", description: "按家庭位置更新天气和穿衣提示", status: "reserved" },
  { id: "calendar", name: "家庭日历", description: "同步手机日历、课程和生日", status: "reserved" },
  { id: "smart-home", name: "智能家居", description: "连接 Home Assistant、灯光和空调", status: "reserved" },
  { id: "cloud-sync", name: "手机同步", description: "在手机添加留言，自动出现在 iPad", status: "reserved" },
  { id: "ai-content", name: "AI 内容", description: "每天自动生成英语、数学与知识卡", status: "reserved" },
];
