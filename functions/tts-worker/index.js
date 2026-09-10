"use strict";

const tencentcloud = require("tencentcloud-sdk-nodejs-tts");

const TtsClient = tencentcloud.tts.v20190823.Client;

function createClient() {
  const secretId = process.env.TENCENTCLOUD_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN;
  if (!secretId || !secretKey) throw new Error("语音函数运行身份不可用");
  return new TtsClient({
    credential: { secretId, secretKey, token },
    region: "ap-guangzhou",
    profile: { httpProfile: { endpoint: "tts.tencentcloudapi.com", reqTimeout: 30 } },
  });
}

exports.main = async (event = {}) => {
  const text = typeof event.text === "string" ? event.text.trim() : "";
  const language = event.language === "zh" ? "zh" : "en";
  if (!text || text.length > 500) return { ok: false, error: "语音文本长度不正确" };
  try {
    const response = await createClient().TextToVoice({
      Text: text,
      SessionId: String(event.sessionId || `family-${Date.now()}`).slice(0, 30),
      Volume: 2,
      Speed: 0,
      ProjectId: 0,
      ModelType: 1,
      // Use the basic/premium voices covered by Tencent Cloud's free package.
      // WeRose is the female English voice; ZhiYu handles the brief Chinese cues.
      VoiceType: language === "zh" ? 101001 : 101051,
      PrimaryLanguage: language === "zh" ? 1 : 2,
      SampleRate: 16000,
      Codec: "mp3",
      EnableSubtitle: true,
    });
    return { ok: true, data: { audio: response.Audio, subtitles: response.Subtitles || [] } };
  } catch (error) {
    console.error("tts-worker error", error);
    return { ok: false, error: error && error.message ? error.message : "语音合成失败", code: error && error.code ? error.code : "" };
  }
};
