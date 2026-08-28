/**
 * flow.js — 教学编排解释器
 *
 * 一个场景切成两半：
 *   内核（手写 JS）—— 建模、物理、交互循环，对外暴露一组具名动作
 *   编排（声明式 flow）—— 分几步、什么时候提问、什么时候揭晓、结论怎么给
 *
 * 分开的理由：建模和物理必须手写（正方体必须是正的，高度角才算得对），
 * 但编排是重复的、有明确评价标准的，可以生成也可以机器校验。
 *
 * 词汇只有 7 个，而且没有表达式语言 —— judge 只比对两个变量。
 * 生成方写不出可执行的坏代码，check 也好验。
 *
 *   { say:   '文字', hold?: ms }                       朗读 + 大字提示
 *   { ask:   '问题', options: [...], as: '变量' }        猜一猜，记下孩子的答案
 *   { act:   '动作名', args?: {}, as?: '变量' }          调内核动作，可记下返回值
 *   { judge: { expect|correct, against }, hint?: '' }   揭晓：算出来的答案 vs 孩子的答案
 *   { tally: [{label, count, icon}] }                  图形化计数
 *   { wait:  ms }                                      停一下
 *   { result: {...} }                                  结论卡
 *
 * expect 指向一个变量（答案是算出来的），correct 是写死的字面值。
 * 优先用 expect —— 写死的答案说明这一步没在真算。
 */
import { wait } from './stage.js';

const valueOf = opt => (typeof opt === 'string' ? opt : (opt.value ?? opt.label));

export function createFlowRunner({ui, actions, flow, onDone}) {
  const vars = {};
  let stopped = false;

  const stop = () => {stopped = true;};

  /** 文字里的 {{变量}} 换成运行时的值 —— 结论卡要引用量出来的数 */
  const fill = v => typeof v === 'string'
    ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
    : v;

  /** args 里 "$变量名" 整个替换成运行时的值（可以是数组/对象） */
  function resolve(args) {
    if (!args) return {};
    const out = {};
    for (const [k, v] of Object.entries(args)) {
      out[k] = (typeof v === 'string' && v[0] === '$') ? vars[v.slice(1)] : v;
    }
    return out;
  }

  /** 结论卡里的每个文字字段都过一遍插值 */
  const fillDeep = o => Object.fromEntries(
    Object.entries(o || {}).map(([k, v]) => [k, fill(v)]));

  /**
   * 看门狗：一条指令超过 15 秒还没完，就报出是哪一条。
   * 生成出来的编排如果调了一个永不返回的动作，否则只会静静地卡死，
   * 屏幕上什么都不动，没人知道卡在哪。
   *
   * 例外：ask，以及内核标了 patient 的动作 —— 有的在等孩子操作（可以等几分钟），
   * 有的是一段长动画（地球绕一圈要 20 秒）。这两种本来就慢，不算卡住。
   */
  async function one(ins) {
    const label = ins.act || ins.ask || ins.say || Object.keys(ins)[0];
    const patient = ins.ask !== undefined || actions[ins.act]?.patient;
    const wd = patient ? 0 : setTimeout(
      () => console.warn('[flow] 这条指令卡住超过 15 秒：', label, ins), 15000);
    try {
      return await oneInner(ins);
    } finally {
      clearTimeout(wd);
    }
  }

  async function oneInner(ins) {
    if (ins.say !== undefined) {
      const p = ui.say(fill(ins.say), {hold: ins.hold});
      // await:false 让旁白和后面的动作同时进行，避免孩子干等
      if (ins.await !== false) await p;
      return;
    }

    if (ins.ask !== undefined) {
      const a = await ui.ask(fill(ins.ask), ins.options);
      if (ins.as) vars[ins.as] = valueOf(ins.options[a.index]);
      return;
    }

    if (ins.act !== undefined) {
      const fn = actions[ins.act];
      if (typeof fn !== 'function') throw new Error(`编排里调用了不存在的动作：${ins.act}`);
      const r = await fn(resolve(ins.args));
      if (ins.as) vars[ins.as] = r;
      return;
    }

    if (ins.judge !== undefined) {
      const {expect, correct, against} = ins.judge;
      const want = correct !== undefined ? correct : vars[expect];
      const ok = want === vars[against];
      await ui.judge(ok, fill(ins.hint));
      return;
    }

    if (ins.tally !== undefined) {ui.tally(ins.tally); return;}
    if (ins.wait !== undefined) {await wait(ins.wait); return;}

    throw new Error('编排里有一条看不懂的指令：' + JSON.stringify(ins));
  }

  async function runList(list) {
    for (const ins of list || []) {
      if (stopped) return;
      await one(ins);
    }
  }

  async function runSteps(steps, offset = 0) {
    for (let i = 0; i < steps.length; i++) {
      if (stopped) return;
      ui.setStep(offset + i);
      await runList(steps[i].do);
    }
  }

  /** 跑完表层 → 结论卡；有深层就在卡上挂一个「为什么」按钮 */
  async function run() {
    deeperRun = false;
    await runSteps(flow.steps);
    if (stopped) return;
    showResult(flow.result, !!flow.deeper?.length);
  }

  let deeperRun = false;      // 深层只能进一次：连点会把它跑成好几份

  function showResult(spec, withDeeper) {
    const again = ui.showResult({
      ...fillDeep(spec),
      more: withDeeper && !deeperRun ? {
        label: flow.deeperLabel || '为什么会这样？',
        run: async () => {
          if (deeperRun) return;
          deeperRun = true;
          ui.hideResult();
          ui.addSteps(flow.deeper.map(x => x.name));   // 深层的点这时才长出来
          await runSteps(flow.deeper, flow.steps.length);
          if (!stopped) showResult(flow.deeperResult || spec, false);
        },
      } : null,
    });
    again.onclick = () => {ui.hideResult(); onDone?.();};
  }

  return {run, stop, vars};
}

/** 步骤条从编排派生，不用在 meta 里另写一份 —— 两份必然会不同步 */
export const stepNamesOf = flow =>
  [...(flow?.steps || []), ...(flow?.deeper || [])].map(s => s.name);
