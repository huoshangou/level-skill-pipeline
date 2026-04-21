# Changelog

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
