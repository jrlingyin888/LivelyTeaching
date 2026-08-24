/**
 * ui.js — 课件通用界面层
 * 顶栏、实验数据面板、步骤条、操作按钮、提示条、结论卡、对话入口
 * 全部由场景模板的 meta 声明式驱动，新增学科不用改这里。
 */
const $ = id => document.getElementById(id);

export function createUI() {
  const el = {
    title: $('bTitle'), sub: $('bSub'),
    stats: $('stats'), bar: $('bar'), legendR: $('legendR'),
    steps: $('steps'), actions: $('actions'), toast: $('toast'),
    result: $('result'), boot: $('boot'),
  };
  let statRefs = {}, stepEls = [], toastT;

  /* ---------- 由场景 meta 初始化界面 ---------- */
  function mount(meta) {
    el.title.textContent = meta.name;
    el.sub.textContent = `${meta.subject} · ${meta.topic}`;
    document.title = `${meta.name} · 小象课堂`;

    el.stats.innerHTML = '';
    statRefs = {};
    for (const s of meta.stats) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${s.label}</span><span class="v">—</span>`;
      el.stats.appendChild(row);
      statRefs[s.key] = row.lastElementChild;
    }

    el.steps.innerHTML = '';
    stepEls = meta.steps.map((label, i) => {
      const d = document.createElement('div');
      d.className = 'step';
      d.innerHTML = `<i>${i + 1}</i>${label}`;
      el.steps.appendChild(d);
      return d;
    });

  }

  /* ---------- 操作按钮由场景 build() 返回后挂载 ---------- */
  function setActions(actions) {
    el.actions.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'b' + (a.primary ? ' pri' : a.ghost ? ' ghost' : '');
      b.textContent = a.label;
      b.onclick = () => a.run();
      el.actions.appendChild(b);
    }
  }

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
  const setStep = n => stepEls.forEach((e, i) => {
    e.classList.toggle('active', i === n);
    e.classList.toggle('done', i < n);
  });
  const toast = msg => {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('show'), 2600);
  };

  /* ---------- 结论卡 ---------- */
  function showResult(r) {
    el.result.querySelector('.card').innerHTML = `
      <div class="t">实验结论</div>
      <h2>${r.title}</h2>
      <div class="big">${r.value}<em>${r.unit || ''}</em></div>
      ${r.equation ? `<div class="eq">
        <div>${r.equation[0].label}<b>${r.equation[0].value}</b></div>
        <span>=</span>
        <div>${r.equation[1].label}<b>${r.equation[1].value}</b></div>
      </div>` : ''}
      <p>${r.note}</p>
      <button class="b pri" id="btnClose">关闭</button>`;
    el.result.querySelector('#btnClose').onclick = () => el.result.classList.remove('show');
    el.result.classList.add('show');
  }
  const hideResult = () => el.result.classList.remove('show');

  /* ---------- 对话入口 + 生成链路动画 ---------- */
  const PIPELINE = [
    ['解析指令', '识别知识点、学科与目标物体', 520],
    ['即梦 Seedream', '生成大象 / 木船 / 石块参考图', 1000],
    ['Tripo', '图像转 3D 模型（GLB）', 1250],
    ['场景装配', '水面 · 浮力 · 吃水线 · 交互逻辑', 700],
  ];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function bindBoot(onAsk) {
    const ask = txt => {
      const q = (txt || '').trim();
      if (!q) return;
      const hit = onAsk(q);
      if (!hit) $('bootErr').textContent = '当前版本还没有这个知识点的场景，试试输入：曹冲称象';
    };
    $('bootForm').addEventListener('submit', e => {e.preventDefault(); ask($('q').value);});
    document.querySelectorAll('.chip').forEach(c =>
      c.onclick = () => {$('q').value = c.textContent; ask(c.textContent);});

    // 语音输入（Chrome / Edge）
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = $('mic');
    if (SR) {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      let on = false;
      mic.onclick = () => on ? rec.stop() : rec.start();
      rec.onstart = () => {on = true; mic.classList.add('rec');};
      rec.onend = () => {on = false; mic.classList.remove('rec');};
      rec.onresult = e => {const t = e.results[0][0].transcript; $('q').value = t; ask(t);};
      rec.onerror = () => {$('bootErr').textContent = '麦克风不可用，请直接输入文字';};
    } else {
      mic.title = '当前浏览器不支持语音输入（建议 Chrome / Edge）';
      mic.classList.add('off');
    }
  }

  async function runPipeline(meta) {
    $('bootForm_wrap').style.display = 'none';
    $('bootHit').style.display = 'block';
    $('hitName').textContent = meta.name;
    $('hitTags').textContent = `${meta.subject} · ${meta.topic}`;
    $('hitObj').textContent = meta.objects;
    const box = $('bootSteps');
    box.innerHTML = '';
    for (const [name, desc, ms] of PIPELINE) {
      const row = document.createElement('div');
      row.className = 'pstep';
      row.innerHTML = `<i class="dot"></i><b>${name}</b><span>${desc}</span>`;
      box.appendChild(row);
      await sleep(ms);
      row.classList.add('ok');
    }
    await sleep(320);
    el.boot.classList.add('hide');
    setTimeout(() => {el.boot.style.display = 'none'; toast('课件已就绪，可直接投屏演示');}, 620);
  }

  return {mount, setActions, setStat, setProgress, setHint, setStep, toast,
          showResult, hideResult, bindBoot, runPipeline};
}
