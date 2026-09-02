/**
 * 小象课堂 LivelyTeaching — 入口
 * 流程：首页选一个场景 → 装配 3D 舞台 → 交付可交互课件 → 随时换一个
 */
import { createStage, stepTweens } from './core/stage.js';
import { createUI } from './core/ui.js';
import { createFlowRunner } from './core/flow.js';
import { SCENES } from './scenes/index.js';

const ui = createUI();
const host = document.getElementById('stage');

let stage = null;
let gen = 0;                       // 每换一次场景 +1

/** 永不 resolve：让已经被换掉的场景的 async 流程原地停住 */
const PARKED = new Promise(() => {});

/**
 * 把 ui 包一层。场景被换掉之后，它残留的 await 链还会继续跑
 * （tween 被 clearTweens 强制 resolve 了），如果不拦，
 * 上一课的语音和提示会盖在首页上。
 */
function scopedUI(alive) {
  return new Proxy(ui, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      return (...a) => alive() ? v.apply(t, a) : PARKED;
    },
  });
}

function teardown() {
  gen++;
  stage?.dispose();
  stage = null;
}

function launch(meta) {
  teardown();
  const my = gen;
  const alive = () => my === gen;

  stage = createStage(host, meta.stage);
  stage.onFrame(dt => stepTweens(dt));

  // 步骤条从编排派生：meta 里再写一份必然会不同步（曹冲称象就漏过一步）
  ui.mount(meta.flow ? {...meta, steps: meta.flow.steps.map(s => s.name)} : meta);
  const inst = meta.build.call(meta, {
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    controls: stage.controls,
    onFrame: stage.onFrame,
    flyTo: stage.flyTo,
    flyToFit: stage.flyToFit,
    ui: scopedUI(alive),
  });

  // 玩具模式：没有脚本，孩子拖参数，世界跟着变。build() 里自己挂好了滑块。
  if (meta.toy) return;

  // 声明了 flow 的场景：编排交给解释器跑，内核只提供动作
  if (meta.flow) {
    let runner = null;
    const start = () => {
      runner?.stop();
      inst.reset?.();
      runner = createFlowRunner({
        ui: scopedUI(alive),
        actions: inst.actions,
        flow: meta.flow,
        onDone: start,          // 结论卡上的「再玩一次」
      });
      runner.run().catch(e => {if (alive()) console.error('[flow]', e);});
    };
    start();
    return;
  }

  // 老写法：场景自己驱动流程，actions 是一排按钮
  if (inst?.actions?.length) ui.setActions(inst.actions);
}

ui.onExit = teardown;
ui.showHome(SCENES, launch);
