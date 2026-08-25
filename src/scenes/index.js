/**
 * 场景注册表 —— 新增学科场景只需在这里 import 并加进数组
 * 顺序就是首页卡片的顺序。
 */
import solidShapes from './solid-shapes.js';
import balanceScale from './balance-scale.js';
import caochong from './caochong-chengxiang.js';

export const SCENES = [solidShapes, balanceScale, caochong];

/**
 * 按关键词匹配场景。
 * 第一期首页是图卡片（孩子不会打字），这个函数暂时没有调用方，
 * 留着是因为场景模板规范要求每个场景声明 keywords，第二期恢复文字/语音入口时接回来。
 */
export function matchScene(text) {
  const q = String(text || '');
  return SCENES.find(s => s.keywords.some(k => q.includes(k))) || null;
}
