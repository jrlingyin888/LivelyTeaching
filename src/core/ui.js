/**
 * ui.js — 课件通用界面层（一年级形态）
 *
 * 设计前提：使用者是 6-7 岁、识字量很小、注意力 5 分钟的孩子。
 * 因此：
 *   1. 关键提示一律朗读（say / ask / judge 都会出声）
 *   2. 不用数值面板讲事实，用图形（tally 条、天平倾角、谁先到底）
 *   3. 一次最多 3 个大按钮，该点哪个就亮哪个
 *   4. 猜错不惩罚 —— 只说「再看看」，不打叉
 *
 * 数值面板（setStat / setProgress / setHint）只在场景声明了 meta.stats 时才出现，
 * 给曹冲称象那种面向高年级 / 老师演示的场景用。
 */
import { say, shutUp, setEnabled, isEnabled, isSupported } from './speak.js';

const $ = id => document.getElementById(id);

export function createUI() {
  const el = {
    title: $('bTitle'), sub: $('bSub'),
    hud: $('hud'), stats: $('stats'), bar: $('bar'), legendR: $('legendR'),
    steps: $('steps'), actions: $('actions'), toast: $('toast'),
    result: $('result'), home: $('home'), homeGrid: $('homeGrid'),
    say: $('say'), ask: $('ask'), judge: $('judge'), tally: $('tally'),
    btnHome: $('btnHome'), btnVoice: $('btnVoice'),
  };
  let statRefs = {}, stepEls = [], toastT, sayT, judgeT;
  let onExit = null;

  /* ================= 场景选择页 ================= */
  /** 孩子不会打字，所以入口是图卡片，不是输入框 */
  function showHome(scenes, onPick) {
    shutUp();
    el.homeGrid.innerHTML = '';
    for (const s of scenes) {
      const c = document.createElement('button');
      c.className = 'hcard';
      c.innerHTML =
        `<div class="hi">${s.icon || '🧪'}</div>` +
        `<div class="hn">${s.name}</div>` +
        `<div class="hs">${s.grade || s.subject}</div>`;
      c.onclick = () => {
        el.home.classList.add('hide');
        setTimeout(() => {el.home.style.display = 'none'; onPick(s);}, 420);
      };
      el.homeGrid.appendChild(c);
    }
    el.home.style.display = 'grid';
    requestAnimationFrame(() => el.home.classList.remove('hide'));
  }

  function backHome() {
    shutUp();
    clearSay(); hideResult(); el.ask.classList.remove('show');
    el.tally.innerHTML = ''; el.actions.innerHTML = ''; el.steps.innerHTML = '';
    el.hud.style.display = 'none';
    el.home.style.display = 'grid';
    requestAnimationFrame(() => el.home.classList.remove('hide'));
    onExit?.();
  }

  el.btnHome.onclick = backHome;

  /* ================= 语音开关 ================= */
  const syncVoiceBtn = () => {
    const on = isEnabled() && isSupported();
    el.btnVoice.textContent = on ? '🔊' : '🔇';
    el.btnVoice.classList.toggle('off', !on);
    el.btnVoice.title = isSupported() ? (on ? '朗读已开' : '朗读已关') : '当前浏览器不支持朗读';
  };
  el.btnVoice.onclick = () => {
    if (!isSupported()) return;
    setEnabled(!isEnabled());
    syncVoiceBtn();
  };
  syncVoiceBtn();

  /* ================= 由场景 meta 初始化 ================= */
  function mount(meta) {
    el.title.textContent = meta.name;
    el.sub.textContent = meta.grade || `${meta.subject} · ${meta.topic}`;
    document.title = `${meta.name} · 小象课堂`;

    // 数值面板：一年级场景不声明 stats，面板就不出现
    if (meta.stats?.length) {
      el.hud.style.display = '';
      el.stats.innerHTML = '';
      statRefs = {};
      for (const s of meta.stats) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span>${s.label}</span><span class="v">—</span>`;
        el.stats.appendChild(row);
        statRefs[s.key] = row.lastElementChild;
      }
    } else {
      el.hud.style.display = 'none';
      statRefs = {};
    }

    el.steps.innerHTML = '';
    stepEls = (meta.steps || []).map((label, i) => {
      const d = document.createElement('div');
      d.className = 'step';
      d.innerHTML = `<i></i>${typeof label === 'string' ? label : label.name}`;
      el.steps.appendChild(d);
      return d;
    });
  }

  /* ================= 操作按钮 ================= */
  /** 一次最多 3 个。第 4 个开始会被折进「更多」，避免糊满屏幕。 */
  function setActions(actions) {
    el.actions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'b' + (a.primary ? ' pri' : a.ghost ? ' ghost' : '');
      b.textContent = a.label;
      b.onclick = () => a.run();
      a._el = b;
      el.actions.appendChild(b);
    }
  }
  /** 只亮该点的那个按钮，其余变暗 —— 一年级需要唯一指向 */
  const focusAction = label => {
    for (const b of el.actions.children) b.classList.toggle('dim', !!label && b.textContent !== label);
  };

  /* ================= 大字提示 + 朗读 ================= */
  function clearSay() {
    clearTimeout(sayT);
    el.say.classList.remove('show');
  }
  /**
   * 显示一句大字并念出来。返回念完的 Promise。
   * hold：多少毫秒后自动收起，不传就一直留着
   * mute：只显示不朗读 —— 用来在念完一句临时的话之后，
   *       把常驻的那句指令悄悄放回去，别让屏幕上空着没提示
   */
  function sayBig(text, {hold = 0, mute = false} = {}) {
    clearTimeout(sayT);
    el.say.textContent = text;
    el.say.classList.add('show');
    if (hold) sayT = setTimeout(() => el.say.classList.remove('show'), hold);
    return mute ? Promise.resolve() : say(text);
  }

  /* ================= 预测卡：猜一猜 ================= */
  /**
   * 产品上最重要的一个交互。先猜再看，学生才经历思维过程，
   * 而不是看一段必然成功的动画。
   * @returns {Promise<{index:number,label:string}>}
   */
  function ask(question, options) {
    const card = el.ask.querySelector('.card');
    card.innerHTML =
      `<div class="qt">猜一猜</div><h2>${question}</h2><div class="opts"></div>`;
    const box = card.querySelector('.opts');

    return new Promise(resolve => {
      options.forEach((o, i) => {
        const label = typeof o === 'string' ? o : o.label;
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = (typeof o === 'object' && o.icon ? `<span class="oi">${o.icon}</span>` : '') +
                      `<span>${label}</span>`;
        b.onclick = () => {
          el.ask.classList.remove('show');
          resolve({index: i, label});
        };
        box.appendChild(b);
      });
      el.ask.classList.add('show');
      say(question);
    });
  }

  /* ================= 揭晓：猜对了 / 再看看 ================= */
  /** 猜错不打叉、不扣分。一年级一旦有挫败感就不肯玩了。 */
  function judge(ok, text) {
    clearTimeout(judgeT);
    el.judge.className = ok ? 'good show' : 'again show';
    el.judge.innerHTML = `<b>${ok ? '✓ 猜对了！' : '再看看～'}</b>${text ? `<span>${text}</span>` : ''}`;
    judgeT = setTimeout(() => el.judge.classList.remove('show'), 2800);
    return say((ok ? '猜对了！' : '没关系，再看看。') + (text || ''));
  }

  /* ================= 图形化计数（代替数字面板）================= */
  /**
   * rows: [{label, count, icon}] —— 用一排图形表示数量，
   * 一年级还没学单位和小数，但会数数。
   */
  function tally(rows) {
    if (!rows?.length) {el.tally.innerHTML = ''; return;}
    el.tally.innerHTML = rows.map(r =>
      `<div class="trow"><span class="tl">${r.label}</span>` +
      `<span class="tc">${(r.icon || '◼').repeat(Math.max(0, r.count))}</span>` +
      `<span class="tn">${r.count}</span></div>`).join('');
  }

  /* ================= 步骤 ================= */
  const setStep = n => stepEls.forEach((e, i) => {
    e.classList.toggle('active', i === n);
    e.classList.toggle('done', i < n);
  });

  /* ================= 兼容：数值面板（高年级 / 老师演示）========== */
  const setStat = (k, v, ok) => {
    const n = statRefs[k];
    if (!n) return;
    n.textContent = v;
    n.classList.toggle('ok', !!ok);
  };
  const setProgress = (pct, done) => {
    el.bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    el.bar.classList.toggle('done', !!done);
  };
  const setHint = (text, ok) => {
    el.legendR.textContent = text;
    el.legendR.classList.toggle('ok', !!ok);
  };
  const toast = msg => {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('show'), 2600);
  };

  /* ================= 结论卡 ================= */
  /**
   * 一年级版：一个大图 + 一句话结论 + 可选的一行小字给陪着的大人看。
   * 不放公式、不放小数。
   */
  function showResult(r) {
    clearSay();
    el.result.querySelector('.card').innerHTML = `
      ${r.icon ? `<div class="ri">${r.icon}</div>` : '<div class="t">实验结论</div>'}
      <h2>${r.title}</h2>
      ${r.big ? `<div class="big">${r.big}<em>${r.unit || ''}</em></div>` : ''}
      ${r.equation ? `<div class="eq">
        <div>${r.equation[0].label}<b>${r.equation[0].value}</b></div>
        <span>=</span>
        <div>${r.equation[1].label}<b>${r.equation[1].value}</b></div>
      </div>` : ''}
      ${r.note ? `<p>${r.note}</p>` : ''}
      ${r.grown ? `<p class="grown">给大人：${r.grown}</p>` : ''}
      <div class="rbtn">
        <button class="b pri" id="btnAgain">再玩一次</button>
        <button class="b ghost" id="btnBackHome">换一个</button>
      </div>`;
    el.result.querySelector('#btnBackHome').onclick = backHome;
    el.result.classList.add('show');
    say(r.title + (r.note ? '。' + r.note : ''));
    return el.result.querySelector('#btnAgain');   // 场景自己绑「再玩一次」
  }
  const hideResult = () => el.result.classList.remove('show');

  return {
    mount, setActions, focusAction,
    say: sayBig, clearSay, ask, judge, tally, setStep,
    setStat, setProgress, setHint, toast,
    showResult, hideResult,
    showHome, backHome,
    set onExit(fn) {onExit = fn;},
  };
}
