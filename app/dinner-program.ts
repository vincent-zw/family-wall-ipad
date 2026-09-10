export type DinnerNewsSource = {
  title: string;
  url: string;
  provider: string;
};

export type DinnerAudioChapter = {
  id: string;
  title: string;
  fileID?: string;
  audioUrl?: string;
  durationSeconds: number;
};

export type DinnerProgram = {
  id: string;
  date: string;
  status: "ready" | "fallback" | "error";
  interaction: { id: string; icon: string; prompt: string };
  newsTitle: string;
  newsSummary: string;
  newsScript: string;
  sources: DinnerNewsSource[];
  preparedAt: number;
  error?: string;
  audio: {
    status: "ready" | "pending" | "error";
    durationSeconds: number;
    chapters: DinnerAudioChapter[];
  };
};
