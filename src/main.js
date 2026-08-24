/**
 * 小象课堂 LivelyTeaching — 入口
 * 流程：对话输入 → 匹配场景模板 → 播放生成链路 → 装配 3D 场景 → 交付可交互课件
 */
import { createStage, stepTweens } from './core/stage.js';
import { createUI } from './core/ui.js';
import { matchScene } from './scenes/index.js';

const ui = createUI();
let started = false;

function launch(meta) {
  if (started) return;
  started = true;

  const stage = createStage(document.getElementById('stage'), meta.stage);
  stage.onFrame(dt => stepTweens(dt));

  ui.mount(meta);
  const inst = meta.build.call(meta, {
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    controls: stage.controls,
    onFrame: stage.onFrame,
    ui,
  });
  ui.setActions(inst.actions);
}

ui.bindBoot(text => {
  const meta = matchScene(text);
  if (!meta) return null;
  // 先让加载动画渲染出来，再装配 3D 场景——
  // 建场景会占住主线程，弱一点的教室一体机上会卡住动画。
  ui.runPipeline(meta);
  setTimeout(() => launch(meta), 80);
  return meta;
});
