# InputProcessor — 设计方案 → 6 维度 IR 填充

> 本文档是 Claude Code 执行 InputProcessor 阶段的操作指南。
> 读取设计方案输入 → 对照 IR Schema → 逐维度提取 → 输出 ir_filled.json

## 输入

- 设计方案文件（文本/JSON/图片，格式不限）
- IR Schema：`contracts/ir_schema.json`

## 输出

- `ir_filled.json`：完整 6 维度 IR 实例
- 所有字段按 Schema 填充，无法确定的字段标记 `uncertainty_flags`

## 执行步骤

### 1. 读取输入文件

读取 `test_cases/{case_id}/input.*` 文件内容。

### 2. 提取元信息

填充顶层字段：
- `level_id`：从文件名或内容推断，格式 `{type}_{location}_{序号}`
- `level_name`：标题或名称
- `type`：POI / MainMission / SideQuest / OpenWorldEvent
- `version`："1.0.0"
- `last_modified`：当前时间
- `last_modified_by`："input_processor"

### 3. 逐维度提取

对每个维度，从输入中提取对应信息：

#### SPACE（空间）
- `regions`：区域列表（id, name, function, connections, spatial_notes）
- `critical_path`：主路径区域序列
- `environment_type`：室内/室外/混合
- **如果输入无具体空间信息**（如纯玩法文档）：标记 uncertainty，填充推断值

#### FLOW（流程）
- `nodes`：流程节点列表（id, name, type, description, region）
- `edges`：节点连接（from, to, condition, type, label）
- `critical_path`：关键路径节点序列
- **核心要求**：必须有 type=start 和 type=end 的节点

#### FEEL（体验）
- `emotional_beats`：每个节点的情绪类型和强度
- `overall_tone`：整体基调
- **情绪类型参考**：tension_low, tension_high, tension_spike, relief, wonder, dread, excitement, calm

#### MECHANIC（机制）
- `mechanics`：玩法规则列表
- `ai_behaviors`：NPC/AI 行为
- `difficulty_parameters`：难度参数

#### ASSET（资产）
- `required_assets`：资产需求列表
- `reuse_candidates`：可复用资产

#### SYSTEM（系统）
- `dependencies`：依赖系统
- `interfaces`：接口需求
- `constraints`：技术约束

### 4. 标记不确定性

对于推断或缺失的字段，添加 `uncertainty_flags`：
```json
{
  "field": "SPACE.regions[0].spatial_notes",
  "note": "原始输入未描述具体空间尺度，此处为推断"
}
```

### 5. 记录来源引用

填充 `source_refs`：
```json
{
  "type": "document",
  "path": "test_cases/case_01_truck/input.txt",
  "summary": "动态货运卡车 Actor 玩法设计文档 v0.1"
}
```

### 6. 输出

将完整 IR JSON 写入 `test_cases/{case_id}/ir_filled.json`。

## 质量检查清单

- [ ] 所有 6 个维度对象都存在（即使内容为空数组）
- [ ] 有 type=start 和 type=end 的 FLOW 节点
- [ ] FLOW.edges 的 from/to 都引用存在的节点 ID
- [ ] FEEL.emotional_beats 的 node 引用存在的 FLOW 节点 ID
- [ ] uncertainty_flags 覆盖了所有推断/缺失的字段
- [ ] source_refs 记录了输入来源

## 关键原则

1. **不区分输入类型** — 玩法文档和关卡 POI 统一填 6 维度 IR
2. **尽力填充** — 能提取的尽量提取，不能确定的标 uncertainty
3. **不编造** — 推断可以，但不凭空捏造具体数值或细节
4. **保持 ID 一致性** — 节点 ID 在 FLOW/FEEL/SPACE 之间必须互相引用正确
