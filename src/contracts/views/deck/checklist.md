# Deck 自检清单

> 每次 render_deck 完成后必跑。从 case_05_gangster_mansion v2 + v3 试做迭代抽出。
> 自动化项 → render_deck.js 内置；人工项 → 浏览器目检。

## P0 · 必须通过（任何一项失败 = 视图不合格）

### P0-1 · 占位符零残留

```bash
grep -nE "\{\{[A-Z_]+\}\}|\[必填\]|TODO" outputs/{case_id}/deck/index.html
```

期望：无输出。任何 `{{XXX}}` / `[必填]` / `TODO` 残留 = 渲染器逻辑漏洞，必修。

### P0-2 · 主题节奏

```bash
grep -nE 'class="slide ' outputs/{case_id}/deck/index.html
```

人工核验：
- ≥1 个 `hero dark` + ≥1 个 `hero light`
- 4 个 act_divider 必须 light/dark 交替（不要 4 个全 hero light）
- module_wrap 段允许连续 `light` — iframe 隔离视觉断开，不算违反节奏

### P0-3 · iframe src 有效

```bash
grep -oE 'iframe src="[^"]+"' outputs/{case_id}/deck/index.html
```

每个 src 指向 `../{module}.html`，且对应文件必须存在于 `outputs/{case_id}/`。

### P0-4 · iframe lazy load

所有 `<iframe>` 必须带 `loading="lazy"`，否则一次性加载 11 个模块（含 7345 行的 spatial_layout）会拖慢首屏到 5+ 秒。

### P0-5 · Manifest 双 gate

`manifest.ir.status == 'confirmed' AND manifest.assembly.status == 'assembled'` 才允许渲染。草稿 IR 或未 assembled 的 case 不出 deck。

### P0-6 · deck 容器层类预定义

deck 容器层（chrome / kicker / foot / frame / lead / h-hero 等）所有 class 必须来自 `template.html` 的 `<style>` 块。**不允许在 module_wrap 的 `<section>` 内 inline 重写 deck 容器类**。

注意：iframe 内部模块的 class 不在此约束范围 — 模块自己的 CSS 由模块 contract 管。

---

## P1 · 应当通过（影响美学但不阻塞）

### P1-1 · chrome 与 kicker 不重复（编排页）

cover / act_divider × N / coda 这 6 张编排页人工核验：`.chrome` 左侧 ≠ `.kicker`。（v0.2.1 移除 open_loops 后从 7 张减为 6 张）

| 反例 | 正例 |
|---|---|
| chrome: "Act II · 空间" / kicker: "Act II · 空间" | chrome: "Act II · 空间" / kicker: "Act II"（hero 大字接 ACT_TITLE） |

module_wrap 的 chrome 是 `{module}.html · {模块中文名}`，kicker 是 `Module · {模块短描述}` — 已天然不重复。

### P1-2 · 字体分工（编排页）

- 大标题 `h-hero` / `h-xl`：衬线（自动应用 var(--serif-zh)）
- 正文 / lead：非衬线（var(--sans-zh)）
- 元数据 / 标签：等宽（var(--mono)）

如果编排页显示成全非衬线 → template.html 的 `<style>` 块缺失类，需补到 template，不要在 slide 里 inline 重写。

iframe 内的字体由模块自行决定，deck 不干涉。

### P1-3 · iframe 高度足够

`module_wrap` 的 iframe 包装容器必须 `height:100vh` + `box-sizing:border-box`，让 iframe 撑满 slide。否则会被 chrome / foot 挤压，模块内容被截。

### P1-4 · iframe 边框低调

iframe `border:1px solid rgba(var(--ink-rgb),.15)` 跟随 deck 主题色变浅。不要用纯黑边或彩色边，会和模块自有视觉冲突。

---

## P2 · 推荐遵守（节奏调优）

### P2-1 · 编排页与模块页比例

编排页（cover / act_divider × 4 / coda）固定 6 张，模块页按 case_type 动态（空间类 11 / 玩法类 6）。
- 空间类满配：6 编排 + 11 模块 = 17 页
- 玩法类裁剪：6 编排 + 6 模块 = 12 页
- 编排页 > 模块页 = 信息稀疏，违反 deck 初衷（玩法类裁剪后接近 1:1，可接受）

### P2-2 · Act 内模块顺序

每个 act 内的模块按"宏观 → 微观"或"概念 → 实施"排列。例如 Act II 空间：
- spatial_layout（整体布局）→ atmosphere_ref（视觉氛围）→ bubble_chart（区域邻接）

具体顺序在 contract.yaml `act_grouping[i].modules` 数组里写死。

### P2-3 · 数据来源标注

每页 `.foot` 左侧标注「来源 · {module}.html」，给评审者可追溯。（uncertainty_flags 已不再出现在 deck 中）

---

## P3 · 可选优化

### P3-1 · 动效降级测试

断网打开 deck，确认 motion.min.js 本地副本工作。无动效但 deck 必须完全可读。

### P3-2 · iframe 滚动 vs 翻页冲突

测试键盘 ←/→ 在 iframe focus 时是否仍能翻页。Chrome / Safari 默认不会被 iframe 内 JS 拦截，但模块 HTML 若有 `addEventListener('keydown')` 可能拦截 — 测一下。

如果出问题：deck 容器层加 `tabindex="0"` 强制接管键盘事件。

### P3-3 · 性能：preload 前后页

11 个模块 iframe 全 lazy load 时，翻到下一页可能有空白 0.3-0.5 秒。可选优化：
- 渲染当前页 + 前后各 1 页（共 3 个 iframe 立即加载，其他 lazy）
- 实现见 render_deck.js 的 `IframePreloadManager`（待实现）

### P3-4 · 打印兜底

deck 是横向翻页 + iframe，不适合打印。需要打印走 `assembled_document.html`。在 deck 加一行链接：

```html
<a href="../assembled_document.html" style="position:fixed; bottom:1vh; left:1vw; font-family:var(--mono); font-size:11px; opacity:.5">📄 打印版</a>
```

---

## 自检模板（render_deck.js 调用）

```js
function runChecks(deckHtmlPath, manifestPath, caseDir) {
  const errors = [];
  const warnings = [];

  // P0 自动化项
  if (hasPlaceholderResidue(deckHtmlPath)) errors.push("P0-1 placeholder residue");
  if (!themeRhythmValid(deckHtmlPath)) errors.push("P0-2 theme rhythm");
  if (!iframeSrcValid(deckHtmlPath, caseDir)) errors.push("P0-3 iframe src missing file");
  if (!iframeLazyLoad(deckHtmlPath)) errors.push("P0-4 iframe missing loading=lazy");
  if (!manifestGate(manifestPath)) errors.push("P0-5 manifest gate failed");

  // P1 警告
  if (hasChromeKickerDuplicate(deckHtmlPath)) warnings.push("P1-1 chrome/kicker duplicate");

  return { errors, warnings, passed: errors.length === 0 };
}
```

错误项阻塞 deck 输出；警告项写日志，不阻塞。

---

## v0.1 → v0.2 删除的规则

下列规则因方向修正（不再叙事重构）已删除：

| v0.1 规则 | 删除原因 |
|---|---|
| P0-5 图片路径有效 | deck 不再插独立 `<img>`，所有图都在 iframe 内的模块自身管理 |
| P1-3 图片占位策略 | 同上 |
| P1-4 数字显示（stat-card 数字 ≤4 字符）| stat-card 已不在 v0.2 layouts 中 |
| P1-5 SVG 情绪曲线必须脚本化 | emotion_curve 模块自己负责 SVG，deck 不重画 |
| P2-1 hero 与 non-hero 比例（5-7 张 hero / 15 页） | v0.2.1 是 6 编排 + N 模块的动态页数，按 case_type 17/12 |

## v0.2 → v0.2.1 删除的规则

| v0.2 规则 | 删除原因 |
|---|---|
| open_loops slide 相关检查 | uncertainty_flags 是 log 噪音不应入 deck（彻底移除 layout）|
| spatial_topology 引用检查 | v2.4 早已废弃，永不引用 |

## 新增 P0（v0.2.1）

### P0-7 · 玩法类不出现「关卡」字样

```bash
# 玩法类 deck 自检：grep 「关卡」字样
if 是玩法类; then
  grep -nE "关卡" outputs/{case_id}/deck/index.html
fi
```

期望：玩法类（OpenWorldEvent / OpenWorldChallenge）的 deck 中不应出现「关卡」字样。详见 memory/feedback_levelagent_gameplay_vs_level.md。

### P0-8 · 永不引用废弃模块

```bash
grep -nE "spatial_topology|open_loops|uncertainty_flags" outputs/{case_id}/deck/index.html
```

期望：无输出。任何对废弃模块/字段的引用 = 改 LevelAgent 时没查 changelog。详见 memory/feedback_levelagent_check_changelog.md。
