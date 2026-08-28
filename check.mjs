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
import { createFlowRunner } from './src/core/flow.js';
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

/* ---------- 规则 7：教学编排（flow）自洽 ----------
 *
 * 这一组是整套自检里最值钱的部分：一份编排是不是合格的教学设计，
 * 大半可以纯靠结构判定，不需要模型来看。AI 生成的编排先过这一关。
 */
for (const s of SCENES) {
  if (!s.flow) continue;
  const f = s.flow;
  const src = readFileSync(new URL(`./src/scenes/${s.id}.js`, import.meta.url), 'utf8');

  // 内核实际提供了哪些动作：从 `return {actions: {a, b, c}` 里读
  const am = src.match(/return\s*\{\s*actions:\s*\{([^}]*)\}/);
  const known = new Set((am ? am[1] : '').split(',').map(x => x.trim().split(':')[0]).filter(Boolean));

  const all = [...(f.steps || []), ...(f.deeper || [])];
  if (!all.length) {fail(s.id, 'flow 里一步都没有'); continue;}

  const defined = new Set();      // 已经被 as 定义的变量
  const asked = new Set();        // 孩子答过的问题变量
  const judged = new Set();       // 被揭晓用掉的变量
  let computedJudge = 0;          // 答案是算出来的（expect）而不是写死的（correct）

  for (const st of all) {
    if (!st.name) fail(s.id, 'flow 里有一步没有 name');
    if (!Array.isArray(st.do) || !st.do.length) fail(s.id, `「${st.name}」这一步是空的`);
    for (const ins of st.do || []) {
      if (ins.act !== undefined) {
        if (!known.has(ins.act)) fail(s.id, `编排调用了内核没有的动作：${ins.act}`);
        if (ins.as) defined.add(ins.as);
      }
      if (ins.ask !== undefined) {
        if (!Array.isArray(ins.options) || ins.options.length < 2)
          fail(s.id, `「${ins.ask}」的选项少于 2 个`);
        if (!ins.as) fail(s.id, `「${ins.ask}」没有用 as 记下孩子的答案`);
        else {defined.add(ins.as); asked.add(ins.as);}
      }
      if (ins.judge !== undefined) {
        const {expect, correct, against} = ins.judge;
        if (!against) fail(s.id, 'judge 缺少 against（拿什么和孩子的答案比）');
        else {
          if (!defined.has(against)) fail(s.id, `judge 用了还没定义的变量 ${against}`);
          judged.add(against);
        }
        if (expect === undefined && correct === undefined)
          fail(s.id, 'judge 既没有 expect 也没有 correct');
        if (expect !== undefined) {
          if (!defined.has(expect)) fail(s.id, `judge 的 expect 用了还没定义的变量 ${expect}`);
          computedJudge++;
        }
      }
    }
  }

  // 教学法底线一：必须有让孩子先猜的地方
  if (!asked.size) fail(s.id, '整条编排没有一个 ask —— 学生全程只是在看');

  // 教学法底线二：猜了就必须揭晓，不能问完不了了之
  for (const v of asked) {
    if (!judged.has(v)) fail(s.id, `问了「${v}」却没有揭晓（缺 judge）`);
  }

  // 教学法底线三：至少有一个答案是算出来的，不是写死的
  if (!computedJudge)
    warn(s.id, '所有揭晓的答案都是写死的（correct），没有一个是算出来的（expect）');

  // 结论卡：必须有，且引用的变量必须存在
  if (!f.result) fail(s.id, 'flow 没有 result —— 这节课走不到结论');
  const refs = JSON.stringify(f.result || {}).match(/\{\{(\w+)\}\}/g) || [];
  for (const r of refs) {
    const k = r.slice(2, -2);
    if (!defined.has(k)) fail(s.id, `结论卡引用了不存在的变量 {{${k}}}`);
  }

  // 深层必须是可选的：表层自己得能收尾
  if (f.deeper?.length && !f.result) fail(s.id, '有深层却没有表层结论卡');
}

/* ---------- 规则 8：无头跑一遍，确认走得到结论 ----------
 *
 * 结构合法不等于走得通。这一条真的把编排跑一遍（动作全部打桩、
 * 提问一律选第一项），看它会不会走进死胡同或者卡住。
 * 生成出来的编排最容易犯的就是这种错，而它纯靠读代码看不出来。
 */
for (const s of SCENES) {
  if (!s.flow) continue;
  const seen = {result: 0, steps: new Set(), asks: 0};
  const stubUI = {
    say: () => Promise.resolve(),
    ask: () => {seen.asks++; return Promise.resolve({index: 0});},
    judge: () => Promise.resolve(),
    tally: () => {}, setStep: n => seen.steps.add(n), addSteps: () => {},
    showResult: () => {seen.result++; return {};},
    hideResult: () => {},
  };
  // 动作全部打桩：这里只验流程走不走得通，不验物理
  const stubActions = new Proxy({}, {
    get: () => async () => '__stub__',
    has: () => true,
  });

  const done = await Promise.race([
    createFlowRunner({ui: stubUI, actions: stubActions, flow: s.flow, onDone(){}})
      .run().then(() => 'ok', e => 'throw:' + e.message),
    new Promise(r => setTimeout(() => r('timeout'), 8000)),
  ]);

  if (done === 'timeout') fail(s.id, '无头跑不完 —— 编排里有一步永远等不到结果');
  else if (done !== 'ok') fail(s.id, `无头跑的时候报错：${done.slice(6)}`);
  else {
    if (!seen.result) fail(s.id, '跑完了却没有走到结论卡');
    const want = s.flow.steps.length;
    if (seen.steps.size < want)
      fail(s.id, `只走到了 ${seen.steps.size} 步，编排里声明了 ${want} 步`);
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
