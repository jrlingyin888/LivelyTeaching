/**
 * gen.mjs —— 教学编排生成器
 *
 * 这个脚本干的是**难的那一半**：把「生成一节课的编排」需要的上下文正确地组装起来 ——
 * DSL 词汇表、这一课内核提供了哪些动作、已有场景长什么样、会拿什么尺子量。
 *
 * 传输层是可替换的：
 *   现在   node gen.mjs seasons "四季是怎么形成的…"  → prompts/seasons.md
 *          把它喂给一个干净的 Claude 会话（子代理，或自己贴进 claude chat）
 *   以后   有 API key 了，在这里加二十行直接调用即可
 *
 * 拿回 JSON 之后：
 *   node gen.mjs --verify seasons generated/seasons.flow.json
 * 走的是 flow-lint.mjs —— 和手写编排完全同一套尺子。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { SCENES } from './src/scenes/index.js';
import { lintFlow, actionsOf } from './flow-lint.mjs';

const srcOf = id => readFileSync(new URL(`./src/scenes/${id}.js`, import.meta.url), 'utf8');

/** flow.js 顶部的注释就是 DSL 说明书 —— 从那里读，不另抄一份 */
function dslDoc() {
  const s = readFileSync(new URL('./src/core/flow.js', import.meta.url), 'utf8');
  return s.slice(s.indexOf('/**') + 3, s.indexOf('*/')).replace(/^\s*\*ers?/gm, '')
          .split('\n').map(l => l.replace(/^\s*\*ered?\s?/, '').replace(/^\s*\* ?/, '')).join('\n').trim();
}

/** 从场景源码里抠出每个动作的签名，和**紧贴在它上面**的那段注释 */
function actionDocs(src) {
  const out = [];
  for (const name of actionsOf(src)) {
    const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(([^)]*)\\)`);
    const m = decl.exec(src);
    if (!m) {out.push({name, args: '', doc: ''}); continue;}

    // 只认紧挨着声明的那段注释。松一点的话，没写注释的函数会捡到
    // 上一个函数的说明 —— 喂给模型就是错的信息。
    let doc = '';
    const before = src.slice(0, m.index).trimEnd();
    if (before.endsWith('*/')) {
      const open = before.lastIndexOf('/**');
      if (open >= 0) {
        doc = before.slice(open + 3, before.length - 2)
          .split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd())
          .filter(Boolean).join(' ').trim();
      }
    }
    out.push({name, args: m[1].replace(/\s+/g, ' ').trim(), doc});
  }
  return out;
}

/* ===================== --verify ===================== */
if (process.argv[2] === '--verify') {
  const [, , , id, file] = process.argv;
  if (!id || !file) {
    console.error('用法：node gen.mjs --verify <场景id> <flow.json>');
    process.exit(2);
  }
  const flow = JSON.parse(readFileSync(file, 'utf8'));
  const issues = await lintFlow(flow, srcOf(id));
  const fails = issues.filter(i => i.level === 'fail');
  for (const i of issues) console.log(`${i.level === 'fail' ? '✗ ' : '⚠ '} ${i.msg}`);
  if (!issues.length) console.log('✓ 全部通过');
  const steps = [...(flow.steps || []), ...(flow.deeper || [])];
  console.log(`\n步骤（${steps.length}）：${steps.map(s => s.name).join(' → ')}`);
  const n = s => JSON.stringify(flow).split(`"${s}"`).length - 1;
  console.log(`提问 ${n('ask')} 处 · 揭晓 ${n('judge')} 处 · 调用动作 ${n('act')} 次`);
  process.exit(fails.length ? 1 : 0);
}

/* ===================== --apply ===================== */
/* 把生成好的编排装回场景文件，替换掉原来的 flow 块。装之前先过一遍尺子。 */
if (process.argv[2] === '--apply') {
  const [, , , id, file] = process.argv;
  if (!id || !file) {
    console.error('用法：node gen.mjs --apply <场景id> <flow.json>');
    process.exit(2);
  }
  const flow = JSON.parse(readFileSync(file, 'utf8'));
  const src = srcOf(id);
  const bad = (await lintFlow(flow, src)).filter(i => i.level === 'fail');
  if (bad.length) {
    console.error('✗ 没通过校验，不装：');
    for (const b of bad) console.error('  ' + b.msg);
    process.exit(1);
  }

  // 找到 `flow: {` 到与之配平的 `}`
  const at = src.indexOf('\n  flow: {');
  if (at < 0) {console.error('在场景里找不到 flow 块'); process.exit(1);}
  const open = src.indexOf('{', at);
  let depth = 0, end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && !--depth) break;
  }
  const body = JSON.stringify(flow, null, 2).split('\n').map((l, i) => i ? '  ' + l : l).join('\n');
  const path = new URL(`./src/scenes/${id}.js`, import.meta.url);
  writeFileSync(path, src.slice(0, open) + body + src.slice(end + 1));
  console.log(`✓ 已装入 src/scenes/${id}.js`);
  process.exit(0);
}

/* ===================== 组装 prompt ===================== */
const id = process.argv[2];
const topic = process.argv[3];
if (!id || !topic) {
  console.error('用法：node gen.mjs <场景id> "<要教的知识点，用老师的话说>"');
  process.exit(2);
}
const scene = SCENES.find(s => s.id === id);
if (!scene) {console.error(`没有这个场景：${id}`); process.exit(2);}

const EXAMPLE = 'balance-scale';
const example = SCENES.find(s => s.id === EXAMPLE);
const acts = actionDocs(srcOf(id));

const prompt = `# 任务

给一个儿童 3D 互动课件写「教学编排」。3D 建模和物理计算已经写好了，
你只负责编排：分几步、什么时候让孩子先猜、什么时候揭晓、结论怎么给。

# 这个产品是什么

老师或家长打开一个网页，孩子跟着一步步动手做实验。物理是真算的，不是播动画。
使用者是 **6-7 岁的一年级孩子**：识字量很小、注意力大约 5 分钟、还没学小数和单位。
所有提示都会被朗读出来。

因此：
- 文字要短、要口语、要能念出来。不要用"因此""由于""相应地"这种书面语
- 不要出现小数、单位换算、专业名词
- 猜错不惩罚。hint 写成"再看看""没关系"的口气，不要写"错误""不对"
- 一整节课控制在 5 分钟左右

# 你要教的知识点

${topic}

# 编排的格式

${dslDoc()}

补充说明：
- 一步 = {name: '三四个字的步骤名', do: [指令...]}
- flow.steps 是表层；flow.deeper 是可选的深层，孩子点结论卡上的按钮才展开，
  用 flow.deeperLabel 定按钮文字、flow.deeperResult 定深层自己的结论卡
- 结论卡字段：{icon, title, note, grown}。grown 是给旁边大人看的一行小字，
  可以写得深一点，也可以写"可以追问什么"
- note / title 里可以用 {{变量名}} 引用前面 as 记下来的值

# 这一课的内核提供了这些动作

${acts.map(a => `- **${a.name}(${a.args})**${a.doc ? ` —— ${a.doc}` : ''}`).join('\n')}

只能调用上面这些，不能自己发明动作名。

# 一个已有场景的完整编排（参考写法）

场景：${example.name}（${example.grade}）

\`\`\`json
${JSON.stringify(example.flow, null, 2)}
\`\`\`

# 你的输出会被这样校验

会跑一个自动检查，下面任何一条不过就打回：

1. 调用的动作必须在上面的清单里
2. 每个 ask 必须有 as 记下孩子的答案；记下了就必须有对应的 judge 揭晓，不能问完不管
3. judge 的 expect / against 引用的变量必须在前面定义过
4. 至少要有一个 judge 用 expect（答案是内核算出来的），不能全是 correct（写死的答案）
5. 必须有 result 结论卡；{{变量}} 引用的变量必须存在
6. 会把整条编排无头跑一遍（动作打桩、提问一律选第一项），必须能走到结论卡，
   不能有走不到的步骤

# 输出

只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码围栏。
顶层字段：steps（必需）、result（必需）、deeper / deeperLabel / deeperResult（可选）。
`;

mkdirSync(new URL('./prompts/', import.meta.url), {recursive: true});
const out = new URL(`./prompts/${id}.md`, import.meta.url);
writeFileSync(out, prompt);
console.log(`✓ prompts/${id}.md  (${prompt.length} 字)`);
console.log(`  可用动作 ${acts.length} 个：${acts.map(a => a.name).join(', ')}`);
