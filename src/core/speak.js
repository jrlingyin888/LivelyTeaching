/**
 * speak.js — 语音朗读
 *
 * 一年级孩子不识字，但听得懂。所有关键提示都必须念出来，
 * 否则这个产品对目标用户是不可独立使用的。
 *
 * 用 SpeechSynthesis 而不是 SpeechRecognition：
 * 朗读在 macOS / iOS / Windows / Android 上全覆盖，
 * 识别只有 Chrome / Edge 有，而且对儿童语音准确率很低。
 */

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

let voice = null;
let enabled = true;

/** 挑一个中文嗓音。voices 是异步加载的，可能要等一次 voiceschanged。 */
function pickVoice() {
  if (!synth) return;
  const all = synth.getVoices();
  if (!all.length) return;
  voice =
    all.find(v => /zh[-_]CN/i.test(v.lang) && /female|婷婷|Tingting|Meijia|Yaoyao/i.test(v.name)) ||
    all.find(v => /zh[-_]CN/i.test(v.lang)) ||
    all.find(v => /^zh/i.test(v.lang)) ||
    null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

/**
 * 念一句话。新的一句会打断上一句——孩子点得快时不能排队积压。
 * @returns {Promise<void>} 念完（或被打断）后 resolve
 */
export function say(text, {rate = 0.92, pitch = 1.08} = {}) {
  const clean = String(text || '').replace(/<[^>]+>/g, '').trim();
  if (!clean) return Promise.resolve();

  // 没有 TTS（或家长关掉了朗读）时，仍然要按字数留出阅读的停顿。
  // 否则整条教学流程会一路飞过去 —— 节奏不能挂在朗读能不能用上。
  if (!synth || !enabled) return new Promise(r => setTimeout(r, 600 + clean.length * 130));

  synth.cancel();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    u.rate = rate;      // 比默认慢一点，一年级跟得上
    u.pitch = pitch;    // 稍高，听起来更亲切
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    // 兜底：某些浏览器 onend 不触发，按字数估一个上限
    setTimeout(resolve, 900 + clean.length * 220);
  });
}

export const shutUp = () => synth?.cancel();

export const setEnabled = on => {
  enabled = !!on;
  if (!on) shutUp();
};

export const isEnabled = () => enabled;
export const isSupported = () => !!synth;
