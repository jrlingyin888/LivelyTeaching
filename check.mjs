/**
 * check.mjs —— 课件自检
 *
 * 这里放的是「不需要人看就能判定对错」的规则。
 * 每一条都来自一次真实的返工：
 *   - 面板上两个数同时显示但互相矛盾
 *   - 进度条语义在前几步是错的
 *   - 整条流程没有一个让学生先猜的地方
 *   - 结果被硬凑成必然成功
 * 人工发现一次，就该沉淀成这里的一条，之后再也不用靠眼睛盯。
 *
 * 用法：npm run check
 */
import { readFileSync } from 'node:fs';
import { SCENES } from './src/scenes/index.js';

const fails = [];
const warns = [];
const fail = (who, msg) => fails.push(`${who}: ${msg}`);
const warn = (who, msg) => warns.push(`${who}: ${msg}`);

/* ---------- 规则 1：首页卡片渲染需要的字段一个都不能少 ---------- */
const REQUIRED = ['id', 'name', 'icon', 'keywords', 'subject', 'topic', 'steps', 'build'];
for (const s of SCENES) {
  const who = s.id || s.name || '(无名场景)';
  for (const k of REQUIRED) {
    if (s[k] === undefined || s[k] === null) fail(who, `缺少必填字段 ${k}`);
  }
  if (Array.isArray(s.steps) && s.steps.length < 2) fail(who, '步骤少于 2 步');
  if (Array.isArray(s.keywords) && !s.keywords.length) fail(who, 'keywords 为空');
  if (typeof s.build !== 'function') fail(who, 'build 不是函数');
}

/* ---------- 规则 2：id 和关键词不能撞车（撞了会静默匹配错场景）---------- */
const seenId = new Set(), seenKw = new Map();
for (const s of SCENES) {
  if (seenId.has(s.id)) fail(s.id, 'id 重复');
  seenId.add(s.id);
  for (const k of s.keywords || []) {
    if (seenKw.has(k)) fail(s.id, `关键词「${k}」与 ${seenKw.get(k)} 冲突`);
    seenKw.set(k, s.id);
  }
}

/* ---------- 规则 3：数值面板声明了就必须有 key ---------- */
for (const s of SCENES) {
  for (const st of s.stats || []) {
    if (!st.key || !st.label) fail(s.id, `stats 条目缺 key 或 label：${JSON.stringify(st)}`);
  }
}

/* ---------- 规则 4：每节课至少要有一个「先猜再看」和一个结论 ---------- */
/* 这是教学法底线：没有预测点，学生就只是在看动画。 */
for (const s of SCENES) {
  const src = readFileSync(new URL(`./src/scenes/${s.id}.js`, import.meta.url), 'utf8');
  const asks = (src.match(/ui\.ask\(/g) || []).length;
  const result = (src.match(/ui\.showResult\(/g) || []).length;
  if (!result) fail(s.id, '没有 ui.showResult —— 这节课走不到结论');
  if (!asks) {
    // 曹冲称象是给老师演示用的高年级场景，暂时豁免，但要提醒
    (s.grade || '').includes('演示')
      ? warn(s.id, '没有预测点（ui.ask），学生全程只是在看')
      : fail(s.id, '没有预测点（ui.ask）—— 学生没有先猜的机会，等于看动画');
  }
}

/* ---------- 规则 5：学科不变量 ---------- */
/* 天平：物体质量必须是方块单位的整数倍，否则一年级会量出「五块多一点」 */
{
  const src = readFileSync(new URL('./src/scenes/balance-scale.js', import.meta.url), 'utf8');
  const unit = Number(src.match(/const UNIT = (\d+)/)?.[1]);
  const masses = [...src.matchAll(/name: '([^']+)',\s*g: (\d+)/g)].map(m => [m[1], Number(m[2])]);
  if (!unit) fail('balance-scale', '找不到 UNIT');
  if (masses.length < 2) fail('balance-scale', '找不到物体质量表');
  for (const [name, g] of masses) {
    if (g % unit !== 0) fail('balance-scale', `${name} ${g}g 不是 ${unit}g 的整数倍，量不出整块数`);
  }
}
/* 立体图形：会滚的转动惯量系数必须为正，方块必须标成不会滚 */
{
  const src = readFileSync(new URL('./src/scenes/solid-shapes.js', import.meta.url), 'utf8');
  const rows = [...src.matchAll(/name: '([^']+)',\s*icon: '[^']*',\s*color: 0x[0-9a-f]+, k: ([^,]+),/g)];
  if (rows.length !== 4) fail('solid-shapes', `形状表应有 4 项，实际 ${rows.length}`);
  for (const [, name, k] of rows) {
    const rollable = k.trim() !== 'null';
    if (rollable && !/^\d+\s*\/\s*\d+$/.test(k.trim()))
      fail('solid-shapes', `${name} 的转动惯量系数写法不对：${k}`);
  }
}

/* ---------- 输出 ---------- */
for (const w of warns) console.log(`⚠  ${w}`);
if (fails.length) {
  for (const f of fails) console.error(`✗  ${f}`);
  console.error(`\n${fails.length} 项不通过`);
  process.exit(1);
}
console.log(`✓ ${SCENES.length} 个场景全部通过（${warns.length} 条提醒）`);
