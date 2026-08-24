<h1 align="center">小象课堂 · LivelyTeaching</h1>

<p align="center">老师在课堂上说一句话，屏幕上就出现一个能动手操作的 3D 实验。</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-2e6f9e">
  <img alt="three.js" src="https://img.shields.io/badge/three.js-r160-1f3864">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-1f7a5a">
</p>

---

不是播动画，不是看视频——学生可以拖、可以点、可以改，**物理是真算出来的**。

构建产物是**一个 HTML 文件**：双击就能开，不联网、不装环境，微信直接发给同事和家长。

---

## 快速开始

```bash
npm install
npm run build      # 产出 dist/index.html（单文件）
npm run dev        # 开发模式，自动重建
npm run serve      # 本地起服务预览
```

打开 `dist/index.html` → 输入或语音说「曹冲称象」→ 开始上课。

---

## 已实现：曹冲称象

小学语文 / 科学 · 浮力与等量代换

学生跟着五步走完整个实验：

1. **大象上船** — 船身下沉
2. **刻下吃水线** — 在船舷自动标出红线
3. **大象下船** — 船身浮起，红线留在船上
4. **装载石块** — 一块块往船上放，实时看吃水深度逼近红线
5. **得出结论** — 对齐的瞬间弹出：石头总重 = 大象体重

浮力按真实公式计算：

```
吃水深度 d = 载重总质量 m ÷ (水密度 ρ × 船底面积 A)
```

12 块石头的重量之和精确等于大象体重（4,400 kg），所以最后一定严丝合缝对上 0.500 m。老师追问原理时答得出来。

---

## 目录结构

```
src/
  core/
    stage.js        Three.js 舞台：渲染器、光照、水面、动画助手、GLB 加载
    ui.js           通用界面层：数据面板、步骤条、结论卡、对话入口
  scenes/
    index.js        场景注册表
    caochong-chengxiang.js   曹冲称象
  main.js           入口
  shell.html        HTML 外壳（构建时把 JS 内联进来）
assets/models/      放 AI 生成的 GLB
docs/               产品文档、场景模板规范、AI 链路接入
build.mjs           单文件构建脚本
```

---

## 新增一个学科场景

新建一个文件 + 在注册表加一行，**不用碰 `src/core/`**。

```js
export default {
  id: 'lever-balance',
  name: '杠杆原理',
  keywords: ['杠杆', '撬棍', '省力'],
  subject: '小学科学 / 初中物理',
  topic: '杠杆 · 力矩平衡',
  steps: ['放置支点', '左侧加钩码', '右侧调平', '得出结论'],
  stats: [{ key: 'left', label: '左侧力矩' }, { key: 'right', label: '右侧力矩' }],
  build(ctx) { /* 建模 + 物理 + 交互 */ return { actions, reset }; },
};
```

完整规范见 **[docs/场景模板规范.md](docs/场景模板规范.md)**。

---

## 接入 AI 生成的 3D 模型

当前是内置的程序化占位模型。换成 Tripo 生成的真实模型只要填一行地址：

```js
assets: {
  elephant: './assets/models/elephant.glb',
}
```

自动归一化尺寸并落地对齐，加载失败回退内置模型。详见 **[docs/接入AI生成链路.md](docs/接入AI生成链路.md)**。

---

## 文档

| | |
|---|---|
| [产品文档](docs/产品文档.md) | 定位、用户、设计决策、路线图、成功指标 |
| [场景模板规范](docs/场景模板规范.md) | 怎么新增一个学科场景 |
| [接入 AI 生成链路](docs/接入AI生成链路.md) | 即梦 → Tripo → GLB，含成本测算 |

---

## 路线图

- **V0.2** 接真实 AI 链路 + 本地缓存 + 再做 2 个场景（杠杆、沉浮子）
- **V0.3** 场景列表页、教学建议、线上部署，找 10 位老师 + 10 位家长试用
- **V0.4** LLM 意图解析、老师端收藏与自定义参数、场景模板 SDK

---

## 技术栈

Three.js · esbuild · Web Speech API · 即梦 Seedream · Tripo OpenAPI

## License

MIT
