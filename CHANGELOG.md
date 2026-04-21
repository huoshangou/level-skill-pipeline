# Changelog

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
