# Skill Router — IR 裁剪 → 5 槽位组装 → Skill 执行

> 本文档是 Claude Code 执行 Router 阶段的操作指南。
> 读取 contract.yaml → 裁剪 IR → 组装运行上下文 → 调用 Skill → 输出产物

## 输入

- `ir_filled.json`：完整 6 维度 IR
- `contracts/skills/{skill}/contract.yaml`：目标 Skill 的契约
- `contracts/skills/{skill}/template.html`：产物 HTML 模板（agent 填数据不造结构）
- `outputs/{case_id}/manifest.json`：模块状态（跳过已锁定模块）

## 输出

- Skill 产物文件（self-contained HTML），写入 `outputs/{case_id}/`
- 更新 manifest.json 中对应模块的状态和哈希

## 执行步骤

### 0. Manifest 检查

读取 `manifest.json`，检查目标模块状态：
- `locked` / `confirmed`：**跳过不生成**，打印"模块已锁定 vX"
- `pending` / `generated`：继续执行

### 1. 读取契约

从 `contract.yaml` 提取：
- `input.ir_fields_required`：需要的 IR 字段路径列表
- `output.format`：输出格式
- `quality.auto_checks`：质量检查规则
- `runtime_context`：5 槽位预算
- `mode_selection`（如有）：根据 IR 字段自动选择模式

### 2. 裁剪 IR

按 `ir_fields_required` 从 `ir_filled.json` 中提取子集：
- 只提取声明的字段，其他维度完全不可见
- 保留字段的完整结构（不做进一步精简）

### 3. 组装 5 槽位上下文

| 槽位 | 内容 | 预算 | MVP 状态 |
|------|------|------|----------|
| Slot 1 | System Prompt（Skill 角色 + 输出格式 + 约束） | ~1K | 内联 |
| Slot 2 | IR 子集（裁剪后的字段） | ~1-2K | 从 IR 提取 |
| Slot 3 | HTML 模板（template.html）| ~5-15K | 从 contracts 读取 |
| Slot 4 | 知识库 RAG 检索结果 | 0-2K | **MVP 跳过** |
| Slot 5 | 示例（输入输出对） | 0-1K | 可选 |

### 3.5 模板变体选择（强制） [v2.3 新增]

在读取模板前，必须执行以下检查：

1. 读取 contract.yaml 的 `mode_selection`（如有）
2. 检查 IR.type 是否属于 `GAMEPLAY_TYPES`（OpenWorldEvent / OpenWorldChallenge）
3. 如果是 gameplay 类型 → 检查是否存在 `template_gameplay.html`
4. 选择正确模板路径后再继续

⛔ **禁止默认读取 template.html 而不检查变体。**

`fill_template.js` 的 `resolveTemplatePath()` 已实现此逻辑，LLM 手动生成时也必须遵循。

### 3.6 HITL 确认检查 [v2.3 新增]

读取 contract.yaml 中标记 `confidence: "needs_confirm"` 的字段：
- 这些字段在自动填充后标记为 `[待确认]`
- 展示待确认项列表，暂停等待用户确认
- 用户确认/修改后继续生成

### 4. 执行 Skill

将组装好的上下文作为 prompt，生成产物。
- **模板化生成**：读取模板（注意变体选择），按 IR 数据填充 `{{placeholder}}`，不自造 CSS/HTML 结构
- 输出写入 `outputs/{case_id}/{module_key}.html`

### 5. 后处理

- 计算产物文件 SHA-256 哈希
- 更新 manifest.json：status → `generated`，file_hash，generated_at，ir_version_used

---

## BubbleChart Skill 专用指引

### 双模式选择

BubbleChart v2.0 根据 `IR.type` 自动选择模式：

| IR.type | 模式 | 着色方式 | 模板 |
|---------|------|----------|------|
| POI / MainMission / SideQuest | `spatial_bubble` | 情绪着色 | template.html |
| OpenWorldEvent / 其他玩法类 | `gameplay_flow` | **功能类型着色** | template_gameplay.html |

### gameplay_flow 模式

**功能类型着色（非情绪着色）：**

| 功能类型 | classDef 名称 | 填充色 | 边框色 |
|----------|--------------|--------|--------|
| 起始/终止 | state_neutral | #F5F5F5 | #999 |
| 事件触发 | event_trigger | #F3E5F5 | #9C27B0 |
| 条件判断 | condition | #E8F5E9 | #4CAF50 |
| 玩家操作 | player_action | #FFF8E1 | #FF9800 |
| 系统响应 | system_action | #E3F2FD | #2196F3 |
| 失败 | failure | #FFF3E0 | #FF9800 |
| 强制中断 | forced_exit | #FFEBEE | #F44336 |

**节点形状规则：**
- 起止节点用 stadium 形（圆角胶囊）
- 判断节点用菱形，必须 ≥2 个出口（成功+失败），且每个出口有条件标签
- 主路径实线箭头，失败/重试虚线箭头
- 节点数超过 15 个应合并同类或拆分子流程

**渲染管线（v2.0 — Mermaid）：**
```
IR.FLOW → render_gameplay_flow.js (生成 .mmd → mmdc 渲染 SVG) → bubble_chart.html
```

渲染器从 `ir_filled.json` 的 FLOW 维度读取节点和边，生成 Mermaid flowchart 语法 `.mmd` 文件，
调用 `mmdc`（Mermaid CLI）渲染为 SVG，包装进自包含 HTML。

**依赖：** `mmdc`（`npm install -g @mermaid-js/mermaid-cli`）

**执行命令：**
```bash
node pipeline/render_gameplay_flow.js outputs/{case_id}
```

### spatial_bubble 模式

沿用 v1 的情绪着色逻辑：
- 节点按 `FEEL.emotional_beats` 中的 emotion 字段着色
- 颜色映射：calm=#F5F5F5, wonder=#F3E5F5, tension_low=#E8F5E9, tension_high=#FFF3E0, tension_spike=#FFEBEE, relief=#E3F2FD, excitement=#FFF8E1, dread=#FCE4EC

### IR 字段需求

**gameplay_flow 模式：**
- `level_id`, `level_name`, `type`
- `FLOW.nodes`, `FLOW.edges`, `FLOW.critical_path`
- `MECHANIC.mechanics`（边标签引用）

**spatial_bubble 模式：**
- `level_id`, `level_name`
- `FLOW.nodes`, `FLOW.edges`, `FLOW.critical_path`
- `FEEL.emotional_beats`

---

## SpatialLayout Skill 专用指引

### 外部数据依赖

SpatialLayout 不仅依赖 IR，还需要外部数据文件 `layout_data.json`（LevelCraft 2D 导出）。

**执行前检查：**
1. 检查 `test_cases/{case_id}/layout_data.json` 或 `outputs/{case_id}/layout_data.json` 是否存在
2. 不存在 → 跳过此模块，状态设为 `skipped`，原因："layout_data.json 不存在"
3. 存在 → 读取并验证 JSON 有效性

**生成步骤：**
1. 读取 `template.html`
2. 读取 `layout_data.json` 完整内容
3. 从 layout JSON 计算统计数据（楼层数、房间数、门数、窗数）
4. 填充模板占位符：
   - `{{level_name}}` ← IR.level_name
   - `{{level_id}}` ← IR.level_id
   - `{{floor_count}}` ← layers 中 showWalls=true 且非屋顶的层数
   - `{{room_count}}` ← shapes 中非楼梯的数量
   - `{{door_count}}` ← 所有 shapes 的 strokeExclusions 总数
   - `{{window_count}}` ← 所有 shapes 的 strokeWindows 总数
   - `{{environment}}` ← IR.SPACE.environment_type
   - `{{timestamp}}` ← 当前时间
   - `{{LAYOUT_JSON}}` ← layout_data.json 的完整 JSON 字符串
5. 输出 `outputs/{case_id}/spatial_layout.html`

**注意：** 此模块的 HTML 通过 CDN 加载 Three.js 实现 3D 预览。2D SVG 视图始终可用（无需网络）。

---

## 文档组装

所有模块生成完毕后，执行组装脚本生成完整关卡设计文档：

```bash
node pipeline/assemble_document.js outputs/{case_id}
```

组装脚本功能：
- 读取 manifest.json 获取模块列表和状态
- 从 ir_filled.json 读取 Hero 元信息
- 从各模块 HTML 提取 `<style>` + `<section>` 内容
- 合并 CSS + 固定侧边导航 + Hero 封面 + 模块 sections
- 输出 `assembled_document.html`

---

## 质量检查（生成后执行）

按 contract.yaml 的 `quality.auto_checks` 逐项验证：
1. `node_coverage`：输出节点集 == 输入 FLOW.nodes 节点集
2. `mermaid_syntax_valid`：生成的 .mmd 语法正确，mmdc 渲染成功且 SVG 非空（仅 gameplay_flow 模式）
3. `start_end_present`：包含 start 和 end 类型节点
4. `node_count_warning`：节点数 ≤ 15（超过则警告，参照 flowchart_standards.md）
5. `node_function_coloring`：节点颜色按功能类型映射（gameplay_flow）或情绪映射（spatial_bubble）
6. `critical_path_highlighted`：关键路径边有视觉区分
7. `condition_labels_present`：判断节点的每个出口都有条件标签（gameplay_flow）
