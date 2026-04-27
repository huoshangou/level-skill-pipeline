# Level Deck — 横向翻页 Deck 视图渲染

> **Quick:** 校验 case → 调 render_deck.js → 浏览器打开。**不重跑 pipeline，只生成视图。**

为已组装好的 LevelAgent case 生成 horizontal swipe deck（杂志风、WebGL 背景、横向翻页），把 N 个模块原样用 iframe 包装到 deck 容器里。

## 输入

$ARGUMENTS

期望: 一个 case_id（如 `case_05_gangster_mansion` / `case_03_continuous_destroy`）。

如果用户没给 case_id 或给错了名字：
- 列出 `~/LevelAgent/outputs/` 下所有 case 目录让用户选
- 不要自己猜

## 何时使用

- 用户说「生成 deck」「出 deck 视图」「做个翻页 PPT」「我想看看 case_xx 的 slide 版本」
- 用户在 design-level Phase 5 锁定后想看视觉版
- 用户单独迭代 deck 视觉（改完模块后想刷新）

## 何时不用

- 用户要从零跑关卡设计 → 用 `/design-level`
- 用户要长文档 / 打印版 → 已有 `outputs/{case_id}/assembled_document.html`
- case 还没 confirmed/locked 或没 assembled → 拒绝并提示先跑完 pipeline

## 执行步骤

### Step 1 · 解析输入

从 $ARGUMENTS 抽 case_id。校验：
- 必须是 `case_NN_xxx` 格式（snake_case）
- `~/LevelAgent/outputs/{case_id}/manifest.json` 必须存在

如果不满足，列出可用 case 让用户选：

```bash
ls ~/LevelAgent/outputs/ | grep "^case_"
```

### Step 2 · 校验 manifest gate

读 `~/LevelAgent/outputs/{case_id}/manifest.json`，校验：

- `manifest.ir.status` ∈ {`confirmed`, `locked`}
- `manifest.assembly.status` == `assembled`

任一不满足 → 拒绝执行，告诉用户：
> 「case_xx 还未走完 pipeline (ir.status=X / assembly.status=Y)。请先用 /design-level 完成 IR 确认 + 模块组装。」

### Step 3 · 调用 render_deck.js

```bash
cd ~/LevelAgent && node pipeline/render_deck.js {case_id}
```

捕获 stdout/stderr：
- 渲染器内置 P0 自检，失败会 exit code 非 0
- 渲染器会输出主题选择 / 模块清单 / 自检结果

如果失败：把脚本输出原样给用户，不要自己解读修复。让用户判断。

### Step 4 · 浏览器打开

```bash
open ~/LevelAgent/outputs/{case_id}/deck/index.html
```

### Step 5 · 简短报告

报告给用户的格式（≤80 字）：

```
✓ {case_id} deck 已生成
  主题: {theme_name}  (case_type={ir.type})
  规模: {N} slides · {M} iframes
  路径: outputs/{case_id}/deck/index.html
```

不要做长篇总结。不要解释做了什么 — 用户能在浏览器看到。

## 操作约束

- **不重跑 pipeline** — 只调 render_deck.js，不重生成模块
- **不修改源文件** — 不改 13 模块 HTML / IR / manifest
- **不污染输出** — 写 `outputs/{case_id}/deck/`，与模块文件在不同子目录
- **失败 fail-fast** — 不绕过 manifest gate，不"为了让脚本跑起来"注释掉错误

## 相关文件

- 渲染器: `~/LevelAgent/pipeline/render_deck.js`
- 契约: `~/LevelAgent/contracts/views/deck/contract.yaml`
- 布局: `~/LevelAgent/contracts/views/deck/layouts.md`
- 自检: `~/LevelAgent/contracts/views/deck/checklist.md`
- 类型裁剪规则: `~/LevelAgent/contracts/level_type_rules.md`
- 项目 CLAUDE.md: `~/LevelAgent/CLAUDE.md`

## 关键背景

- **deck 是「呈现层壳」，不是「叙事重构」**。详见 `contracts/views/deck/README.md` v0.2 关键设计判断段。
- 模块原内容 100% 保留（属性表、SVG 流程图、卡片、配色都不动），通过 iframe 隔离嵌入 deck 容器。
- case_type → theme 自动映射（POI=沙丘 / OpenWorldEvent=森林墨 / 其他=墨水经典 fallback）
- 玩法类 case 自动裁剪 atmosphere_ref/lighting_req/vfx_req/audio_req（按 manifest 的 skipped 状态）

## 版本

v0.1.0（2026-04-27）— 首次建立。包装 render_deck.js v0.2.0。
