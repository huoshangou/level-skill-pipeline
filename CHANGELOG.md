# Changelog

## v1.2 — 2026-04-27

**新增 Deck 视图层**（横向翻页杂志风文档）：
- `contracts/views/deck/`（README + contract.yaml + template.html + layouts.md + checklist.md + motion.min.js）
- `pipeline/render_deck.js`（用法 `node pipeline/render_deck.js <case_id> [--portable]`）
  - 默认输出 `deck/index.html`（同目录 iframe 引用，本地预览快、文件小）
  - `--portable` 输出 `deck/portable.html`（srcdoc 内联模块，单文件 ~30-60MB，可直接发微信/钉钉）
- `commands/level-deck.md` 独立 skill 入口
- `commands/design-level.md` Phase 5.0 hook：锁定后 Y/L/N 交互生成 deck，失败不阻塞主流程

**路径统一**：
- 所有 commands 中 `~/.claude/level-skill-pipeline/...` 全局替换为 `~/.claude/levelagent/...`，与安装目标 `INSTALL_DIR=$CLAUDE_DIR/levelagent` 对齐
- 修复 dist 用户安装后跑不通 node 命令的历史问题

**安装脚本更新**：
- `installers/installer.ps1` 与 `安装.command` 新增 `level-deck.md` 拷贝行

**累积同步**（自 v1.1 后开发分叉的回流）：
- 项目治理文档：`CLAUDE.md` / `README.md` / `changelog.md`
- 跨案例知识索引：`contracts/case_index.json`（含 v0.1 schema）
- 类型规则：`contracts/level_type_rules.md` 已被 commands 引用
- 新增脚本：`pipeline/{match_cases.js, regen_index.py, assemble_poi.py}`
- 修改脚本：`pipeline/{extractors.js, scorer.js, run_pipeline.js}`
- spatial_layout 增强计划：`contracts/skills/spatial_layout/EDITOR_ENHANCEMENT_PLAN.md`

**11 模块**（同 v1.1）：
level_overview · bubble_chart · emotion_curve · spatial_layout · asset_list · atmosphere_ref · storyboard · lighting_req · vfx_req · audio_req · tech_req

---

## v1.1 — 2026-04-21

**移除 spatial_topology 模块**（彻底清理，非软裁剪）：
- 删 `contracts/skills/spatial_topology/`（contract.yaml + template.html）
- 删 `pipeline/lib/extractors.js` 里的 `extractSpatialTopology` + `forceDirectedLayout`（共 226 行）
- 清 `pipeline/scorer.js` 里 `if (false && ...)` 的 region_coverage 占位
- `commands/design-level.md` 加 v2.4 版本说明
- 理由：bubble_chart 已覆盖流程拓扑，spatial_layout 已覆盖空间结构，独立的拓扑图模块冗余且历史上误导 LLM 把它当成"应该生成的产物"

**改进：**
- `release.sh` 一键发版（build + tag + push + GH release，含 pre-flight 检查）
- `.gitignore` 新增 `src/test_cases/case_03_*` `case_04_*` `case_05_*` 排除规则（公司内部 case 用 symlink 接入，不进 repo）

**11 模块（之前 12，移除 spatial_topology 后）：**
level_overview · bubble_chart · emotion_curve · spatial_layout · asset_list · atmosphere_ref · storyboard · lighting_req · vfx_req · audio_req · tech_req

---

## v1.0 — 2026-04-21

首个独立 release，从 LevelAgent 重命名为 Level Skill Pipeline。

**修复：**
- editor.html 5×5 grid 对齐 UE 标准（patch KluiYao app.js 的 6 处 `gridSize*4` → `gridSize*5`，根除 React 重渲染时 grid 闪回 4×4 的竞态）

**改进：**
- 安装器（macOS / Windows）全程写日志到 `~/level-skill-pipeline_install_<timestamp>.log`，含系统信息、每步耗时、npm install 全量输出、错误堆栈
- 安装器路径从 `~/.claude/levelagent/` 改为 `~/.claude/level-skill-pipeline/`

**架构：**
- 单一源码 repo，`build-dist.sh` 一键产出 release zip，根除手工同步源/工作副本/dist 三处的旧问题
- skill 文件路径统一用 `~/.claude/level-skill-pipeline/`，本地 dev 用 symlink，与同事安装态零差异

**Skills：**
- `/design-level` v2.3
- `/input-processor` v1.0
