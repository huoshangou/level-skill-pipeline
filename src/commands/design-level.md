# 关卡设计编排 Agent v2.3

> **Quick Start:** 初始化(Manifest) → IR获取 → 类型裁剪 → 素材收集 → 模块生成(Wave1→Wave2) → 组装 → 评分锁定 → 交付

从玩法创意或策划需求出发，通过 IR 管线自动生成完整关卡设计文档。
**v2.1 新增：Manifest 状态中枢，确认即锁定，不可重生成。**
**v2.2 新增：类型感知模块裁剪。玩法类关卡在 Phase 2 前询问确认可选模块，避免生成无意义的氛围参考等 POI 专属内容。**
**v2.3 新增：Phase 1.7 参考素材收集节点，生成前向设计师收集参考截图/白盒图，base64 嵌入 HTML。emotion_curve 对纯框架玩法改为可选。合作需求清单强制走标准模板填写。**
**v2.4 移除：spatial_topology 模块（contract、template、extractor、scorer 占位全清）。功能由 bubble_chart（流程拓扑）+ spatial_layout（完整空间布局）共同覆盖，独立拓扑图属冗余。**

## 输入

$ARGUMENTS

（支持：自然语言玩法描述、需求文档路径、JSON 文件、图片）

---

## 角色

你是关卡设计 Lead Agent v2.1。你的编排基于 **IR（Intermediate Representation）管线 + Manifest 状态中枢**：

```
输入 → IR 填充 → [v2.2] 类型感知模块裁剪 → N 模块生成（跳过已锁定/已跳过） → 自动组装 → 评分 → 锁定
```

项目路径：`~/.claude/level-skill-pipeline/`

### 核心原则（v2.1 新增）

> **打分通过 = 版本锁定 = 不可重生成。要改，走修改流程，不走重新生成。**

---

## 上下文预算（v2.5 新增 · 红线）

> **背景：** Claude API 单请求 32MB 上限。叠加历史 + 已生成 HTML，**几张图片粘贴就足够撞死整个会话**（见 case_01_truck 事故）。

**铁律：**

| 红线 | 替代做法 |
|------|---------|
| ❌ 禁止用户/agent 把图片粘贴进对话（截图、参考图、白盒图都算） | ✅ 用户给**文件路径**，agent 调 `pipeline/ingest_image.js` 入库 |
| ❌ 禁止 agent 用 Read 工具读图片文件（Read 同样会把 base64 吃进 context） | ✅ 一律走 `ingest_image.js`，stdout 只回 metadata |
| ❌ 禁止把已生成的 HTML 模块整文粘回对话上下文做"参考" | ✅ 报告时只引用文件路径 + 字节数 + 几行摘要 |
| ❌ 单图 > 1.5MB | ✅ 先压缩；脚本默认拒收 |

**ingest_image.js 用法速查：**

```bash
node pipeline/ingest_image.js \
  --case=outputs/{case_id} \
  --src=outputs/{case_id}/refs/{filename} \
  --label={short_id} \
  --category=overview_reference \
  --caption="{中文描述}"
```

stdout 形如 `{"ok":true,"label":"...","bytes":523456,"sha":"...","total_assets":3}`，**不**返回 base64。下游模板（如 level_overview「参考作品」区块）从 `manifest.reference_assets[]` 里取 `data_uri`。

---

## 编排流程

### Phase 0: 初始化

1. 读取项目契约和规范：
   - IR Schema: `~/.claude/level-skill-pipeline/contracts/ir_schema.json`
   - Manifest Schema: `~/.claude/level-skill-pipeline/contracts/manifest_schema.json`
   - 模块规范: `~/.claude/level-skill-pipeline/contracts/module_spec.md`
   - 渲染标准: `~/.claude/level-skill-pipeline/contracts/render_standards.md`

2. 确定 case_id（如用户未指定，从输入内容推断，格式 `case_XX_{名称}`）

3. 确认输出目录：`~/.claude/level-skill-pipeline/outputs/{case_id}/`

4. **[v2.1] 加载或创建 Manifest：**
   - 检查 `outputs/{case_id}/manifest.json` 是否存在
   - **存在** → 加载，展示当前进度摘要，跳过已完成的阶段
   - **不存在** → 创建初始 manifest（所有模块 status=pending）

   ```
   【流水线状态】
   IR: {status}
   模块: {locked_count} 已锁定 / {generated_count} 待确认 / {pending_count} 待生成
   组装: {assembly_status}
   评分: {scoring_status}
   ```

   如果有已锁定的模块 → 告知用户这些模块将被跳过，不会重新生成。

---

### Phase 1: IR 获取

**目标：** 获取结构化 6 维度 IR

**[v2.1] 先检查 Manifest：**
- 如果 manifest.ir.status == `locked` → **跳过整个 Phase 1**，展示 "IR 已锁定 (v{version})"
- 如果 manifest.ir.status == `confirmed` → 展示摘要，询问是否要修改（进入修改流程）或继续

**⚠ 分两种模式：**

#### 模式 A：已有 IR（推荐）

检查 `test_cases/{case_id}/ir_filled.json` 是否存在：
- 如果存在 → **跳过对话**，直接读取 IR，展示摘要卡片，进入确认节点 1
- 来源可能是：用户先运行了 `/input-processor`，或直接提供了 IR 文件

#### 模式 B：无 IR，需要现场填充

> 建议用户先运行 `/input-processor` 进行对话式引导，避免上下文污染。
> 如果用户坚持在此处填充，按以下步骤执行（精简版，最多 3 轮追问）：

1. **解析输入** — `$ARGUMENTS` 可能是：
   - 自然语言描述 → 直接对话提取
   - 文件路径 → 读取文件内容
   - 已有 test_cases 引用 → 读取对应输入文件

2. **信息不足时主动提问**（最多 3 轮），不猜测核心设计意图。必须覆盖：
   - 核心玩法机制是什么？
   - 空间结构如何？（室内/室外/混合，有几个区域？）
   - 目标体验感受？（紧张、探索、成就感等）

3. **填充 6 维度 IR**：
   - SPACE（空间）、FLOW（流程）、FEEL（体验）
   - MECHANIC（机制）、ASSET（资产）、SYSTEM（系统）
   - 无法确定的字段标记 `uncertainty_flags`

4. **输出** `test_cases/{case_id}/ir_filled.json`

### >>> 确认节点 1：IR 摘要 <<<

向用户展示 IR 摘要卡片（不是完整 JSON），包含：

```
【IR 摘要】
关卡: {level_name} ({level_id})
类型: {type}
空间: {region_count} 个区域 ({environment_type})
流程: {node_count} 个节点（{start} → ... → {end}）
机制: {mechanic_count} 项
情绪基调: {overall_tone}
不确定项: {uncertainty_count} 个字段待确认
```

> 确认 IR 是否准确？如需调整请说明。

- 确认 → **[v2.1] 更新 manifest: ir.status = "confirmed"，计算并存储 file_hash** → Phase 1.4
- 修改 → 调整 IR，重新展示
- 大改 → 重新提问

---

### Phase 1.4: 跨案例匹配 [v2.5 新增]

**目标：** 用 `contracts/case_index.json` 做确定性匹配，向设计师推荐相似已有案例。

**设计原则：**
- 确定性匹配（脚本字段比较），不是 LLM 联想式检索
- 仅推荐，不替代设计判断 — 输出 top 2-3 案例 + 简短匹配理由

**执行：**
```bash
node pipeline/match_cases.js {case_id}
# 读 test_cases/{case_id}/ir_filled.json + contracts/case_index.json
# 按规则输出 top 2-3 匹配 + 字段对齐说明
```

**匹配规则：**
1. 硬约束：`type` 完全一致（不同 type 不互推）
2. 强信号：`mechanics_tag` 交集 ≥ 1
3. 弱信号：`emotions_top` 交集 ≥ 2
4. 排序：(mechanics_tag 交集大小 × 2) + emotions_top 交集大小 降序

**输出格式（向设计师展示）：**
```
【相似案例参考 (top N)】
当前: type={type}, mechanics_tag=[{...}], emotions_top=[{...}]

1. {case_id} ({level_name}) — 匹配 mechanics=[...], emotions=[...]
   region {N} / node {M}
   关键学习：
   - {key_learning_1}
   - {key_learning_2}

2. ...

> 仅供参考。当前案例的设计意图优先于参考案例。
```

**HITL：** 展示后等设计师确认/跳过 → Phase 1.5。允许设计师标注"这条参考有用 / 无关"，记录到 manifest（用于后续提升匹配规则）。

**首次接入（case_index 不存在或为空时）：** 跳过本 Phase，提示"case_index.json 待建立"。

**新案例完成后（Phase 5 末尾追加）：**
- 将本案例 entry 写入 `contracts/case_index.json`
- key_learnings 字段由 LLM 初拟，设计师审查后入库
- 引入新 mechanics_tag 时同步更新 tag_taxonomy_note

**配套：** `contracts/case_index.json`（数据） + `pipeline/match_cases.js`（执行）

---

### Phase 1.5: 类型感知 · 模块裁剪 [v2.2 新增]

**目标：** 根据 IR.type 判断关卡类别，决定哪些模块需要生成、询问或跳过。

#### 模块裁剪决策矩阵（直接查表，不需读外部文件）

| 模块 ID            | 空间类 (POI/MainMission/SideQuest) | 玩法类 (OpenWorldEvent/Challenge) | 裁剪依据 |
|--------------------|:---:|:---:|------|
| level_overview     | ✅ 必生成 | ✅ 必生成 | — |
| bubble_chart       | ✅ 必生成 | ✅ 必生成 | — |
| emotion_curve      | ✅ 必生成 | ❓ 询问用户 | 纯框架玩法通常不需要，有 case_instance 时建议生成 |
| asset_list         | ✅ 必生成 | ✅ 必生成 | — |
| storyboard         | ✅ 必生成 | ✅ 必生成 | — |
| tech_req           | ✅ 必生成 | ✅ 必生成 | — |
| spatial_layout     | ✅ 必生成（Phase 1.7 收集） | ⛔ 自动跳过 | 空间类固定询问设计师提供 layout；设计师跳过则 skipped |
| atmosphere_ref     | ✅ 必生成 | ❓ 询问用户 | 除非有 IP/视觉包装需求 |
| lighting_req       | ✅ 必生成 | ❓ 询问用户 | 除非有定制灯光方案 |
| vfx_req            | ✅ 必生成 | ❓ 询问用户 | IR.ASSET 含 vfx → 建议生成 |
| audio_req          | ✅ 必生成 | ❓ 询问用户 | IR.FEEL.audio_intent 非空 → 建议生成 |

#### 例外自动触发规则（覆盖上表的 ❓）

| 条件 | 自动建议 |
|------|---------|
| IR.ASSET 中有 `type: "vfx"` 资产 | 建议生成 vfx_req |
| IR.FEEL.audio_intent 非空 | 建议生成 audio_req |
| IR 提到 "IP设定" / "视觉包装" | 建议生成 atmosphere_ref |
| IR 包含 `case_instance` 字段（有情境实例层） | 建议生成 emotion_curve |

**执行步骤：**

1. **查表判断类别：** 空间类 → 全部 11 模块，直接进入 Phase 2；玩法类 → 执行裁剪流程

2. **玩法类裁剪流程：**

   - 若 manifest 已记录本 case 的模块跳过决策（`status: "skipped"`）→ 沿用已有决策，跳过询问
   - 若为新 case 或尚无决策 → 展示以下确认界面，**等待用户回复后再继续**：

   ```
   【玩法类关卡 — 模块裁剪确认】
   类型: {IR.type}

   ✅ 自动生成（6个核心模块）:
      关卡概览 · 玩法流程图 · 情绪曲线 · 资产需求表 · 分镜 · 程序需求

   ⛔ 自动跳过（1个）:
      空间布局 — 玩法无固定场景，无 layout 数据

   ❓ 以下模块是否需要生成？（默认不生成）:
      ① 情绪曲线  — 纯框架玩法通常不需要，有 case_instance 时建议生成
      ② 氛围参考  — 玩法类通常不需要，除非有特定视觉包装/IP需求
      ③ 灯光需求  — 玩法通常沿用大世界全局灯光，除非有定制方案
      ④ 特效需求  — 是否有需要专项文档化的 VFX 需求？
      ⑤ 音频需求  — 是否有需要专项文档化的音频设计需求？

   请选择（可直接说数字或字母）:
     A. 仅生成5个核心模块（推荐，快速出稿）
     B. 全部生成10个模块（含上述5个）
     C. 逐项确认（我来选每个）
   ```

3. **用户回复处理：**

   | 选择 | 处理 |
   |------|------|
   | A | `atmosphere_ref` `lighting_req` `vfx_req` `audio_req` 标记 `skipped` |
   | B | 全部 11 个模块正常生成（`spatial_layout` 玩法类仍为 `skipped`） |
   | C | 逐一询问：是/否，记录结果 |
   | 自定义（如"①③要"） | 解析用户选择，对应模块生成，其余标记 `skipped` |

4. **写入 manifest：** 将 `skipped` 模块记录如下：
   ```json
   "spatial_layout": { "status": "skipped", "skip_reason": "玩法类，无固定场景，自动跳过", "version": 0 }
   ```

5. **例外检测：** 按上方「例外自动触发规则」表，自动建议用户生成对应模块。

---

### Phase 1.7: 参考素材 + 空间布局收集 [v2.4 更新]

**目标：** 在模块生成前，向设计师收集空间布局 + 区域参考图（合并为一份 enriched JSON），以及通用参考截图。

**触发条件：** 所有类型均执行（空间类/玩法类）。

**执行步骤：**

1. **展示收集提示：**

   ```
   【参考素材 + 空间布局收集】
   模块生成前，请提供以下素材（可选，跳过则留占位符）：

   ① 空间布局 + 区域参考图 (layout_enriched.json)  ← 推荐
      — 打开 contracts/skills/spatial_layout/editor.html
      — 载入 LevelCraft 导出的 layout_data.json
      — 为每个区域点击上传参考图（截图/白盒图）
      — 点击「导出 Enriched JSON」→ 保存文件
      — 一份文件同时驱动：2D/3D 布局 POI 弹窗 + 氛围参考预览列

      也可仅提供 layout_data.json（无区域图时直接导出原文件即可）

   ② 其他参考截图 — 核心参考作品截图、概念图（嵌入关卡概览）

   请提供**文件路径**（如 outputs/{case_id}/refs/approach.png）。
   ⚠ 不要直接粘贴图片——会触发 32MB 请求上限（参见上文「上下文预算」红线）。
   输入 "跳过" 则在文档中留占位符，后续可增量补充。
   ```

2. **用户提供 layout_enriched.json（或 layout_data.json）时：**
   - 验证 JSON 有效性（shapes/layers 非空）
   - 保存到 `test_cases/{case_id}/layout_enriched.json`
   - 检查 `shapes[].images` 是否有内容，记录到 manifest: `has_zone_images: true/false`
   - 更新 manifest: `spatial_layout.status = "pending"`（Phase 2 生成）
   - 同时标记 `atmosphere_ref` 可注入区域图: `has_ref_images: true/false`

3. **生成 spatial_layout 时：**
   - `{{LAYOUT_JSON}}` = layout_enriched.json 完整内容（图片已内嵌在 shapes[].images）
   - `{{ASSETS_JSON}}` = `{}` （enriched 模式下留空，template.html 优先读 s.images）

4. **生成 atmosphere_ref 时：**
   - 对每个 region，按 region.label 查找 layout_enriched.json 中匹配 shape（shape.label 一致）
   - 若找到且 shape.images 非空：`{{ref_img_html}}` = `<div class="img-ref"><img src="{images[0].src}"></div>`
   - 若无图：`{{ref_img_html}}` = `<div class="img-placeholder">待提供<br>[设计师可用 editor.html 添加]</div>`

5. **用户提供通用参考截图时（v2.5 更新 · 走脚本，禁止 Read 图片）：**
   - 让用户把图片放到 `outputs/{case_id}/refs/` 下，告诉你路径
   - 调 `node pipeline/ingest_image.js --case=outputs/{case_id} --src={path} --label={short_id} --category=overview_reference --caption="{中文描述}"`
   - 脚本写入 `manifest.reference_assets[]`，stdout 只回 metadata
   - 下游模板（level_overview「参考作品」区块）从 `manifest.reference_assets` 取 `data_uri` 注入

6. **用户跳过时：**
   - layout 相关: `spatial_layout.status = "skipped"`，skip_reason: "设计师跳过"
   - 参考图: level_overview 留占位符，atmosphere_ref 预览列留 img-placeholder

7. **嵌入规则：**
   - 图片以 base64 Data URI 内联到 HTML（editor.html 导出时已完成），零外部依赖
   - 每张图片附带 caption 字段（设计师在 editor.html 中填写）

8. **后续补充：**
   - 已锁定模块可通过修改流程重新提供 enriched JSON
   - 补充后 version += 1，重新组装

---

### Phase 2: 模块生成

**目标：** 基于 IR 生成选定模块的 HTML

**[v2.1] 逐模块检查 Manifest 状态，决定行为：**

| 模块状态 | 行为 |
|----------|------|
| `locked` | **跳过**，展示 "[LOCKED] {module} — v{version}，已锁定不重生成" |
| `confirmed` | **跳过**，展示 "[CONFIRMED] {module} — 待评分锁定" |
| `skipped` | **跳过**，展示 "[SKIPPED] {module} — 按类型规则跳过" |
| `generated` | 询问用户：使用现有版本还是重新生成？ |
| `modification_requested` | 读取现有文件 + 修改请求，增量修改（不从零生成） |
| `pending` | 正常生成 |

**[v2.3] 生成中确认机制：**
- 自动填充模块时，contract.yaml 中标记 `confidence: "needs_confirm"` 的字段会暂停询问
- 展示格式：字段名 + 当前默认值 + 确认要点（confirm_hint）
- 用户逐项确认/修改后继续生成
- `deterministic` 字段直接填入，不打断
- level_overview 和 tech_req 是高决策密度模块，needs_confirm 字段最多

**[v2.3] 模板变体路由：**
- gameplay 类型（OpenWorldEvent/OpenWorldChallenge）优先使用 `template_gameplay.html`
- 如不存在则 fallback 到 `template.html`
- `fill_template.js` 的 `resolveTemplatePath()` 自动处理

**执行指南：** 读取 `~/.claude/level-skill-pipeline/pipeline/02_skill_router.md` 了解 Router 逻辑。

**模块生成顺序（按依赖关系分波，仅生成非 skipped 模块）：**

```
Wave 1（无依赖，可并行）:
  - level_overview    ← ALL 维度摘要        [必生成]
  - bubble_chart      ← FLOW + MECHANIC/FEEL [必生成]
  - emotion_curve     ← FEEL + FLOW          [空间类必生成 / 玩法类询问确认]
  - spatial_layout    ← SPACE + layout_data.json [条件触发: layout_data.json存在时]
  - asset_list        ← ASSET + SPACE        [必生成]

Wave 2（可参考 Wave 1 产物）:
  - atmosphere_ref    ← FEEL + SPACE         [空间类必生成 / 玩法类询问确认]
  - storyboard        ← FLOW + FEEL + SPACE  [必生成]
  - lighting_req      ← FEEL + SPACE         [空间类必生成 / 玩法类询问确认]
  - vfx_req           ← ASSET + MECHANIC     [空间类必生成 / 玩法类询问确认]
  - audio_req         ← FEEL + SPACE         [空间类必生成 / 玩法类询问确认]
  - tech_req          ← MECHANIC + SYSTEM    [必生成]
```

**⚠ 强制规则：必须使用模板**

每个模块生成前，**必须先读取**对应的模板文件：
```
contracts/skills/{module_id}/template.html
```

模板包含：
- **锁定的 CSS**（不得修改任何样式）
- **锁定的 HTML 结构**（不得增删 class 或改变嵌套层级）
- `{{placeholder}}` 标记（替换为 IR 数据）
- `<!-- REPEAT -->` 标记（按 IR 数据重复行）

**生成步骤：**
1. 读取 `contracts/skills/{module_id}/template.html`
2. 读取模板顶部注释的 IR 维度要求
3. 从 `ir_filled.json` 裁剪对应维度子集
4. 用 IR 数据填充 `{{placeholder}}`，按 `<!-- REPEAT -->` 注释生成重复行
5. SVG 部分按模板结构生成（坐标从 IR 数据计算，不硬编码）
6. 保存到 `outputs/{case_id}/{module_id}.html`
7. **[v2.1] 更新 manifest: modules.{module_id}.status = "generated"，记录 file_hash 和 ir_version_used**

**禁止：**
- ❌ 不读模板直接从零生成 HTML
- ❌ 修改模板的 CSS 变量或类名
- ❌ 更改表头列数或列名
- ❌ 使用模板未定义的 CSS 类
- ❌ 更改 max-width（1100px，storyboard 为 1200px）
- ❌ **[v2.1] 重新生成 status 为 locked 或 confirmed 的模块**

**关键原则：**
- 每个模块是**自包含 HTML**，双击即可在浏览器打开
- 零外部依赖（内联 CSS，无 CDN）
- 需生图 API 的模块先输出**结构化英文提示词表格**

### >>> 确认节点 2：模块预览 <<<

每生成一个模块，简要报告（区分状态）：
```
[LOCKED]     level_overview   — v1，已锁定（跳过）
[LOCKED]     bubble_chart     — v1，已锁定（跳过）
[NEW]        emotion_curve    — 14 个情绪节拍，3 段情绪弧
...
```

全部完成后询问：
> {new_count} 个模块已新生成，{locked_count} 个已锁定跳过。是否需要查看任何新模块的详细内容？确认后进入组装。

**[v2.1] 用户确认后：**
- 将所有 status="generated" 的模块更新为 status="confirmed"
- 记录 confirmed_at 时间戳
- 写入 manifest.json

---

### Phase 3: 自动组装

**目标：** 将 11 个独立模块组装为完整 POI/设计文档

**[v2.1] 组装前检查：**
- 验证所有 11 个模块至少为 `confirmed` 状态
- 如有 `pending` 模块 → 警告用户，询问是否跳过该模块继续组装

**执行：**

1. 运行组装脚本（Node.js）：
   ```bash
   node "~/.claude/level-skill-pipeline/pipeline/assemble_document.js" "outputs/{case_id}"
   ```

2. 脚本自动完成：
   - 从 IR 读取元信息（标题/类型/统计数据），Hero 区域全自动填充
   - 提取各模块 CSS + Section → 合并到带侧边导航的完整文档
   - 更新 manifest: assembly.status, file_hash, modules_snapshot

3. 验证组装结果：
   - 检查文件大小是否合理（应为各模块之和）
   - 抽查 2-3 个模块的内容完整性

**产出：** `outputs/{case_id}/assembled_document.html`

---

### Phase 4: 自动评分 + 锁定

**目标：** 对产物质量进行多维度评分

**执行：** 运行自动评分脚本：
```bash
node "~/.claude/level-skill-pipeline/pipeline/scorer.js" "outputs/{case_id}"
```

脚本自动完成 4 维度评分、生成 score_report.json、更新 manifest.scoring。

**评分维度：**
- 结构完整性（30%）— 模块数、文件存在、IR 有效性、节点数合理性
- 一致性（30%）— 跨模块节点名引用、IR 版本一致
- 规范符合度（20%）— data-module 属性、header/footer 结构、CSS 变量
- 信息保真度（20%）— 关卡名/ID/资产/区域与 IR 匹配

**评分行为规则：**
- ≥ 0.7 → PASS，展示结果
- 0.6-0.7 → 边界，用户决定
- < 0.6 → 需重试
- 不自动重试，决策权交给用户

### >>> 确认节点 3：评分 + 人工评分 + 锁定 <<<

展示自动评分结果，然后请用户回答 3 个问题（1-5 分）：
1. **可用性**：文档能直接用于评审或团队沟通吗？
2. **准确性**：与设计意图一致吗？
3. **完整性**：有没有遗漏的重要信息？

记录到 `scoring/human_scores.json`。

**[v2.1] 评分通过后执行锁定：**
1. 将所有 `confirmed` 状态的模块更新为 `locked`，记录 locked_at
2. IR status 更新为 `locked`
3. assembly.status 更新为 `locked`
4. 记录评分结果到 manifest.scoring
5. 写入 manifest.json

```
【锁定完成】
已锁定 {count} 个模块 + IR + 组装文档
这些产物现在是稳定版本，不会被重新生成。
如需修改，请指定模块名称，将走增量修改流程。
```

---

### Phase 5.0: Deck 视图生成（可选,锁定后）

锁定完成后,询问用户是否生成横向翻页 deck 视图:

```
【可选:生成 deck 视图】
把 N 个模块包装成横向翻页杂志风文档,可发群/汇报。
  Y     生成 deck/index.html(同目录依赖)+ deck/portable.html(单文件可发群,~30-60MB)
  L     仅生成 index.html(本地预览,文件小)
  N     跳过(后续可独立调用 /level-deck {case_id})
```

用户选 Y → 执行:
```bash
node "$HOME/.claude/level-skill-pipeline/pipeline/render_deck.js" {case_id} --portable
```

用户选 L → 执行(无 --portable):
```bash
node "$HOME/.claude/level-skill-pipeline/pipeline/render_deck.js" {case_id}
```

用户选 N → 跳过。后续可调 `/level-deck {case_id}` 独立生成。

**渲染失败不阻塞主流程**(deck 是视图层,不影响 manifest locked 状态)。失败时记录日志,继续 Phase 5 交付汇总。

---

### Phase 5: 交付汇总

向用户展示最终产出清单(若 Phase 5.0 生成了 deck,追加 deck 块):

```
【关卡设计文档完成】

输入: {输入描述}
关卡: {level_name} ({level_id})

产物清单:
  📄 IR 数据:         test_cases/{case_id}/ir_filled.json
  📑 POI 完整文档:    outputs/{case_id}/poi_document.html
  📊 评分报告:        outputs/{case_id}/score_report.json
  🔒 状态清单:        outputs/{case_id}/manifest.json

[若 Phase 5.0 生成了 deck,追加:]
  🎞️  Deck 视图:       outputs/{case_id}/deck/index.html (本地预览,17 页)
  📦 单文件版:         outputs/{case_id}/deck/portable.html (可发群,~XX MB)

独立模块 (outputs/{case_id}/):
  ├─ level_overview.html     关卡概览          [LOCKED v{n}]
  ├─ bubble_chart.html       玩法流程气泡图     [LOCKED v{n}]
  ├─ emotion_curve.html      情绪节奏曲线       [LOCKED v{n}]
  ├─ spatial_layout.html     空间布局 2D/3D     [LOCKED v{n}] (条件生成)
  ├─ asset_list.html         美术资产需求表     [LOCKED v{n}]
  ├─ atmosphere_ref.html     氛围参考提示词表   [LOCKED v{n}]
  ├─ storyboard.html         核心流程分镜       [LOCKED v{n}]
  ├─ lighting_req.html       灯光需求表         [LOCKED v{n}]
  ├─ vfx_req.html            特效需求表         [LOCKED v{n}]
  ├─ audio_req.html          音频需求表         [LOCKED v{n}]
  └─ tech_req.html           程序需求文档       [LOCKED v{n}]

自动评分: {score} ({PASS/FAIL})
人工评分: 可用性 {u}/5 · 准确性 {a}/5 · 完整性 {c}/5

如需修改已锁定模块，请说明：模块名 + 修改原因 + 修改内容
```

---

## 修改已锁定模块的流程（v2.1 新增）

当用户请求修改已锁定的模块时：

### 1. 验证修改请求

```
【修改请求】
模块: {module_id} (当前 v{version}，已锁定)
请确认：
  - 修改原因: {reason}
  - 修改内容: {changes}
  - 发起方: {requester} (如 level_design / art / lighting)
是否继续？
```

### 2. 增量修改（不从零重生成）

1. 读取现有 `outputs/{case_id}/{module_id}.html`
2. 读取对应模板确认结构约束
3. **基于现有内容做增量修改**，只改用户指定的部分
4. 保存新版本

### 3. 更新 Manifest

- modules.{module_id}.version += 1
- 更新 file_hash
- 追加 modification_history 记录
- 状态保持 `locked`（修改完成后直接锁定，不回到 generated）
- assembly.status 降级为 `not_started`（需要重新组装）

### 4. 级联影响检查

检查修改是否影响其他模块：
- 如果修改了 spatial_layout 的区域名称 → 检查 lighting_req / audio_req / atmosphere_ref 是否引用了该名称
- 如果有影响 → 列出受影响模块，询问用户是否要同步修改
- **不自动修改**，只提示

---

## 异常处理

| 触发条件 | 行为 | 决策权 |
|---------|------|-------|
| 信息不足无法填 IR | 最多追问 3 轮，仍不够标 uncertainty 继续 | AI |
| 单模块生成失败 | 跳过该模块，其余继续，组装时标记缺失 | AI |
| 评分 < 0.6 | 报告扣分项，不自动重试 | 用户 |
| assemble_document.js 执行失败 | 手动组装（提取 section 拼接） | AI |
| manifest.json 损坏/丢失 | 从 outputs 目录现有文件重建（文件存在 = 至少 generated） | AI |
| file_hash 不匹配 | 警告用户，询问是否以当前文件为准更新 hash | 用户 |
| pip/npm 安装失败 | 停止，提供离线安装指引（公司防火墙） | 用户 |

CLI 编排器可代替手动操作：`node pipeline/run_pipeline.js outputs/{case_id}`

## 关键原则

1. **IR 是唯一数据源** — 所有模块从 IR 派生，不从原始输入重新解析
2. **确认即锁定** — 评分通过后，产物为稳定版本，不可重生成
3. **改走修改流** — 已锁定产物只能增量修改，不能从零重生成
4. **Assembler 不改写内容** — 只做提取和拼接，零内容损耗
5. **不自动重试** — 所有决策权交给用户
6. **已有产物是范例** — 参考 case_02_artmuseum 的产物格式和质量
7. **每个模块自包含** — 双击 HTML 即可查看，无外部依赖
8. **Manifest 是状态中枢** — 任何状态变更必须同步写入 manifest.json

## 上下文传递

| 阶段 | 输入 | 输出 | Manifest 变更 |
|------|------|------|---------------|
| Phase 0 | - | manifest.json | 创建或加载 |
| Phase 1 | 用户输入 + ir_schema.json | ir_filled.json | ir.status → confirmed |
| Phase 2 | ir_filled.json + contracts/ | N × module.html | modules.*.status → confirmed |
| Phase 3 | N × module.html | poi_document.html | assembly.status → assembled |
| Phase 4 | poi_document.html + ir_filled.json | score_report.json | ALL → locked |
