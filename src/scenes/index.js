/**
 * 场景注册表 —— 新增学科场景只需在这里 import 并加进数组
 */
import caochong from './caochong-chengxiang.js';

export const SCENES = [caochong];

/** 按关键词匹配场景（V0.1 用关键词，后续替换为 LLM 意图解析） */
export function matchScene(text) {
  const q = String(text || '');
  return SCENES.find(s => s.keywords.some(k => q.includes(k))) || null;
}
