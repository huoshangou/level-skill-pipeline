# 产物模块规范 — Module Specification

> 所有 Skill 产物遵循此规范，确保独立可渲染 + 可组装。

## 核心原则

1. **每个模块是一个自包含 HTML 文件** — 双击即可在浏览器打开
2. **零依赖** — 内联 CSS，无外部 CDN/JS 库
3. **统一视觉语言** — 遵循 render_standards.md 的 v4 风格
4. **可组装** — 通过 `data-module` 属性，Assembler 可提取 `<section class="module">` 内容组合成完整 POI 文档

## HTML 结构模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>{模块名称} — {关卡名称}</title>
    <style>
        /* 内联 render_standards.md 的 CSS 变量 + 模块专属样式 */
    </style>
</head>
<body>

<section class="module" data-module="{module-type}" data-level-id="{level_id}">
    <div class="module-header">
        <div class="module-badge">[{MODULE TYPE}]</div>
        <h1>{模块标题} — {关卡名称}</h1>
        <div class="module-meta">
            <span>关卡 ID: {level_id}</span>
            <span>类型: {type}</span>
            <span>生成时间: {timestamp}</span>
        </div>
    </div>

    <!-- 模块主体内容 -->

    <div class="module-footer">
        <span>Level Design Agent · {Skill名} v{版本}</span>
        <span>数据来源: {IR维度列表}</span>
    </div>
</section>

</body>
</html>
```

## 关键属性

| 属性 | 作用 | 示例 |
|------|------|------|
| `data-module` | 模块类型标识 | `bubble-chart`, `emotion-curve`, `asset-list` |
| `data-level-id` | 关卡 ID | `poi_hollywood_artmuseum_01` |
| `class="module"` | 组装器提取标记 | 所有模块必须有 |

## 组装模式

`pipeline/assemble_document.js` v2.0 的工作方式：

1. 读取 `manifest.json` 获取模块列表和状态
2. 读取 `ir_filled.json` 获取 Hero 元信息（名称/类型/统计数据）
3. 从各模块 HTML 提取 `<style>` 内容（`extractStyles()`）
4. 从各模块 HTML 提取 `<section class="module">` 内容（`extractSection()`）
5. 合并所有模块 CSS 到统一 `<style>` 块
6. 生成 240px 固定左侧导航栏 + Hero 封面 + 模块 sections + Footer
7. 输出 `assembled_document.html`

```bash
node pipeline/assemble_document.js outputs/{case_id}
```

### 组装顺序（与 assemble_document.js 保持一致）

```
01. [概览]     level-overview      — 关卡概览卡片
02. [流程]     bubble-chart        — 玩法逻辑流程图 / 空间气泡图（双模式）
03. [情绪]     emotion-curve       — 情绪节奏曲线
04. [空间]     spatial-topology    — 空间拓扑图
05. [资产]     asset-list          — 美术资产需求表
06. [氛围]     atmosphere-ref      — 氛围参考（提示词表格/图片）
07. [分镜]     storyboard          — 核心流程分镜（提示词表格/图片）
08. [灯光]     lighting-req        — 灯光需求表
09. [特效]     vfx-req             — 特效需求表
10. [音频]     audio-req           — 音频需求表
11. [程序]     tech-req            — 程序需求文档
```

> 评分数据记录在 `manifest.json` 和 `score_report.json` 中，不作为独立组装模块。

## 模块清单 + IR 维度映射

> **关卡类型规则：** 不同类型关卡的模块生成策略不同，详见 `contracts/level_type_rules.md`。
> 玩法类（OpenWorldEvent 等）在生成前需经过 Phase 1.5 类型感知裁剪，部分模块须经用户确认。

| # | 模块 | data-module | IR 维度 | 输出类型 | 空间类 | 玩法类 |
|---|------|------------|---------|----------|--------|--------|
| 01 | 关卡概览 | `level-overview` | ALL（全维度摘要） | 单页 HTML | ✅ 必生成 | ✅ 必生成 |
| 02 | 玩法流程图 | `bubble-chart` | FLOW + MECHANIC 或 FLOW + FEEL | 流程图 HTML | ✅ 必生成 | ✅ 必生成 |
| 03 | 情绪节奏曲线 | `emotion-curve` | FEEL + FLOW | SVG 图表 HTML | ✅ 必生成 | ✅ 必生成 |
| 04 | 空间拓扑图 | `spatial-topology` | SPACE | SVG 拓扑 HTML | ✅ 必生成 | ⛔ 默认跳过 |
| 05 | 美术资产需求表 | `asset-list` | ASSET + SPACE | 表格 HTML | ✅ 必生成 | ✅ 必生成 |
| 06 | 氛围参考 | `atmosphere-ref` | FEEL + SPACE + FLOW | 提示词表格 HTML | ✅ 必生成 | ❓ 询问确认 |
| 07 | 核心流程分镜 | `storyboard` | FLOW + FEEL + SPACE | 提示词表格 HTML | ✅ 必生成 | ✅ 必生成 |
| 08 | 灯光需求表 | `lighting-req` | FEEL + SPACE | 表格 HTML | ✅ 必生成 | ❓ 询问确认 |
| 09 | 特效需求表 | `vfx-req` | ASSET + MECHANIC + FEEL | 表格 HTML | ✅ 必生成 | ❓ 询问确认 |
| 10 | 音频需求表 | `audio-req` | FEEL + SPACE + MECHANIC | 表格 HTML | ✅ 必生成 | ❓ 询问确认 |
| 11 | 程序需求文档 | `tech-req` | MECHANIC + SYSTEM + FLOW | 文档 HTML | ✅ 必生成 | ✅ 必生成 |

### bubble_chart 双模式说明

根据 `contract.yaml` v2.0 的 `mode_selection` 规则：
- **POI / MainMission / SideQuest** → `spatial_bubble` 模式：节点按情绪着色，沿用 template.html
- **OpenWorldEvent / 其他玩法类** → `gameplay_flow` 模式：节点按功能类型着色，使用 template_gameplay.html
- gameplay_flow 模式的渲染管线：`.mmd → mmdc → SVG → render_gameplay_flow.js → .html`
- 绘制规范参照 `contracts/flowchart_standards.md`（ISO 5807）

## 需生图 API 的模块处理方式

当前无生图 API 时，以下模块输出**结构化提示词表格**：

```html
<table class="prompt-table">
  <thead>
    <tr>
      <th>序号</th>
      <th>场景/节点</th>
      <th>画面描述</th>
      <th>情绪关键词</th>
      <th>构图建议</th>
      <th>生图提示词（English）</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>进入艺术馆 (b0n0)</td>
      <td>玩家推门进入一层大厅，环顾四周</td>
      <td>探索、好奇、低张力</td>
      <td>低角度仰拍，强调建筑空间感</td>
      <td>low angle shot, character entering grand art museum lobby, marble floor, high ceiling, ambient lighting, exploration mood, cinematic composition</td>
    </tr>
  </tbody>
</table>
```

当 API 可用后，提示词列直接调用生图 API，将结果嵌入为 `<img>` 标签。
