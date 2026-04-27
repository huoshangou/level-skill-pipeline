# Changelog

---

## [2026-04-27] v2.5 — 知识盘补足（来自 ai-production-deepdive 诊断）

### 背景

通过 ai-production-deepdive 项目对 LevelAgent 做四盘诊断（约束 / 反馈 / 知识 / 进化），最弱板是知识盘（C+）。核心问题：跨案例知识断裂 + 项目根缺 CLAUDE.md（M1）+ 人工反馈源未启动（M6）。

配套理论文档：个人 wiki [[meta/思维框架/AI协作管线-四盘方法论]] + [[meta/工具与系统/AI协作管线-合格标准]]。

### 改动

1. **新增 `contracts/case_index.json` v0.1** — 跨案例知识索引，5 个已有案例字段化（type / mechanics_tag / emotions_top / region_count / node_count / key_learnings）。设计：确定性匹配，不靠 LLM 联想。
2. **新增 `pipeline/match_cases.js`** — 匹配脚本。规则：type 硬约束 + mechanics_tag 强信号（×2）+ emotions_top 弱信号。验证：case_05 ↔ case_02 互相 score=5。
3. **新增 `CLAUDE.md`** — 项目根 AI 入口指南（M1 必备）。引用 README + changelog + contracts，不重复内容。
4. **修改 `~/.claude/commands/design-level.md`** — 新增 Phase 1.4「跨案例匹配」（IR 确认后、类型裁剪前），调用 match_cases.js 输出 top 2-3 推荐。
5. **升级 `scoring/human_scores.json` v1.0 → v1.1** — 极简 schema（overall + notes + 元字段）+ 5 条空模板。设计：抗过早抽象，跑过 ≥3 条再上提维度。

### 影响

- 新案例输入将自动获得相似案例参考（Phase 1.4），减少重复设计踩坑
- 新 session AI 30 秒内能定位项目入口，减少自然语言文档接力的失真
- human_scores 启动是自愿动作，Steve 可后续抽时间填

### 下一步

- Steve 给 case_01-05 填 human_scores 基线（30 分钟，可分多次）
- design-level Phase 5 末尾追加「写入 case_index + human_scores 空模板」自动化步骤（待补 — 当前 Phase 1.4 仅做匹配读取，写入还是手动）
- 跑过 ≥3 条人工评分后审视是否需要固定维度

---

## [2026-04-14] Round 3 — HITL 确认机制 + 玩法类模板补全

### 背景
case_04_eavesdrop 端到端实战暴露 3 类系统性问题：LLM 越权填写需确认字段、模板缺少 gameplay 变体、裁剪粒度不足。

### 完成
- contract.yaml 增加 `confidence: needs_confirm` + `confirm_hint` 字段（level_overview, tech_req）
- 新建 `contracts/skills/level_overview/template_gameplay.html`（玩法变体模板）
  - 替换 POI 属性表为玩法基本信息（触发/完成/中止条件、复用性、参与人数）
  - 新增设计意图（含参考作品）、玩法机制说明、3C 需求表
  - 新增合作需求清单（对标 gen_gamedesign.js reqMap 11组22项标准模板）
  - 删除数据摘要、不确定项（用户反馈为 log 噪音）
- `fill_template.js` 新增模板变体路由 `resolveTemplatePath()`（gameplay → template_gameplay.html）
- `fill_template.js` 注册 `level_overview` 提取器，支持 POI/gameplay 双路径
- `fillModule()` 返回 `pendingConfirms` 数组 + `templateVariant` 字段
- `run_pipeline.js` Phase 3 处理 pendingConfirms：有待确认项时暂停，展示列表
- `select_modules.js` CONFIRM_MODULES 增加 `emotion_curve`（玩法类可选）
- `design-level.md` 裁剪矩阵 emotion_curve 改为 ❓ 询问用户，增加 case_instance 例外触发
- `02_skill_router.md` 增加 3.5 模板变体选择（强制）+ 3.6 HITL 确认检查

### 验证
- case_04 (OpenWorldEvent): gameplay 模板 ✓, 12 pendingConfirms ✓
- case_02 (POI): default 模板 ✓, 0 pendingConfirms ✓
- getSupportedModules(): [asset_list, level_overview] ✓

### 回退方式
- contract.yaml: 删除 confidence/confirm_hint 字段
- template_gameplay.html: 删除新文件
- fill_template.js / run_pipeline.js / select_modules.js: git checkout
- design-level.md / 02_skill_router.md: git checkout

---

## [2026-03-31] Step 1 - 搭建项目骨架

### 完成
- 创建 LevelAgent/ 完整目录结构
- 从 AgentWorkFlow 复制 ir_schema.json (v3.0) 和 bubble_chart/contract.yaml (v1.0)
- 复制两个测试用例输入文件（卡车玩法 + 好莱坞艺术馆 POI）
- 创建 README.md（项目说明 + 后续路线表）
- 创建 render_standards.md（从 v4.html 提取的统一视觉语言）
- 创建本 changelog.md

### 决策
- 项目独立于 AgentWorkFlow，放在 `Desktop/My Ai Work/LevelAgent/`
- 渲染标准采用 v4.html 的浅色系设计语言（非 v3 的深色系）
- 玩法文档和关卡 POI 文档不做类型区分，统一填 6 维度 IR
- Claude Code 充当编排器（测试阶段无 API）

### 未完成/已知问题
- pipeline/ 下的 3 个阶段 prompt 尚未编写
- scoring/ 下的评分规则尚未定义
- ir_filled.json 尚未生成

### 下一步
- Step 2: 编写 01_input_processor.md，用两个测试用例填充 IR

---

## [2026-03-31] Step 2 - InputProcessor + IR 填充

### 完成
- 编写 pipeline/01_input_processor.md（InputProcessor 执行指南）
- case_01_truck: 卡车玩法 → ir_filled.json（14个FLOW节点，SPACE为概念性区域）
- case_02_artmuseum: 好莱坞艺术馆 → ir_filled.json（17个FLOW节点，6个SPACE区域）
- 两个 IR JSON 均通过语法校验

### 决策
- 卡车玩法的 SPACE 维度使用概念性区域划分（接近区域/接入区域/搭载状态），因为开放世界动态事件没有固定空间
- 艺术馆的 FLOW 节点保持与输入 JSON 的 beats[].nodes 完全一致的 ID 命名
- uncertainty_flags 覆盖了所有推断/缺失字段

### 下一步
- Step 3: Skill Router + BubbleChart 生成

---

## [2026-03-31] Step 3 - Skill Router + BubbleChart 生成

### 完成
- 编写 pipeline/02_skill_router.md（Router 执行指南 + BubbleChart 专用指引）
- case_01_truck: bubble_chart.mmd（14节点，含失败/loop回退路径）
- case_02_artmuseum: bubble_chart.mmd（17节点，含可选潜行路线）
- 情绪颜色映射：6种情绪 → 6种颜色
- 关键路径用 ==> 粗线，可选路径用 -.-> 虚线

### 决策
- Mermaid flowchart TD 语法（自上而下），非 LR
- 颜色映射采用浅色系（与 v4 渲染标准一致）
- 卡车案例的 loop 回退路径用 `-. "文字" .->` 语法

### 下一步
- Step 4: 评分框架 + 自动评分

---

## [2026-03-31] Step 4 - 评分框架 + 自动评分

### 完成
- 创建 scoring/auto_rubric.json（4维度 × 14项检查）
- 编写 pipeline/03_scorer.md（评分执行指南）
- case_01_truck 自动评分: 0.97（PASS）
- case_02_artmuseum 自动评分: 0.97（PASS）
- 初始化 scoring/human_scores.json
- 两个案例唯一扣分项：节点数超过12个建议上限（warning级别）

### 决策
- 节点数 > 12 仅为 warning 不是 error，因为真实设计确实需要这么多节点
- 不自动重试，所有决策权交给用户
- 人工评分 3 问题：可用性/准确性/完整性（1-5分）

### 未完成/已知问题
- 人工评分尚未收集（等待用户打分）
- Mermaid 渲染未实际验证（需要用户在 mermaid.live 或类似工具中粘贴检查）

### 下一步
- 用户审查两个 BubbleChart，打人工评分
- 确认最小循环是否跑通
- 跑通后进入 Phase 2（+AssetList Skill）

---

## [2026-03-31] 产物架构升级 - 自包含 HTML 模块 + 可组装模式

### 完成
- 将 BubbleChart 产物从 .mmd（需粘贴渲染）改为自包含 HTML（双击即看）
- 创建 contracts/module_spec.md（产物模块规范）
- 定义 12 个模块类型 + 组装顺序 + IR 维度映射
- 定义需生图 API 模块的提示词表格格式
- 生成 case_02_artmuseum/bubble_chart.html 示范文件

### 决策
- 所有产物模块统一为自包含 HTML，零外部依赖
- `<section class="module" data-module="..." data-level-id="...">` 作为组装标记
- Assembler 未来可从多个模块 HTML 中提取 section 组合成完整 POI 文档
- 需生图 API 的模块（氛围图/分镜）先输出结构化提示词表格（含英文 prompt）
- .mmd 文件保留作为原始数据，HTML 作为可视化产物

### 未完成/已知问题
- case_01_truck 的 HTML 版本尚未生成
- Assembler（组装器）尚未实现
- 其余 11 个模块类型尚未开发

### 下一步
- 用户审查 bubble_chart.html 的渲染效果和交互体验
- 确认模块规范后，开发下一个模块（AssetList 或 EmotionCurve）

---

## [2026-03-31] Phase 2 - 多模块开发 + Assembler

### 完成
- AssetList contract + HTML 产物（资产需求表，按类型分组，含统计摘要）
- EmotionCurve contract + HTML 产物（纯 SVG 情绪曲线 + 数据表格）
- AtmosphereRef contract + HTML 产物（8个场景的结构化生图提示词表格）
- POI Document Assembler 原型（4个模块组装成完整文档，含导航栏）

### 产物清单 (case_02_artmuseum/)
| 文件 | 模块 | 说明 |
|------|------|------|
| bubble_chart.html | 独立 | 玩法流程气泡图 |
| asset_list.html | 独立 | 美术资产需求表 |
| emotion_curve.html | 独立 | 情绪节奏曲线 |
| atmosphere_ref.html | 独立 | 氛围参考提示词表 |
| poi_document.html | 组装 | 4模块组装的完整 POI 文档 |
| bubble_chart.mmd | 原始数据 | Mermaid 源文件（保留） |
| score_report.json | 数据 | 自动评分报告 |

### 决策
- EmotionCurve 用纯 SVG 绘制折线图，零依赖
- AtmosphereRef 输出完整英文 prompt，待 API 可用后直接调用
- Assembler 目前是手动组装（将各模块内容嵌入 POI 模板），未来可脚本化
- POI 文档左侧导航栏的"待开发"模块显示为灰色占位

### 未完成/已知问题
- case_01_truck 只有 BubbleChart，其余模块未生成
- 空间拓扑图、灯光/特效/音频需求表、程序需求文档尚未开发
- Assembler 目前是手动复制粘贴，后续需脚本化

### 下一步
- 用户审查 poi_document.html 组装效果
- 按优先级开发剩余模块
- 考虑为 case_01_truck 生成完整模块集

---

## [2026-03-31] Assembler 修复 - 零损耗组装

### 问题
- 首版 poi_document.html 手动组装时内容减损严重
- EmotionCurve: 丢了完整14行数据表格
- AtmosphereRef: 8个场景只保留了4个，丢了办公区和二层展厅
- BubbleChart: 节点标签被缩短

### 修复
- 创建 `pipeline/assemble_poi.py` 脚本
- 脚本从各独立模块 HTML 中提取完整 `<section class="module">` 内容
- 原封不动嵌入 POI 文档模板，零内容损耗
- 合并各模块 CSS 样式
- 验证结果：emotion 14行 / atmosphere 8场景 / asset 6项 / bubble 17节点 全部完整

### 规则（写入 Assembler 规范）
- **Assembler 永远不改写模块内容** — 只做提取和拼接
- 各模块的 `<section class="module">` 是组装的原子单位
- CSS 样式简单合并（允许重复声明，浏览器用最后一个）

### 下一步
- 用户验证 poi_document.html v1.1 的内容完整性
- 后续新增模块只需：1)写独立HTML → 2)重跑 assemble_poi.py

---

## [2026-04-01] 全模块补全 - 11 个模块完成

### 完成
- 新增 7 个模块（全部用 case_02_artmuseum IR 驱动）：
  1. **level_overview** — 关卡概览卡片（全维度摘要 + 不确定项清单）
  2. **spatial_topology** — 空间拓扑图（纯SVG 6区域拓扑 + 区域数据表）
  3. **lighting_req** — 灯光需求表（6区域灯光方案 + 6个转场节点）
  4. **vfx_req** — 特效需求表（7项特效 + 性能注意事项）
  5. **audio_req** — 音频需求表（7段BGM + 9项SFX + 6区域环境音）
  6. **tech_req** — 程序需求文档（3系统依赖 + 15状态节点状态机 + 4技术约束 + 7数据配置项）
  7. **storyboard** — 核心流程分镜（10帧分镜 + 结构化英文生图prompt）
- 更新 assemble_poi.py 模块列表，重新组装
- poi_document.html: 11模块 / 126KB / 零内容损耗

### 当前产物完整清单 (case_02_artmuseum)
| # | 模块 | data-module | 独立文件 | 内容量 |
|---|------|------------|---------|--------|
| 1 | 关卡概览 | level-overview | level_overview.html | 全维度摘要 |
| 2 | 玩法流程气泡图 | bubble-chart | bubble_chart.html | 17节点 |
| 3 | 情绪节奏曲线 | emotion-curve | emotion_curve.html | SVG图表+14行数据 |
| 4 | 空间拓扑图 | spatial-topology | spatial_topology.html | SVG拓扑+6区域表 |
| 5 | 资产需求表 | asset-list | asset_list.html | 6资产 |
| 6 | 氛围参考 | atmosphere-ref | atmosphere_ref.html | 4区域8场景prompt |
| 7 | 核心分镜 | storyboard | storyboard.html | 10帧分镜prompt |
| 8 | 灯光需求表 | lighting-req | lighting_req.html | 6区域+6转场 |
| 9 | 特效需求表 | vfx-req | vfx_req.html | 7特效+性能注意 |
| 10 | 音频需求表 | audio-req | audio_req.html | 7BGM+9SFX+6环境 |
| 11 | 程序需求 | tech-req | tech_req.html | 3系统+15状态+7配置 |

### 下一步
- 用户验证完整 POI 文档（11模块组装）
- 升级编排器（/design-level v2）接入 IR 管线
- 开发对话式 InputProcessor

---

## [2026-04-01] 编排器 V2 — /design-level 接入 IR 管线

### 完成
- 重写 `/design-level` skill（`~/.claude/commands/design-level.md`）
  - 旧版：概念卡 → bubble-diagram → 数值设计 → xlsx
  - V2：输入 → IR 填充 → 11 模块生成 → 自动组装 → 评分
- 5 阶段编排流程：初始化 → IR 填充 → 模块生成（2 波次） → 组装 → 评分
- 3 个人工确认节点：IR 摘要、模块预览、评分+人工评分
- 升级 `assemble_poi.py` v2.0
  - 从 IR 自动读取元信息（标题、类型、统计数据），hero 区域不再硬编码
  - 自动检测 ir_filled.json 位置
  - 支持多种关卡类型标签（POI/MainMission/SideQuest/OpenWorldEvent）
  - 缺失模块自动列入"待开发"导航栏
- 验证：case_02_artmuseum 组装成功，11 模块 130KB

### 决策
- V2 不再调用外部 `/bubble-diagram` 或 `/强效版Bubble-diagram` skill，内建生成
- assemble_poi.py 保持通用性，不写死任何关卡信息
- 编排器内引用 pipeline/*.md 作为执行指南，保持一致性

### 下一步
- 用新编排器跑一个全新案例验证端到端流程
- 开发对话式 InputProcessor（Phase 7）
- case_01_truck 多模块生成

---

## [2026-04-01] case_01_truck 全模块补全

### 完成
- 为卡车案例生成全部 11 个模块 HTML（之前只有 bubble_chart.mmd）
- 新增 bubble_chart.html（纯SVG流程图，替代 .mmd 需粘贴渲染的方式）
- 使用 v2 assembler 组装完整文档：177KB / 11 模块 / 零内容损耗
- Assembler 正确从 IR 读取元信息：type=OpenWorldEvent，动态统计数据

### 产物清单 (case_01_truck/)
| # | 模块 | 文件 | 内容量 |
|---|------|------|--------|
| 1 | 关卡概览 | level_overview.html | 全维度摘要 |
| 2 | 玩法流程气泡图 | bubble_chart.html | 14节点纯SVG |
| 3 | 情绪节奏曲线 | emotion_curve.html | SVG图表+14行数据 |
| 4 | 空间拓扑图 | spatial_topology.html | SVG拓扑+5概念区域 |
| 5 | 资产需求表 | asset_list.html | 4资产 |
| 6 | 氛围参考 | atmosphere_ref.html | 6场景prompt |
| 7 | 核心分镜 | storyboard.html | 8帧分镜prompt |
| 8 | 灯光需求表 | lighting_req.html | 5区域+4转场 |
| 9 | 特效需求表 | vfx_req.html | 5特效+性能注意 |
| 10 | 音频需求表 | audio_req.html | 3BGM+6SFX+3环境 |
| 11 | 程序需求 | tech_req.html | 4系统+14状态机+6配置 |

### 下一步
- 开发对话式 InputProcessor

---

## [2026-04-01] 模板化架构 — 11 个模块 HTML 模板

### 问题
- 卡车案例模块与 artmuseum 格式不一致（CSS 变量不同、表头列数不同、组件风格各异）
- 根因：subagent 没有读取参考文件，仅靠文字描述生成 HTML，导致样式漂移不可控

### 解决方案
- 方案 A（模板化）：从 artmuseum 产物提取 CSS+HTML 模板，agent 只填数据不造结构
- 为每个模块创建 `contracts/skills/{module}/template.html`

### 完成
- 11 个模板全部创建，保留 artmuseum 的完整 CSS 和 HTML 结构
- 数据位用 `{{placeholder}}` 标记，重复行用 `<!-- REPEAT -->` 注释
- 每个模板顶部注释块列出：模块类型、所需 IR 维度、结构规则
- 关键约束已锁定：
  - CSS 变量统一（--border:#111111 不是 #E0E0E0）
  - max-width 统一 1100px（storyboard 为 1200px）
  - 字体统一 'Noto Sans SC'
  - bubble_chart 用 CSS Flexbox 布局（不是 SVG 硬编码坐标）
  - lighting_req 表头固定 8 列

### 模板清单
| 模块 | 模板大小 | 关键约束 |
|------|---------|---------|
| level_overview | 10KB | 属性表+3体验卡+不确定项表 |
| bubble_chart | 15KB | Beat-section 布局，不用 SVG 坐标 |
| emotion_curve | 9KB | SVG 折线图 920x280 |
| spatial_topology | 10KB | SVG 拓扑 720x560 |
| asset_list | 7KB | 按类型分表+复用候选 |
| atmosphere_ref | 7KB | 提示词表 7 列 |
| storyboard | 6KB | 2列卡片网格 (max-width:1200px) |
| lighting_req | 6KB | 区域表 8 列+转场表 4 列 |
| vfx_req | 5KB | 特效表 8 列+性能表 3 列 |
| audio_req | 7KB | BGM 8 列+SFX 6 列+环境 3 列 |
| tech_req | 8KB | 系统表+状态机+约束表+配置表 |

### 下一步
- 更新编排器 /design-level 引用模板
- 用模板重新生成 case_01_truck（验证一致性）
- 开发对话式 InputProcessor

---

## [2026-04-01] 对话式 InputProcessor — 独立 /input-processor command

### 架构决策

**问题：** InputProcessor 放在编排器内还是独立？

**分析：**
1. **上下文污染** — 对话引导（5-10轮追问）+ IR 填充的上下文对后续模块生成毫无价值，留在编排器的 session 里只是噪音。编排器越到后面的模块生成质量越差。
2. **RAG 集成** — 对话引导时需要检索已有案例知识库做联想提示，这个检索逻辑和模块生成无关，放在同一 session 增加复杂度。

**决策：独立 command（`/input-processor`）**
- 理由：上下文干净，职责分离，RAG 有独立扩展空间
- `/input-processor` 只做对话→IR，输出 `ir_filled.json` 落盘
- `/design-level` 的 Phase 1 检测已有 IR → 直接跳过对话，从 Phase 2 开始
- 备选方案（编排器内置、subagent）因上下文污染风险被否决

### 完成
- 创建 `~/.claude/commands/input-processor.md`（对话式 IR 填充器）
  - 5 步对话流程：核心概念 → 空间+流程 → 体验+机制 → 资产+系统 → 检查输出
  - 每步有明确的提问模板和 IR 字段映射规则
  - 知识库联想：匹配已有案例的 type/mechanic/emotion 做设计参考
  - 最多 10 轮对话，超时则标 uncertainty 输出
  - 输出前做维度完整性 + 交叉引用检查
- 更新 `/design-level` Phase 1 支持双模式：
  - 模式 A：已有 IR → 跳过对话，直接展示摘要
  - 模式 B：无 IR → 建议先跑 /input-processor

### RAG 方案（MVP）
- 数据源：已有 2 个 ir_filled.json（artmuseum + truck）
- 匹配维度：type、mechanic 名称、emotion 基调
- 联想方式：提示用户已有相似案例，不自动复制数据
- 后续扩展：Phase 4 实现完整知识库检索

### 下一步
- 用 /input-processor 对话式重建卡车案例 IR
- 用重建的 IR + 模板化生成验证端到端一致性

---

## [2026-04-01] 端到端验证 — /input-processor → /design-level 全链路

### 完成
- 用 /input-processor 与用户对话重建卡车 IR v2.0（3 轮对话，9 个问题）
- IR 关键修正：
  - 删除 A/B/C 分档结算（用户从未设计）
  - 搭载改为固定移动平台（不能自由移动）
  - 离开方式统一为黑屏切换
  - 新增奖励获取机制（改装零件/货币/经验值，待数值确认）
  - 新增高光用途：追逐躲藏（警察丢失目标）+ 禁区突入（合金装备纸箱式）
  - 新增生成规则：特定路段、等级解锁、玩家中心、最多1辆、多人不刷
- 12 节点（原 14，删除结算和快速离开，新增接入/离开演出拆分）
- 用模板化方案重新生成 11 模块：142KB / 零损耗组装
- 模板约束验证：max-width 1100px（storyboard 1200px）、8 列灯光表、CSS 变量统一

### 验证结论
- /input-processor 对话式引导有效，3 轮对话补齐了 9 个关键设计缺口
- 模板化生成消除了 CSS/HTML 结构漂移
- 端到端管线：对话→IR→模板填充→组装 跑通

---

## [2026-04-01] Manifest 状态中枢 — 确认即锁定，不可重生成

### 背景

讨论关卡 Agent 的稳定性问题：多阶段流水线中，已确认的模块在后续操作中可能被意外重生成，导致内容不一致。从三个维度分析需求：

1. **接收端（美术/程序/灯光/特效）**：下游角色需要从同一份数据源获取一致信息，不应出现同一个区域在 lighting_req 和 spatial_topology 里描述不同
2. **发起端（关卡策划）**：评分通过后仍需支持局部迭代，但不能破坏已锁定的稳定版本
3. **过程中新增内容**：AI 辅助生成的新产物（如基于截图的氛围图）需符合已有 IR 约束

### 核心原则

> **打分通过 = 版本锁定 = 不可重生成。要改，走修改流程，不走重新生成。**

### 完成

- 创建 `contracts/manifest_schema.json`（Manifest 状态中枢 schema）
  - 模块状态机：`pending → generated → confirmed → locked`
  - 锁定后修改：`locked → modification_requested → modifying → locked[v+1]`
  - 每个模块记录 `file_hash`（SHA-256）+ `ir_version_used` + `modification_history`
  - 组装快照 `modules_snapshot`：记录组装时各模块版本+哈希，检测组装产物是否过期
  - `review_log` 字段预留（群聊/看板审核需求，暂不实现）

- 升级 `/design-level` 编排器至 v2.1
  - Phase 0：加载/创建 manifest，展示流水线进度，跳过已完成阶段
  - Phase 1：IR 已锁定时整个 Phase 跳过
  - Phase 2：逐模块检查状态，`locked`/`confirmed` 直接跳过不重生成
  - Phase 4：评分通过后执行全量锁定（IR + 所有模块 + 组装文档）
  - 新增：修改已锁定模块的完整流程（增量修改 + 级联影响检查）
  - 新增禁止项：不可重新生成 locked/confirmed 模块

- 为 case_02_artmuseum 生成示范 `manifest.json`
  - 11 个模块全部 locked（v1），IR locked（v1.0.0）
  - 所有 file_hash 从实际文件计算（SHA-256）
  - 评分记录：auto_score 0.97 PASS

### 决策

- **确认即锁定**：评分通过后产物为稳定版本，不可重生成
- **改走修改流**：已锁定产物只能增量修改（读现有文件 → 改指定部分），不能从零重生成
- **级联检查不自动修改**：修改一个模块后，检查是否影响其他模块并提示用户，但不自动改
- **manifest 损坏可重建**：从 outputs 目录现有文件推断状态（文件存在 = 至少 generated）
- **审核推送先记日志**：群聊/看板审核作为需求记录在 review_log，不实现推送逻辑

### 未完成/需求记录

- **AI 辅助生产**：美术截图 → AI 基于 IR 约束生成氛围图 → 归档到 manifest（未实现）
- **协同审核**：产物推到群聊/看板，团队 approve/reject 回写 manifest（仅预留字段）
- case_01_truck 的 manifest.json 尚未生成

### 下一步

- 用新编排器跑全新案例，验证 manifest 机制的端到端行为
- 开发 AI 辅助生产流程（截图 → 氛围图，约束来自 IR）
- 设计协同审核的具体方案（群聊推送机制）

---

## [2026-04-01] BubbleChart 概念修正 — 玩法流程图 vs 空间气泡图

### 问题

bubble_chart 模块对 POI 类和玩法类案例使用了相同的气泡图形式，但两者的需求本质不同：
- **POI 案例**（如 artmuseum）：需要空间/功能气泡图，节点代表区域/功能点，按情绪着色
- **玩法案例**（如 truck）：需要逻辑流程图，节点代表状态/动作，按功能类型着色，边标注条件

### 完成

- 升级 `contracts/skills/bubble_chart/contract.yaml` 至 v2.0
  - 新增 `mode_selection`：根据 IR.type 自动选择模式
  - POI 类型 → `spatial_bubble` 模式（空间气泡图，情绪着色）
  - 非 POI 类型 → `gameplay_flow` 模式（逻辑流程图，功能类型着色）
  - 定义 7 种功能类型着色：state_neutral / event_trigger / condition_check / player_action / system_action / failure / forced_exit
  - 定义 5 种边类型：critical / condition / failure / retry / optional

- 创建 `contracts/skills/bubble_chart/template_gameplay.html`
  - 玩法流程图专用 HTML 模板，CSS 变量映射功能类型颜色

- 创建 `contracts/flowchart_standards.md`
  - 基于 ISO 5807 的流程图绘制规范
  - 标准符号：stadium（起止）、矩形（处理）、菱形（判断，≥2 出口）
  - 布局规则：主流自上而下、中轴主路径、分支左右展开
  - 连线规则：只用直角折线、最多 2 次折弯、不允许交叉
  - 循环回退走右侧外围、虚线样式
  - 复杂度控制：单图最多 15 节点

### 决策

- 玩法流程图不使用情绪着色（情绪信息由 emotion_curve 模块承载）
- 判断节点必须用菱形，必须有 ≥2 个出口且标注条件
- flowchart_standards.md 作为所有流程图类模块的共享绘制规范

---

## [2026-04-01~02] Mermaid CLI 预渲染管线 — 告别手码 SVG

### 问题

手动编写 SVG 流程图遇到三个无法根治的问题：
1. **线条凌乱** — 多条回退路径在右侧并行，无法区分
2. **Z-order 遮挡** — 连接器符号被节点挡住不可见
3. **维护成本** — 每次节点增减都要手动调整所有坐标和线路

### 方案选择

| 方案 | 结果 |
|------|------|
| Mermaid CDN | 公司防火墙封锁 CDN（jsdelivr 返回 000/BLOCKED） |
| Graphviz 预渲染 | `dot` 未安装，pip 被防火墙封锁无法安装 |
| **Mermaid CLI 预渲染** | `npm install -g @mermaid-js/mermaid-cli` 成功 ✓ |

### 完成

- 创建 `pipeline/render_gameplay_flow.js`
  - 流程：`.mmd` → `mmdc` 渲染 SVG → 读取 SVG → 嵌入 HTML 模板
  - SVG 响应式处理：移除固定 width/height，保留 viewBox
  - 从 IR 读取元信息（关卡名/ID/类型/节点数）填充模板 header
  - 含图例（6 种功能类型 + 主路径/失败重试线型）+ 自动评分摘要
  - 渲染后自动清理临时 SVG 文件

- 修正 `outputs/case_01_truck/bubble_chart.mmd`（v1→v3）
  - v1：情绪着色 classDef（calm/wonder/tension_low...），14 个旧 IR 节点
  - v2：概念修正为功能类型着色，但 classDef 名称仍为旧版
  - **v3**：classDef 名称对齐规范（state_neutral/event_trigger/condition/player_action/system_action/failure），节点对齐 v2 IR（12 个），判断节点使用菱形语法 `{}`

- Manifest 更新：bubble_chart v3 locked，modification_history 记录 3 个版本的变更

### 技术栈

- `@mermaid-js/mermaid-cli`（全局安装）提供 `mmdc` 命令
- 渲染参数：`mmdc -i input.mmd -o output.svg -b transparent`
- 自动布局引擎处理节点位置和连线路由，彻底解决手码 SVG 的线条问题

---

## [2026-04-02] 文档组装脚本化 — assemble_document.js v2

### 问题

首版 assemble_document.js 输出质量远低于 poi_document.html（第一版手动组装），原因：
1. **缺少模块 CSS** — 脚本只提取 `<section>` 内容，各模块的 `<style>` 在 `<head>` 中被丢弃，导致所有模块专属样式（.callout / .prop-table / .chart-container 等）失效
2. **没有侧边导航** — 第一版有 240px 固定左侧导航栏，新版只有简单目录网格
3. **没有 Hero 封面** — 缺少视觉冲击力的大标题和 IR 统计数据

### 完成

- 重写 `pipeline/assemble_document.js` v2.0，对齐 poi_document.html 架构：
  - 新增 `extractStyles()` — 从每个模块 HTML 提取 `<style>` 内容
  - 合并所有模块 CSS 到统一 `<style>` 块（以 `/* === MODULE_KEY === */` 注释分隔）
  - 加回 240px 固定左侧导航栏（含模块跳转链接 + 版本标记 + 评分展示）
  - 加回 Hero 封面（大标题 + overall_tone 描述 + IR 统计卡片）
  - 模块 section 用 `.module-section-wrapper` 包裹，覆盖 `max-width` 为全宽
  - 底部全局 footer

- 替代 Python 版 `assemble_poi.py`：
  - Node.js 实现，与 render_gameplay_flow.js 同栈
  - 零 Python 依赖，在公司防火墙环境下更可靠

- 为 case_01_truck 完成组装：11/11 模块，0.97 PASS
- 更新 manifest：assembly.status = "assembled"

### 组装流程

```
manifest.json → 读取模块列表和状态
    ↓
ir_filled.json → 读取 Hero 元信息（名称/类型/统计）
    ↓
各模块 .html → extractStyles() + extractSection()
    ↓
合并 CSS + 侧边导航 + Hero + 模块 sections + Footer
    ↓
assembled_document.html
```

### 下一步

- case_02_artmuseum 也跑一遍新组装脚本
- 清理遗留文件（test_flow.mmd/svg）
- 更新 pipeline 文档对齐新的渲染/组装管线

---

## [2026-04-02] 清理 + 规范化 — 文件清理 + 文档对齐

### 完成

- 删除调试遗留文件：`outputs/case_01_truck/test_flow.mmd` + `test_flow.svg`
- 标记 `pipeline/assemble_poi.py` 为 `[DEPRECATED]`（已被 Node.js 版 assemble_document.js 替代）
- 重写 `pipeline/02_skill_router.md`：
  - 新增 Phase 0 Manifest 检查（locked 模块跳过）
  - 新增 Slot 3 模板引用（template.html）
  - BubbleChart 双模式完整说明（spatial_bubble vs gameplay_flow + 功能类型着色表 + Mermaid 语法规则）
  - 新增渲染管线命令 + 组装命令
  - 质量检查更新：node_count 上限改为 15，新增 condition_labels_present
- 重写 `README.md`：
  - 从"最小循环/单 Skill"升级为完整架构图
  - 新增核心原则、目录结构、管线命令、测试用例状态表
- 更新 `contracts/module_spec.md`：
  - 模块顺序对齐 assemble_document.js（资产→#05，氛围→#06）
  - 删除 score-report 独立模块（数据在 manifest 中）
  - 新增 bubble_chart 双模式说明 + IR 维度修正
  - 组装模式描述改为 Node.js 版 assemble_document.js
- case_02_artmuseum 重新组装：11/11 模块，0.97 PASS

---

## [2026-04-02] 确定性模块裁剪 — select_modules.js + Phase 2 [v2.2]

### 背景

Phase 1.5 类型感知模块裁剪（玩法 vs POI）此前由 Claude prompt 决策，不确定性高、消耗算力。目标是将此逻辑改为确定性 Node.js 脚本。

### 完成

#### 1. `pipeline/select_modules.js`（新文件）
- 读取 `ir_filled.json` 的 `IR.type` 字段，判断关卡类别
- 玩法类（OpenWorldEvent/OpenWorldChallenge）→ 交互式菜单选择（A/B/C 或数字组合）
- 空间类（POI 等）→ 无需操作，直接退出
- 写入 manifest.json 的 `skipped` 状态（含 `skip_reason`）
- 支持 `--auto=A|B` 参数跳过交互，用于脚本化场景
- 可独立运行，也可由 run_pipeline.js 调用

#### 2. `pipeline/lib/manifest.js` — 支持 skipped 状态
- `getProgress()` 新增 `skipped` 计数 + `effective_total`（排除跳过模块的总数）
- `validateIntegrity()` 跳过 status=skipped 的模块哈希校验

#### 3. `pipeline/run_pipeline.js` — 插入 Phase 2 + 相应重编号
- 新增 Phase 2 SELECT（调用 select_modules.js，stdio: inherit 支持交互）
- 原 Phase 2→3（GENERATE），3→4（ASSEMBLE），4→5（SCORE），5→6（LOCK）
- **重大变更：** `--from=N` 参数需要更新：
  - 旧 `--from=2`（生成）→ 新 `--from=3`
  - 旧 `--from=3`（组装）→ 新 `--from=4`
  - 旧 `--from=4`（评分）→ 新 `--from=5`
  - 旧 `--from=5`（锁定）→ 新 `--from=6`
- Phase 3 (GENERATE): 新增 `skipped` 状态处理（显示为 `skipped（按类型规则跳过）`）
- Phase 4 (ASSEMBLE): `notReady` 检查排除 `skipped` 模块
- Phase 6 (LOCK): `skipped` 模块不锁定，只记录 `info`

#### 4. `pipeline/scorer.js` — 跳过 skipped 模块的评分检查
- `scoreStructure()`: `module_count` 使用 `effective_total`（排除跳过模块），文件存在检查跳过 skipped
- `scoreCompliance()`: data-module / module-header / module-footer / CSS 变量检查跳过 skipped
- `scoreFidelity()`: `spatial_topology` 区域覆盖检查跳过（若 skipped）

### 决策
- **确定性原则**：select_modules.js 是纯代码逻辑，不依赖 LLM 判断，符合「追求确定性」目标
- **交互式 readline**：run_pipeline.js 以 `stdio: inherit` 调用子进程，终端交互正常工作
- **回退方式**：git 历史保存了 run_pipeline.js 修改前的版本；changelog 有完整记录

### 回退方法（如有问题）
```bash
# 查看变更
git diff pipeline/run_pipeline.js

# 回退单文件
git checkout HEAD pipeline/run_pipeline.js

# 回退所有新增/修改（保留 select_modules.js 为新文件，需手动删除）
git stash
```

---

## [2026-04-02] 编排器自动化 Round 1 — Pipeline Scripts

### 背景

当前管线除 `render_gameplay_flow.js` 和 `assemble_document.js` 外，所有逻辑（manifest 读写、哈希计算、状态判断、评分规则执行）均由 Claude prompt 驱动。每次跑 `/design-level` 需要 Claude 手动读 manifest、逐模块检查状态、跑 14 项评分规则——这些是纯确定性逻辑，不需要 LLM。

**目标：** 把确定性逻辑抽成 Node.js 脚本，Claude 只做需要 LLM 的工作（IR 对话填充、模块内容生成）。

### 完成

#### 1. `pipeline/lib/manifest.js` — Manifest 管理工具
- init / load / save / getModuleStatus / updateModule
- computeFileHash（SHA-256）/ lockModule / addModification
- getProgress（进度摘要）/ validateIntegrity（哈希校验）/ buildAssemblySnapshot

#### 2. `pipeline/lib/validate_ir.js` — IR 验证器
- 7 项检查：structure / space / flow_nodes / flow_edges / critical_path / feel_beats / assets
- 交叉引用验证：节点 id 唯一性、edges 引用有效、region 引用有效、beat 覆盖率
- 输出：`{valid, errors[], warnings[], details, summary}`

#### 3. `pipeline/scorer.js` — 自动评分脚本
- 4 维度评分（14 项检查），加权总分
  - structure_completeness（30%）：模块数 + 文件存在 + IR 有效 + 节点数
  - consistency（30%）：跨模块节点名引用 + IR 版本一致
  - compliance（20%）：data-module 属性 + header/footer 结构 + CSS 变量
  - fidelity（20%）：关卡名/ID + 资产覆盖 + 区域覆盖
- 输出 `score_report.json` + 自动更新 manifest.scoring
- 验证：truck 0.97 PASS / artmuseum 0.92 PASS

#### 4. `pipeline/run_pipeline.js` — CLI 编排器
- 6 阶段顺序执行：init → ir → generate → assemble → score → lock
- 3 个暂停点（⏸）：IR 确认 / 模块生成 / 评分人工确认
- 支持 `--from=N` `--to=N` 跳转指定阶段
- 已锁定的 IR 和模块自动跳过
- 调用 assemble_document.js 和 scorer.js 作为子步骤
- 验证：truck 全链路通过（Phase 0→5）

#### 5. 更新 `design-level.md` 编排器 skill
- Phase 3 从 `python assemble_poi.py` 改为 `node assemble_document.js`
- Phase 4 从手动评分改为 `node scorer.js`
- 错误处理新增 CLI 编排器提示

### 使用方式

```bash
# 全链路
node pipeline/run_pipeline.js outputs/case_01_truck

# 从指定阶段
node pipeline/run_pipeline.js outputs/case_01_truck --from=5

# 单独评分
node pipeline/scorer.js outputs/case_01_truck
```

### 当前管线自动化程度

| 阶段 | 之前 | 现在 |
|------|------|------|
| Manifest 管理 | Claude 手动读写 JSON | `manifest.js` 一行调用 |
| IR 验证 | Claude 手动检查 | `validate_ir.js` 7 项自动检查 |
| 评分 | Claude 逐条执行 14 项规则 | `scorer.js` 一键评分 |
| 组装 | Claude 手动触发脚本 | `assemble_document.js`（已有）|
| 编排 | Claude 记住阶段 + 手动判断跳过 | `run_pipeline.js` 自动跳过 + 暂停 |
| 模块生成 | Claude prompt 驱动 | 仍需 LLM（Round 2 可部分脚本化）|
| IR 填充 | Claude 对话驱动 | 仍需 LLM（核心对话能力）|

### 下一步（Round 2，后续实现）

- `pipeline/lib/slice_ir.js` — IR 裁剪器（读 contract.yaml → 提取 IR 子集）
- `pipeline/fill_template.js` — 模板机械填充（asset_list / lighting_req 等简单模块无需 LLM）
- `pipeline/check_hashes.js` — 完整性校验（manifest 哈希 vs 文件）

---

## [2026-04-13] Round 2 Step 1 — 补齐 7 个模块的 contract.yaml

### 背景

Round 1 完成了管线脚本化，但 `02_skill_router.md` 的 5-slot IR 自动切片机制需要每个模块有 `contract.yaml` 来声明所需的 IR 字段。此前只有 4/11 模块有 contract（asset_list / atmosphere_ref / bubble_chart / emotion_curve），剩余 7 个模块的 IR 裁剪只能靠 Claude prompt 推断，不确定性高。

### 完成

为 7 个模块新建 `contract.yaml`，格式对齐现有 4 个：

| # | 模块 | IR 维度 | 优先级 | auto_checks |
|---|------|---------|--------|-------------|
| 1 | level_overview | ALL（6维度 + uncertainty_flags） | P0 | 3 项（维度覆盖/不确定项/数据准确性） |
| 2 | spatial_topology | SPACE | P0 | 3 项（区域覆盖/主路径高亮/连接有效性） |
| 3 | storyboard | FLOW + FEEL + SPACE | P1 | 3 项（关键路径覆盖/英文prompt/Beat分组） |
| 4 | lighting_req | FEEL + SPACE | P1 | 3 项（区域覆盖/8列表头/转场节点） |
| 5 | vfx_req | ASSET + MECHANIC + FEEL | P1 | 3 项（IR资产覆盖/优先级标记/性能注意） |
| 6 | audio_req | FEEL + SPACE + MECHANIC | P1 | 3 项（环境音覆盖/8列BGM表/SFX触发有效） |
| 7 | tech_req | MECHANIC + SYSTEM + FLOW | P1 | 3 项（依赖覆盖/约束覆盖/状态机节点） |

### 验证

- 11/11 模块目录均有 `contract.yaml` ✓
- 所有 `data_module` 值对齐 template.html 的 `data-module` 属性 ✓
- 所有 `ir_fields_required` 路径对齐 ir_schema.json 的字段定义 ✓

### IR 维度映射汇总

| 模块 | SPACE | FLOW | FEEL | MECHANIC | ASSET | SYSTEM | 特殊 |
|------|-------|------|------|----------|-------|--------|------|
| level_overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | uncertainty_flags |
| bubble_chart | ✓/- | -/✓ | ✓/- | ✓ | | | 双模式 |
| emotion_curve | | ✓ | ✓ | | | | |
| spatial_topology | ✓ | | | | | | |
| asset_list | ✓ | | | | ✓ | | |
| atmosphere_ref | ✓ | ✓ | ✓ | | | | |
| storyboard | ✓ | ✓ | ✓ | | | | |
| lighting_req | ✓ | | ✓ | | | | |
| vfx_req | | | ✓ | ✓ | ✓ | | |
| audio_req | ✓ | | ✓ | ✓ | | | audio_intent |
| tech_req | | ✓ | | ✓ | | ✓ | |

### 回退方式

全部为新增文件，删除即可回退：
```bash
for m in level_overview spatial_topology storyboard lighting_req vfx_req audio_req tech_req; do
  rm "contracts/skills/$m/contract.yaml"
done
```

### 下一步

- Round 2 Step 2: 实现 `pipeline/lib/slice_ir.js`（读 contract.yaml → 裁剪 IR 子集）

---

## [2026-04-13] Round 2 Step 2 — slice_ir.js IR 裁剪器

### 背景

5-slot 上下文组装机制（02_skill_router.md）要求 Slot 2 只传入模块所需的 IR 子集，而不是完整 6 维度 IR。此前由 Claude prompt 手动判断传哪些字段，不确定性高。Step 1 补齐了 11 个 contract.yaml 后，现在可以用确定性脚本实现自动裁剪。

### 完成

- 创建 `pipeline/lib/slice_ir.js`
  - `parseContractPaths(contractPath)` — 正则提取 contract.yaml 中的 `ir_fields_required` 路径（不依赖 js-yaml）
  - `sliceIR(irData, contractPath)` — 按路径列表从 IR 中裁剪子集
  - `sliceForModule(irData, moduleKey)` — 便捷方法，自动定位 contract.yaml
  - `sliceAll(irData)` — 批量裁剪所有模块
  - CLI 支持单模块和 `--all` 两种模式
  - 返回 `{ sliced, report: { found, missing } }`，明确报告哪些字段找到、哪些缺失

### 测试结果

| Case | 模块 | Found | Missing | 说明 |
|------|------|-------|---------|------|
| case_01_truck | 8/11 OK | 78 | 3 | 3 个缺失为 IR 数据缺失（动态事件无 optional_paths / total_area_estimate），非 contract 错误 |
| case_02_artmuseum | 11/11 OK | 81 | 0 | 全部字段匹配 |

### 设计决策

- **不依赖 js-yaml**：公司防火墙无法安装 npm 包，用正则 `/^\s*-\s*path:\s*"?([^"\n]+?)"?\s*$/gm` 提取路径，足够覆盖 contract.yaml 的简单格式
- **缺失字段不报错**：missing 以 WARN 报告，不阻断流程。某些 IR 字段是可选的（如玩法类无 optional_paths），模块生成器应能容错处理
- **IR 搜索路径**：优先 `test_cases/{case_id}/ir_filled.json`，备选 `outputs/{case_id}/ir_filled.json`

### 回退方式

删除单文件：`rm pipeline/lib/slice_ir.js`

### 下一步

- Round 2 Step 3: 实现 `pipeline/check_hashes.js`（manifest 哈希 vs 文件完整性校验）

---

## [2026-04-14] Round 2 Step 3 — check_hashes.js 完整性校验

### 完成

- 创建 `pipeline/check_hashes.js`
  - 检查 IR 哈希（搜索 test_cases/ 和 outputs/ 两个位置）
  - 复用 `manifest.validateIntegrity()` 检查模块 + assembly 哈希
  - 跳过 `skipped` 和 `pending`（无哈希）的模块
  - `--fix` 模式：用实际文件哈希更新 manifest（仅 hash_mismatch，不修复 file_missing）
  - 退出码：0 = 全部通过，1 = 发现问题
  - 可作为模块导入：`{ checkHashes, fixHashes }`

### 测试结果

| Case | 结果 | 校验项 | 说明 |
|------|------|--------|------|
| case_01_truck | PASS | 13 项 | IR + 11 模块 + assembly 全部匹配 |
| case_02_artmuseum | PASS | 13 项 | 同上 |
| case_03_continuous_destroy | PASS | 0 项 | 模块均 pending/skipped，无哈希可校验，正确行为 |

### 使用方式

```bash
node pipeline/check_hashes.js outputs/case_01_truck         # 检查
node pipeline/check_hashes.js outputs/case_01_truck --fix    # 检查并修复不匹配
```

### 回退方式

删除单文件：`rm pipeline/check_hashes.js`

### 下一步

- Round 2 Step 4: 修复 case_03 manifest 不一致
- Round 2 Step 5: 实现 `pipeline/fill_template.js`（简单模块模板机械填充）

---

## [2026-04-14] Round 2 Step 4 — 修复 case_03 manifest 不一致

### 问题

`case_03_continuous_destroy` 的 manifest 显示所有模块为 pending/skipped，但 outputs 目录下 11 个 HTML 文件和 assembled_document.html 均存在。原因：文件在 select_modules.js 的 skip 规则生效前已生成，但 manifest 状态未同步更新。

### 修复

- 6 个 pending 模块（level_overview/bubble_chart/emotion_curve/asset_list/storyboard/tech_req）→ `generated`，补上 SHA-256 哈希
- 5 个 skipped 模块（spatial_topology/atmosphere_ref/lighting_req/vfx_req/audio_req）→ 保持 `skipped`，文件作为历史遗留
- IR → 补上哈希
- Assembly → `not_started` → `assembled`，补上哈希和 modules_snapshot

### 验证

`check_hashes.js` 校验 8 项全部 PASS（6 generated + IR + assembly），5 skipped 正确跳过

### 回退方式

```bash
git checkout outputs/case_03_continuous_destroy/manifest.json
```

### 下一步

- Round 2 Step 5: 实现 `pipeline/fill_template.js`（简单模块模板机械填充）

---

## [2026-04-14] Round 2 Step 5 — fill_template.js 通用模板填充引擎

### 背景

目标是用确定性脚本替代 LLM 生成纯数据映射模块。模板使用 `{{placeholder}}` + `<!-- REPEAT -->` 语法，数据来自 IR 切片。

### 完成

#### 通用模板引擎 `pipeline/fill_template.js`

- **`replaceVars(str, vars)`** — `{{placeholder}}` → 值替换
- **`processSectionRepeats(html, sections)`** — `<!-- REPEAT: ... -->` + `<div class="table-section">` 级别，替换为预生成的 HTML（div 层级计数匹配闭合标签）
- **`processRowRepeats(html, repeats)`** — `<!-- REPEAT: ... -->` + `<tr>` 级别，按数组重复行
- **`renderTemplate(html, data)`** — 组合：先 section → 再 row → 最后 vars
- **`fillModule(irData, moduleKey)`** — 入口：切片 IR → 读模板 → 提取数据 → 渲染
- **提取器注册表** — `registerExtractor(moduleKey, fn)` 扩展机制

#### asset_list 提取器（首个实现）

- 从 `IR.ASSET.required_assets` 按 `type` 分组（mesh/vfx/animation/ui/...）
- 统计摘要：总数 / must_have / nice_to_have / 类型数
- 类型标签映射（中英文 + CSS class）
- 复用候选表（空数组时显示占位行）

### 测试结果

| Case | 资产数 | 分类数 | 大小 | 状态 |
|------|--------|--------|------|------|
| case_01_truck | 5 | 4 (mesh/vfx/anim/ui) | 6.3KB | PASS |
| case_02_artmuseum | 6 | 3 | 8.5KB | PASS |

### 使用方式

```bash
node pipeline/fill_template.js outputs/case_01_truck asset_list            # 写入文件
node pipeline/fill_template.js outputs/case_01_truck asset_list --dry-run   # 预览
```

### 设计决策

- **Section REPEAT 用 div 层级计数**匹配闭合，而非固定层数 regex（更健壮）
- **执行顺序**：section → row → vars（防止 section 内的 REPEAT 行被提前消费）
- **type 字段注入**：fillModule 自动补 `irData.type` 到切片（模板头部常用但非所有 contract 声明）
- **提取器注册表**：后续新增模块只需 `registerExtractor('module_key', fn)`

### 扩展路径

后续可为以下模块添加提取器（按数据机械度排序）：
1. ~~asset_list~~ ✅ 已完成
2. `level_overview` — 全维度摘要，大部分可机械填充
3. `lighting_req` / `audio_req` / `vfx_req` — 部分可机械（区域行），部分需 LLM（灯光描述等）
4. `tech_req` — 系统依赖表可机械，状态机需 LLM
5. `emotion_curve` / `storyboard` / `bubble_chart` — 需 LLM 创意

### 回退方式

删除单文件：`rm pipeline/fill_template.js`

### 下一步

- 将 fill_template 集成到 run_pipeline.js 的 GENERATE 阶段（有提取器的模块自动填充，无提取器的暂停等 LLM）
- 为更多模块添加提取器

---

## [2026-04-14] 插入任务 — Skill Pipeline 优化（5 项）

### 来源

`关卡skill-pipeline优化建议.md`，对照 `skills-main` 仓库的文档写法，提炼出 6 条优化建议。经分析，4 条直接适用 + 1 条改造适用（Mermaid 路线替代 LayoutSpec 路线），2 条不适用（优化 4 LayoutSpec schema 分离、原版优化 1 的 LayoutSpec JSON 对照）。

### 完成

| 优化 | 改动 | 文件 |
|------|------|------|
| 3. Quick Start | `/design-level` + `/input-processor` 顶部加一行流程概览 | 2 个 skill .md |
| 2. 裁剪矩阵内联 | Phase 1.5 过程式描述 → 查找表 + 例外规则表，省一次 `level_type_rules.md` 读取 | design-level.md |
| 1→改造. Mermaid Mistakes | 5 条高频错误对照（WRONG/CORRECT Mermaid 语法对） | 02_skill_router.md |
| 5. IR 进度条 | Step 1-4 每轮对话后展示 6 维度填充进度条 | input-processor.md |
| 6. 统一异常处理 | 散列 → 统一 触发条件/行为/决策权 表格 | design-level.md + input-processor.md |

### 不适用项（记录原因）

- 优化 4（LayoutSpec 字段分离到 schema）：我们的 bubble_chart 走 Mermaid CLI 路线，不用 LayoutSpec JSON
- 原版优化 1（LayoutSpec JSON 错误对照）：同上，改造为 Mermaid 语法错误对照

### 下一步

- Round 2 Step 6: 将 fill_template 集成到 run_pipeline.js

---

## [2026-04-14] Round 2 Step 6 — fill_template 集成到 run_pipeline.js

### 完成

- Phase 3 (GENERATE) 改造：
  - 导入 `fill_template.js` 的 `fillModule` 和 `getSupportedModules`
  - 在逐模块检查状态时，pending 模块先检查是否有提取器
  - **有提取器** → 自动填充，生成 HTML，更新 manifest（status=generated + hash + ir_version）
  - **无提取器** → 标记"需要 LLM 生成"，暂停等待
  - 自动填充完成后展示汇总，再列出剩余需 LLM 的模块

### 测试

临时 case（case_01_truck 的 IR + 空 outputs），Phase 3 运行结果：
- `asset_list`: 自动填充完成 (9015 bytes) ✓
- 其余 9 个模块: 正确标记为"需要 LLM 生成" ✓
- `spatial_topology`: 正确识别为 skipped ✓

### 当前自动填充覆盖

| 模块 | 填充方式 |
|------|---------|
| asset_list | 自动（fill_template 提取器） |
| 其余 10 个 | LLM（/design-level 手动） |

### 回退方式

```bash
git diff pipeline/run_pipeline.js  # 查看变更
```
仅新增了 1 行 require + 改造了 phase3 函数，不影响其他阶段。

### 下一步

- Round 3 方向：为更多模块编写提取器 / 跑新 case 端到端验证 / 集成 slice_ir 到 skill_router 的 Claude prompt 上下文

---

## [2026-04-27] v2.5.1 — 新增 Deck 视图层（contracts/views/deck/）

### 背景

13 个模块各有 `template.html`，但缺少跨模块的"叙事聚合视图"。`assembled_document.html` 是长文档串联，适合打印 / 评审，不适合分享 / 演讲 / 节奏化阅读。受 `op7418/guizang-ppt-skill` 启发（横向翻页杂志风 PPT），引入与 `assembled_document` 平级的"视图层"概念。

试做参考：`outputs/case_05_gangster_mansion/presentation_v2.html`（手写 15 页端到端验证，沙丘主题）。

### 改动

1. **新增 `contracts/views/`** — 视图层目录（与 `contracts/skills/` 平级）。
   - 区别：skill = 数据生产者，每个产出一段 HTML；view = 数据消费者，跨模块聚合 IR 重新叙事。
   - 视图不参与 `manifest` 锁定流程，不影响 score。
2. **新增 `contracts/views/deck/`** — 第一个视图契约。
   - `contract.yaml` v0.1.0 — 字段契约（input source / output / quality 自检 / case_type → theme 映射）
   - `template.html` — 种子文件（沙丘默认 + 5 套主题色注释 + WebGL 双背景 + 翻页 JS）
   - `motion.min.js` — Motion One 离线副本（约 64KB）
   - `layouts.md` — 11 个关卡专用布局骨架（cover / act_divider / stat_grid / triplet / big_quote / text_image / zone_grid / emotion_curve / pipeline / open_loops / coda）
   - `checklist.md` — P0-P3 自检清单（占位符 / 主题节奏 / 类预定义 / IR 确认 / 图片有效）
   - `README.md` — 视图层定义、调用约定、隔离原则
3. **未实现（v0.1 仅落地契约）**
   - `pipeline/render_deck.js`（IR → deck/index.html 渲染器）
   - `~/.claude/commands/level-deck.md`（独立 skill 入口）
   - `design-level.md` Phase 5 集成 hook（可选触发 deck 视图）

### case_type → theme 硬映射

不允许任意自定义颜色，5 套主题由 IR.type 决定：
- POI → 沙丘（潜行 / 夜晚）
- MECHANIC → 墨水经典
- STRATEGY → 靛蓝瓷
- NARRATIVE → 牛皮纸
- PROTOTYPE → 森林墨

### 隔离原则（避免污染主流程）

1. deck 只读 `ir_filled.json + manifest`，不读 / 不改 13 模块文件
2. deck 不参与 score
3. deck 渲染失败不阻塞 lock
4. 输出隔离到 `outputs/{case_id}/deck/` 子目录

### 下一步

- 实现 `render_deck.js`：IR → 11 layout 骨架填充 → deck/index.html
- 写 `level-deck` skill：独立调用入口，输入 case_id → 校验 manifest → 渲染 → 浏览器打开
- 在 `design-level.md` Phase 5 score 通过后加 1 行 prompt：「是否生成 deck 视图？」
- 解决「图片语义对应」独立工程：169 张参考图 → 区域 / 节点的映射（可能从 .pen 原文档重新提取）


---

## [2026-04-27] v2.5.2 — Deck 视图方向修正（v0.1 → v0.2）

### 背景

v2.5.1 落地的 `contracts/views/deck/` v0.1 走错了方向 — 把 guizang-ppt-skill 当成"叙事重构方法论"，写了 11 个关卡专用 layout（cover / triplet / big_quote / stat_grid / emotion_curve_svg / pipeline...），把 IR 数据**重新编排成演讲式 PPT**。

试做 `outputs/case_05_gangster_mansion/presentation_v2.html` 验证后，Steve 提出方向修正：他要的不是"重新叙事"，而是**保留 11 模块 100% 内容 + 套上 slides 的滑动呈现壳**。模块原有的属性表 / SVG 流程图 / 卡片配色都该保留，因为它们本来就是为那种信息量设计的。

### 关键判断

guizang 真正能给 LevelAgent 的是**呈现层**（横向滑动 + WebGL + 杂志感字体 + 翻页节奏），不是**信息层**（重写 / 提炼 / 抛弃细节）。

### 试做验证

`outputs/case_05_gangster_mansion/presentation_v3_iframe.html` — iframe 包装版本：
- 18 页 = 1 cover + 4 act_divider + 11 module_wrap + 1 open_loops + 1 coda
- 每个模块 1 张 slide，iframe src 直接指向 `../{module}.html`
- iframe 内独立滚动，外部 deck 横向翻页
- 视觉上：deck 容器是沙丘炭灰，iframe 内是模块自有浅色 + 橙色 → 像"杂志里内插的彩印附录"
- Steve 验证 3 个视觉点（iframe 边框 / 沙丘 vs 橙色 / spatial_layout 7345 行性能）全部通过

### 改动

1. **`contracts/views/deck/layouts.md` v0.1 → v0.2**
   - 11 个 layout 砍到 5 个：cover / act_divider / **module_wrap（核心）** / open_loops / coda
   - 删除：stat_grid / triplet / big_quote / text_image / zone_grid / emotion_curve_svg / pipeline
   - 新增：iframe 隔离规范（height:100vh + loading=lazy + 边框规则）
   - 新增：废弃 layout 的"内容应来自哪个模块"对照表
2. **`contracts/views/deck/contract.yaml` v0.1 → v0.2**
   - input.source 增加 `kind: modules` — 11 个模块 HTML 文件作为输入源
   - input.gate 增强：`ir.status == 'confirmed' AND assembly.status == 'assembled'`
   - ir_fields_consumed 大幅瘦身 — 只保留 cover / open_loops / coda 需要的元数据
   - 新增 `act_grouping` — Act 分组写死（render_deck.js 据此组织 slides）
   - 新增 quality 检查：iframe_src_valid / iframe_loading_lazy / manifest_gate
   - structure.default_pages 15 → 18，sections 重写
3. **`contracts/views/deck/README.md`**
   - "这是什么"段落改为"呈现层壳，模块原内容 100% 保留"
   - 增加"v0.2 关键设计判断（已踩坑）"段落，记录 v0.1 走错原因
   - 试做参考双轨：v2 作反例 + v3 作当前方向
4. **`contracts/views/deck/checklist.md`**
   - P0-3 改为 iframe src 有效；新增 P0-4 iframe lazy load / P0-5 manifest 双 gate
   - 删除 v0.1 中和 stat_grid / SVG / 图片占位相关的规则（5 条）
   - 新增 P3-2 iframe 滚动 vs 翻页冲突测试 / P3-3 preload 前后页
5. **`outputs/case_05_gangster_mansion/presentation_v3_iframe.html`** — v0.2 试做产物

### 教训

- 借鉴外部 skill 时，**先想清楚要借鉴什么**（呈现层 vs 信息层），别整套照搬
- 试做 → 用户验证 → 改契约 比 直接改契约 → 试做 更不容易走错
- "deck 不该和模块抢饭吃。模块负责信息层，deck 负责呈现层，互不重叠" — 写入 layouts.md 作为长期约束

### 未实现（待续）

- `pipeline/render_deck.js` — 现在契约清晰多了：读 11 模块文件路径 + IR 元数据 → 18 页 deck（5 个 layout 模板填字段）
- `~/.claude/commands/level-deck.md` — 独立调用入口
- `design-level.md` Phase 5 集成 hook


---

## [2026-04-27] v2.5.3 — render_deck.js 落地 + 跨 case 验证

### 改动

1. **新增 `pipeline/render_deck.js` v0.2.0** — deck 视图渲染器。读 manifest + IR + 模块 HTML → 单文件 deck（5 layout 模板填字段，零 LLM 判断）。
   - 用法: `node pipeline/render_deck.js <case_id>`
   - 输出: `outputs/{case_id}/deck/index.html` + `motion.min.js`
   - 内置 P0 自检（占位符残留 / 主题节奏 / iframe lazy / manifest 双 gate）

2. **修订 `contracts/views/deck/contract.yaml`** — 跨 case 验证暴露 2 个契约 bug 修复：
   - `gate` 改为 `ir.status IN ('confirmed', 'locked')` — 原写死 `confirmed` 会拒绝 4 个 case 中的 3 个 locked case
   - `theme_mapping` 加 `OpenWorldEvent → forest_ink` — 真实数据中 4 个 case 中 3 个是 OpenWorldEvent，原表只有 POI/MECHANIC/STRATEGY/NARRATIVE/PROTOTYPE 推测类型
   - default fallback 从 `dune` 改为 `ink_classic`（最通用，未识别 type 走墨水经典）

3. **render_deck 实现按 manifest 动态过滤模块** — 原本写死 11 个模块要求齐全，跨 case 验证发现 LevelAgent 按 case_type 裁剪（见 `contracts/level_type_rules.md`）：
   - 空间类用 `spatial_layout`（case_02/05），玩法类用 `spatial_topology`（case_01/03/04）
   - 玩法类 atmosphere_ref/lighting_req/vfx_req/audio_req 可被 manifest 标记 `skipped`
   - 实现：`buildActsFromManifest()` 按 manifest 状态 + 文件存在性双重过滤，空 act 自动跳过
   - P0-3 校验改为「核心 6 模块必须齐」（对应 level_type_rules 的"必生成"清单）：level_overview / bubble_chart / emotion_curve / asset_list / storyboard / tech_req

### 跨 case 验证结果

| case | type | theme | slides | modules |
|------|------|-------|--------|---------|
| case_01_truck | OpenWorldEvent | forest_ink | 18 | 11 |
| case_02_artmuseum | POI | dune | 18 | 11 |
| case_03_continuous_destroy | OpenWorldEvent | forest_ink | 13 | 6 |
| case_05_gangster_mansion | POI | dune | 18 | 11 |

case_03 自动从 11 模块裁剪到 6 模块（玩法类全部 skipped 模块跳过），slide 数动态调整为 13，证明动态过滤逻辑正确。

### 教训

**不要在没读 contract 的情况下假设结构**。我先写了"11 模块写死"的版本，跨 case 跑才发现 LevelAgent 早就有 `level_type_rules.md` 定义了类型 × 模块裁剪矩阵。CLAUDE.md 的「30 秒内必读」应该补一条 `contracts/level_type_rules.md`。

正确流程是：
1. 读 contract（包括 type_rules）
2. 写实现
3. 跨 case 验证

我跳过了第 1 步直接做第 2 步，浪费了一次返工。

### 未实现（待续）

- `~/.claude/commands/level-deck.md` — 独立调用入口 skill（输入 case_id → 调 render_deck → 浏览器打开）
- `design-level.md` Phase 5 集成 hook — score 通过后 prompt 「是否生成 deck 视图？」
- `case_index.json` 增加 deck_generated_at 字段（可选）


---

## [2026-04-27] v2.5.4 — /level-deck skill 落地

### 改动

新增 `~/.claude/commands/level-deck.md` v0.1.0 — 包装 `render_deck.js` 为独立 Claude Code skill。

调用方式从：
```bash
cd ~/LevelAgent && node pipeline/render_deck.js case_03_continuous_destroy
```
变为：
```
/level-deck case_03_continuous_destroy
```

skill 内置 5 步：解析输入 → 校验 manifest gate → 调用 render_deck.js → 浏览器打开 → 简短报告。

### 设计判断

- skill 不重跑 pipeline，不修改源文件 — 只是渲染器的薄包装
- 失败时 fail-fast 不绕过 — 让用户知道为什么不能出 deck（如 case 还没 assembled）
- 不在 skill 里复制 render_deck 逻辑 — 单一真源原则

### 待续

- design-level Phase 5 hook（让管线跑完自动 prompt 是否调 /level-deck）


---

## [2026-04-27] v2.5.5 — Deck 视图严查老问题修复（spatial_topology / open_loops / 玩法术语）

### 背景

Steve 指出三个错误，全部是**老问题再犯**：
1. `spatial_topology` 在 v2.4 已明确移除（"功能由 bubble_chart + spatial_layout 共同覆盖"），但 v2.5.3 我加回了 ACT_TEMPLATE
2. `uncertainty_flags` 早期已被用户标记为「log 噪音」从模块输出中删除（changelog 早期 line 46），但 v2.5.2 我把它做成了 deck 的 open_loops slide
3. 玩法类 case (OpenWorldEvent / OpenWorldChallenge) 的 deck 不该出现「关卡」字样，应该叫「玩法设计文档/玩法概览/玩法定调」

根因都一样：**改 LevelAgent 前没读 changelog 的废弃记录**，跳过了 CLAUDE.md「30 秒内必读」的 changelog 部分，直接看了文件结构就动手。

### 改动

1. **`pipeline/render_deck.js` v0.2.0 → v0.2.1**
   - 删除 `renderOpenLoops()` 函数 + `generateSlides()` 中的调用
   - `ACT_TEMPLATE` Act II 移除 `spatial_topology` 引用（永不引用）
   - 新增 `TERM_MAP`（spatial / gameplay 术语切换）+ `isGameplay()` 判定函数
   - `MODULE_DESC` / `MODULE_NAME_ZH` 拆分：`level_overview` 的中文名按术语动态决定（`moduleNameZh()` / `moduleDesc()`）
   - cover / coda / module_wrap / act_divider 全部按术语切换
   - title 按术语切换

2. **`contracts/views/deck/contract.yaml` v0.2.0 → v0.2.1**
   - `ir_fields_consumed` 删除 `uncertainty_flags`
   - 新增 `term_mapping` 段，明确 spatial / gameplay 术语映射
   - `act_grouping` 每个 act 改为 `title_spatial` + `title_gameplay` 双字段
   - `structure` 改 `default_pages_spatial: 17` + `default_pages_gameplay: 12`
   - `structure.removed_in_v0_2_1` 段记录 open_loops 永久移除原因

3. **`contracts/views/deck/layouts.md`**
   - 删除 L4 open_loops 章节，改为「永久移除」墓碑
   - 新增 「永久禁项」段（开篇 banner）
   - 新增 D 段动态页数说明（17/12）+ E 段玩法 vs 关卡术语表
   - 「已废弃 layout」表追加 v0.2.1 行
   - 新增 「已废弃模块引用」表（spatial_topology）

4. **`contracts/views/deck/checklist.md`**
   - 编排页数从 7 → 6（移除 open_loops）
   - P2-1 比例规则按动态页数重写
   - 新增 P0-7（玩法类不出现「关卡」字样）+ P0-8（无废弃模块引用）
   - 删除 v0.2 → v0.2.1 段记录变化

5. **`contracts/views/deck/README.md`**
   - 默认页结构表改为按 case_type 动态
   - 新增「玩法 vs 关卡术语切换」段

6. **`contracts/views/deck/template.html`** — CSS 注释里的「POI 关卡」改为「POI 类型」（grep 自检不再误报）

7. **新增 2 个 feedback memory**:
   - `feedback_levelagent_check_changelog.md` — 改 LevelAgent 前必查 changelog 废弃记录
   - `feedback_levelagent_gameplay_vs_level.md` — 玩法 vs 关卡术语硬规则

### 跨 case 验证（再次）

| case | type | 术语 | 模块 | slides | 关卡字样 |
|---|---|---|---|---|---|
| case_01_truck | OpenWorldEvent | 玩法 | 10 | 16 | **0** ✓ |
| case_02_artmuseum | POI | 关卡 | 10 | 16 | (空间类正常含「关卡」) |
| case_03_continuous_destroy | OpenWorldEvent | 玩法 | 6 | 12 | **0** ✓ |
| case_05_gangster_mansion | POI | 关卡 | 11 | 17 | 8 ✓ |

case_01/02 模块从 11 → 10（spatial_topology 不再引用，旧 case 文件遗留也不渲染）。

### 教训（重要）

**这是已经踩过的老坑**。我应该建立"改前先查"的习惯，已落地为 feedback memory：
1. 改 LevelAgent 任何文件前 → `grep -nE "废弃|移除|删除|deprecated|removed" ~/LevelAgent/changelog.md`
2. 看到任何与你打算做的事相关的废弃记录，**先停下来确认**当前要做的不是踩进废弃的坑
3. 即使旧 case 目录里仍有遗留文件（如 case_01 的 spatial_topology.html），也不要在新代码里引用它


---

## [2026-04-27] v2.5.6 — Deck 单文件可分发 + Phase 5 hook

### 改动

1. **`pipeline/render_deck.js` 增加 `--portable`** — 新增 `buildPortable()` 函数，把 11 个 iframe 的 `src="../{module}.html"` 替换为 `srcdoc="..."`（HTML attribute 转义 `&` 和 `"`），输出单文件 `deck/portable.html`。

2. **`~/.claude/commands/design-level.md` 新增 Phase 5.0** — 锁定后 Y/L/N 三选一交互生成 deck（Y=本地+单文件 / L=仅本地 / N=跳过）。失败不阻塞主流程，deck 是视图层不影响 manifest locked。

### 触发原因

用户反馈：`outputs/{case}/deck/index.html` 发到群里，接收方打开后 iframe 链接断裂（依赖同目录文件）。需要单文件可分发版本。

### 验证

| Case | index.html | portable.html | Slides |
|---|---|---|---|
| case_05_gangster_mansion | OK | 35.7 MB | 17 |

`grep -c 'iframe srcdoc=' portable.html` = 11，`grep -c 'iframe src="../'` = 0。所有模块成功内联。

### 设计判断

- **不内联 motion.min.js**：template 已有 CDN fallback（jsDelivr）+ 失败兜底（动效失效但内容可读），离线打开仍能正常浏览。inline 64KB 收益不大。
- **不做 URL 部署**：用户「先本地看」。GitHub Pages / Cloudflare Pages 等静态托管不需要服务器，等需要时再启动。
- **大小代价**：spatial_layout.html 因 base64 嵌图 27MB → portable 整体 35MB。可接受（文件少，发群一次性即可）。

### 文件清单

- `pipeline/render_deck.js` — +25 行（CLI 参数解析 + buildPortable 函数）
- `~/.claude/commands/design-level.md` — +24 行（Phase 5.0 段 + 交付清单 deck 块）

---

## [2026-04-27] v2.5.7 — Dist 包同步 + 路径统一

### 改动

1. **修正历史路径不一致** — `commands/{design-level,input-processor}.md` 中所有 `~/.claude/level-skill-pipeline/...` 全局替换为 `~/.claude/levelagent/...`，与 dist 安装目标 `INSTALL_DIR=$CLAUDE_DIR/levelagent` 对齐。共 11 处。

2. **同步 dist 包** (`~/Desktop/LevelAgent-dist/`):
   - 新增 `data/contracts/views/deck/`（README + contract.yaml + template.html + layouts.md + checklist.md + motion.min.js）
   - 新增 `data/pipeline/render_deck.js`
   - 新增 `commands/level-deck.md`
   - 覆盖 `commands/{design-level,input-processor}.md`（含 Phase 5.0 hook + 路径修正）

3. **安装脚本新增 level-deck.md 拷贝行**:
   - `安装.command`（macOS）
   - `installer.ps1`（Windows）

4. **本机 symlink** `~/.claude/levelagent → ~/LevelAgent`，让本机走与 dist 用户相同的路径，避免开发/安装路径分叉。

### 触发原因

用户问"包体上更新了吗"。检查发现 dist 包 4/17 旧版，缺 deck 整套；同时发现历史遗留：commands 引用 `~/.claude/level-skill-pipeline/`（symlink 到 `~/Desktop/level-skill-pipeline/src/`）但 dist 安装到 `~/.claude/levelagent/`，dist 用户装上后跑不通。

### 验证

- 本机：`node ~/.claude/levelagent/pipeline/render_deck.js case_05_gangster_mansion --portable` → 17 slides + 35.7MB portable.html ✓
- 伪 fresh install（cp dist 到 `/tmp/.../.claude/levelagent`）：同样跑通 ✓
- `grep level-skill-pipeline` in commands/ + dist/commands/ → 0 残留

### 教训

**dist 同步不能等到记起来才做**。应作为"contracts 改动"的下游强制步骤：改 `~/LevelAgent/contracts/` 或 `pipeline/` → 同步 dist → 验证 fresh install。下次新增 pipeline 脚本时，应一并更新 dist 安装脚本的 cp 行。

待办（不阻塞）：
- 把 `~/LevelAgent/Makefile` 或 `package.json` 加一个 `npm run sync-dist` 脚本，rsync 真源到 dist + 验证 fresh install，自动化此流程。
