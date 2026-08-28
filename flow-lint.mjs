/**
 * flow-lint.mjs —— 教学编排的校验规则
 *
 * 单独抽出来是为了一件事：**生成出来的编排和手写的走完全同一套尺子**。
 * check.mjs 用它，gen.mjs --verify 也用它，不会有双标。
 *
 * 分两层：
 *   静态  —— 纯读结构，秒级，拦掉大部分（引用了不存在的动作、问了不揭晓……）
 *   动态  —— 真跑一遍（动作打桩、提问选第一项），拦死胡同和卡死
 * 这两层加起来，就是「教学逻辑问题里机器可判的那一半」。
 */
import { createFlowRunner } from './src/core/flow.js';

/** 从场景源码里读出内核实际提供了哪些动作 */
export function actionsOf(src) {
  const m = src.match(/return\s*\{\s*actions:\s*\{([^}]*)\}/);
  return new Set((m ? m[1] : '').split(',').map(x => x.trim().split(':')[0]).filter(Boolean));
}

/** 取函数体（按花括号配平找） */
function bodyOf(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && !--depth) break;
  }
  return src.slice(open + 1, i);
}

/* ---------- 内核契约：签名里声明的参数必须真的用上 ---------- */
/*
 * 动作的签名就是生成方读到的契约。声明了 lat 却在函数体里没往下传，
 * 生成出来的编排会理直气壮地用它，然后教出错的东西 ——
 * 而结构检查和无头跑都发现不了，因为它们把动作全打桩了。
 * 这条规则来自一次真实的返工：compareSun({a,b,lat}) 的 lat 是白声明的。
 */
export function lintKernel(src) {
  const out = [];
  for (const name of actionsOf(src)) {
    const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(([^)]*)\\)`).exec(src);
    if (!m) continue;
    // 只取解构出来的**本地变量名**：
    //   {a = 6, lat = LAT} = {}  →  a, lat（LAT 是默认值，不是参数）
    //   {items: keys}            →  keys（函数体里用的是 keys）
    const inner = m[1].match(/\{([^}]*)\}/);
    const params = (inner ? inner[1] : m[1])
      .split(',')
      .map(x => x.split('=')[0])
      .map(x => (x.includes(':') ? x.slice(x.indexOf(':') + 1) : x).trim())
      .filter(x => /^[A-Za-z_$][\w$]*$/.test(x));
    const body = bodyOf(src, m.index + m[0].length);
    for (const p of new Set(params)) {
      if (!new RegExp(`\\b${p}\\b`).test(body))
        out.push({level: 'fail', msg: `动作 ${name} 声明了参数 ${p}，函数体里却没用 —— 生成方会照着签名用它，然后教错`});
    }
  }
  return out;
}

/* ---------- 静态：结构自洽 ---------- */
export function lintStatic(flow, known) {
  const out = [];
  const fail = m => out.push({level: 'fail', msg: m});
  const warn = m => out.push({level: 'warn', msg: m});

  const all = [...(flow?.steps || []), ...(flow?.deeper || [])];
  if (!all.length) {fail('flow 里一步都没有'); return out;}

  const defined = new Set(), asked = new Set(), judged = new Set();
  let computed = 0;

  for (const st of all) {
    if (!st.name) fail('flow 里有一步没有 name');
    if (!Array.isArray(st.do) || !st.do.length) {fail(`「${st.name}」这一步是空的`); continue;}

    for (const ins of st.do) {
      if (ins.act !== undefined) {
        if (!known.has(ins.act)) fail(`编排调用了内核没有的动作：${ins.act}`);
        if (ins.as) defined.add(ins.as);
      }
      if (ins.ask !== undefined) {
        if (!Array.isArray(ins.options) || ins.options.length < 2)
          fail(`「${ins.ask}」的选项少于 2 个`);
        if (!ins.as) fail(`「${ins.ask}」没有用 as 记下孩子的答案`);
        else {defined.add(ins.as); asked.add(ins.as);}
      }
      if (ins.judge !== undefined) {
        const {expect, correct, against} = ins.judge;
        if (!against) fail('judge 缺少 against（拿什么和孩子的答案比）');
        else {
          if (!defined.has(against)) fail(`judge 用了还没定义的变量 ${against}`);
          judged.add(against);
        }
        if (expect === undefined && correct === undefined)
          fail('judge 既没有 expect 也没有 correct');
        if (expect !== undefined) {
          if (!defined.has(expect)) fail(`judge 的 expect 用了还没定义的变量 ${expect}`);
          computed++;
        }
      }
    }
  }

  // 教学法底线
  if (!asked.size) fail('整条编排没有一个 ask —— 学生全程只是在看');
  for (const v of asked) if (!judged.has(v)) fail(`问了「${v}」却没有揭晓（缺 judge）`);
  if (!computed) warn('所有揭晓的答案都是写死的（correct），没有一个是算出来的（expect）');

  if (!flow.result) fail('flow 没有 result —— 这节课走不到结论');
  for (const r of JSON.stringify(flow.result || {}).match(/\{\{(\w+)\}\}/g) || []) {
    const k = r.slice(2, -2);
    if (!defined.has(k)) fail(`结论卡引用了不存在的变量 {{${k}}}`);
  }
  for (const r of JSON.stringify(flow.deeperResult || {}).match(/\{\{(\w+)\}\}/g) || []) {
    const k = r.slice(2, -2);
    if (!defined.has(k)) fail(`深层结论卡引用了不存在的变量 {{${k}}}`);
  }
  if (flow.deeper?.length && !flow.result) fail('有深层却没有表层结论卡');

  return out;
}

/* ---------- 动态：无头跑一遍 ---------- */
export async function lintRun(flow, {ms = 8000} = {}) {
  const out = [];
  const seen = {result: 0, steps: new Set()};
  const ui = {
    say: () => Promise.resolve(),
    ask: () => Promise.resolve({index: 0}),
    judge: () => Promise.resolve(),
    tally: () => {}, setStep: n => seen.steps.add(n), addSteps: () => {},
    showResult: () => {seen.result++; return {};},
    hideResult: () => {},
  };
  // 动作全部打桩：这里只验流程走不走得通，不验物理
  const actions = new Proxy({}, {get: () => async () => '__stub__', has: () => true});

  const r = await Promise.race([
    createFlowRunner({ui, actions, flow, onDone(){}}).run().then(() => 'ok', e => 'throw:' + e.message),
    new Promise(res => setTimeout(() => res('timeout'), ms)),
  ]);

  if (r === 'timeout') out.push({level: 'fail', msg: '无头跑不完 —— 编排里有一步永远等不到结果'});
  else if (r !== 'ok') out.push({level: 'fail', msg: `无头跑的时候报错：${r.slice(6)}`});
  else {
    if (!seen.result) out.push({level: 'fail', msg: '跑完了却没有走到结论卡'});
    const want = flow.steps.length;
    if (seen.steps.size < want)
      out.push({level: 'fail', msg: `只走到了 ${seen.steps.size} 步，编排里声明了 ${want} 步`});
  }
  return out;
}

export async function lintFlow(flow, src) {
  const known = actionsOf(src);
  const s = lintStatic(flow, known);
  // 结构就不合法的话，跑起来只会报一堆连锁错误，没意义
  if (s.some(x => x.level === 'fail')) return s;
  return [...s, ...await lintRun(flow)];
}
