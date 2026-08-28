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
import { lintFlow, lintKernel } from './flow-lint.mjs';
import { PHYS } from './src/scenes/seasons.js';

const fails = [];
const warns = [];
const fail = (who, msg) => fails.push(`${who}: ${msg}`);
const warn = (who, msg) => warns.push(`${who}: ${msg}`);

/* ---------- 规则 1：首页卡片渲染需要的字段一个都不能少 ---------- */
const REQUIRED = ['id', 'name', 'icon', 'keywords', 'subject', 'topic', 'build'];
const stepsOf = s => s.flow ? s.flow.steps.map(x => x.name) : (s.steps || []);
for (const s of SCENES) {
  const who = s.id || s.name || '(无名场景)';
  for (const k of REQUIRED) {
    if (s[k] === undefined || s[k] === null) fail(who, `缺少必填字段 ${k}`);
  }
  if (!s.flow && !s.steps) fail(who, '既没有 flow 也没有 steps');
  if (stepsOf(s).length < 2) fail(who, '步骤少于 2 步');
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
  if (s.flow) continue;                       // flow 场景由下面的规则 7 统一验
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

/* ---------- 规则 5：声明了几步，就得有几步真的走到 ---------- */
/*
 * 「排一排」这个 bug 就是这么来的：步骤条上有这一步，
 * 但流程里没有对应的 setStep，或者进去了什么也不做。
 * 前一半机器能判，后一半判不了 —— 但前一半已经能拦住最常见的那种。
 */
for (const s of SCENES) {
  if (s.flow) continue;                       // flow 场景的步骤条是派生的，不可能不同步
  const src = readFileSync(new URL(`./src/scenes/${s.id}.js`, import.meta.url), 'utf8');
  const hit = new Set([...src.matchAll(/ui\.setStep\((\d+)\)/g)].map(m => Number(m[1])));
  for (let i = 0; i < (s.steps?.length || 0); i++) {
    if (!hit.has(i)) fail(s.id, `第 ${i + 1} 步「${s.steps[i]}」在步骤条上有，但流程里没有 setStep(${i})`);
  }
  for (const i of hit) {
    if (i >= (s.steps?.length || 0)) fail(s.id, `setStep(${i}) 超出了 steps 声明的范围`);
  }
}

/* ---------- 规则 7 + 8：教学编排（flow）----------
 * 规则本体在 flow-lint.mjs —— 生成出来的编排走的是同一套尺子，不能有双标。
 */
for (const s of SCENES) {
  if (!s.flow) continue;
  const src = readFileSync(new URL(`./src/scenes/${s.id}.js`, import.meta.url), 'utf8');
  for (const {level, msg} of [...lintKernel(src), ...await lintFlow(s.flow, src)]) {
    (level === 'fail' ? fail : warn)(s.id, msg);
  }
}

/* ---------- 规则 6：学科不变量 ---------- */

/* 四季：这一课全部的内容就是这几个公式，错了就是在教错东西 */
{
  const P = PHYS, near = (a, b, eps) => Math.abs(a - b) < eps;
  const S = 6, W = 12;                                  // 北半球夏 / 冬

  // 夏至昼长 + 冬至昼长 必须正好是 24 小时（同一纬度上互补）
  const sum = P.dayLen(S) + P.dayLen(W);
  if (!near(sum, 24, 0.02)) fail('seasons', `夏冬昼长之和 ${sum.toFixed(2)}h，应为 24h`);

  // 春分秋分赤纬接近 0
  for (const m of [3, 9]) {
    if (Math.abs(P.decl(P.dayOf(m))) > 3)
      fail('seasons', `${m} 月赤纬 ${P.decl(P.dayOf(m)).toFixed(1)}°，春秋分附近应接近 0`);
  }

  // 太阳高度角必须落在 0–90°
  for (let m = 1; m <= 12; m++) {
    const h = P.noonH(m);
    if (h <= 0 || h > 90) fail('seasons', `${m} 月正午太阳高度 ${h.toFixed(1)}°，超出 0–90°`);
  }

  // 这一课的引爆点：北半球夏天，地球反而离太阳更远。反了就整课白讲
  if (!(P.distOf(S) > P.distOf(W)))
    fail('seasons', '算出来夏天离太阳更近 —— 这一课的核心事实反了');

  // 角度的影响必须远大于距离，否则「不是远近，是角度」这个结论就不成立。
  // 比的是两个效应各自偏离 1 的幅度：角度 +113%，距离 −6.5%，差着一个数量级。
  const byAngle = P.fluxOf(S) / P.fluxOf(W);
  const byDist = (P.distOf(S) / P.distOf(W)) ** 2;
  if (byAngle < 1.5) fail('seasons', `角度带来的差只有 ${byAngle.toFixed(2)} 倍，撑不起结论`);
  const eAngle = Math.abs(byAngle - 1), eDist = Math.abs(byDist - 1);
  if (eAngle < eDist * 5)
    fail('seasons', `角度的影响（${(eAngle * 100).toFixed(0)}%）没有明显压过距离（${(eDist * 100).toFixed(0)}%），结论站不住`);
}

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
/* 立体图形：转动惯量系数写法必须合法，方块必须标成不会滚 */
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
