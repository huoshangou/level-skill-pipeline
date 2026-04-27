# LevelAgent — AI 协作管线约定

> 本文件是新 session AI 的入口指南。30 秒内必读：本文 + 当前任务相关 contract.yaml。
> 详细架构 / 模块说明见 [README.md](README.md)。

## 一句话目标

把"关卡设计创意"变成"完整关卡设计文档"的确定性管线 — 11 模块 + Manifest 状态中枢。

## AI 入口指引

新 session 必读顺序：
1. **本文件** — 项目约定和红线
2. **`changelog.md`** — 最近改动 + 决策来源（含 v1.0 → v2.5 演进）
3. 任务相关 contract — `contracts/skills/{module}/contract.yaml`
4. 主流程 skill — `~/.claude/commands/design-level.md`

**不要**：在没读 contract 的情况下手改模板 / 凭印象做架构决策。

## 工作流约定

- **主入口**：用户调 `/design-level` 或 `/input-processor`，不要绕过
- **5 Phase 流程**：见 `~/.claude/commands/design-level.md`（IR 获取 → 跨案例匹配 → 类型裁剪 → 模块生成 → 组装 → 评分锁定 → 交付）
- **3 个 HITL 确认点**：IR 摘要 / 模块汇总 / 评分阈值
- **核心原则**：打分通过 = 版本锁定 = 不可重生成。改走 `/design-level --modify`

## 数据契约

所有契约在 `contracts/` 目录：

| 文件 | 用途 | 版本 |
|------|------|------|
| `ir_schema.json` | IR Schema v3.1 — 6 维度 | v3.1 |
| `manifest_schema.json` | Manifest 状态中枢 schema | — |
| `module_spec.md` | 产物模块规范 | — |
| `render_standards.md` | 统一视觉语言 | — |
| `flowchart_standards.md` | 流程图绘制规范 (ISO 5807) | — |
| `level_type_rules.md` | 类型 × 模块裁剪矩阵 | v1.0 |
| `case_index.json` | 跨案例知识索引（v2.5 新增） | v0.1 |
| `glossary.md` | 术语对齐 | — |
| `skills/{module}/contract.yaml` | 11 个模块的字段契约 | per-module |

**变更纪律**：改 schema 必先 bump version + 同步更新引用方。`changelog.md` 记一条「为什么改」。

## 红线（必须先问 Steve）

- 删除 `outputs/` 任何已 locked 的 case
- 修改 `contracts/*.json` schema（含 ir_schema、manifest_schema、case_index）— 必先讨论
- 跳过 HITL 确认节点（IR 摘要 / 模块汇总 / 评分阈值）
- 关闭"打分通过 = 锁定"约束（绕过修改流程直接重生成）
- 在没读上下文预算红线的情况下粘贴大图 / Read 大图文件（详见 design-level.md 的「上下文预算」段，曾因此撞死整个会话）
- 改 changelog 历史条目（只能追加新条目，不能改旧的）

## 验证规则

- **scorer.js**：4 维度 14 项检查（结构/一致性/规范性/保真度），≥0.7 通过、0.6-0.7 边界、<0.6 重试
- **check_hashes.js**：SHA-256 校验 manifest 与产物一致
- **manifest 状态机**：pending → generated → confirmed → locked
- **未通过 → 阻塞**：scorer < 0.6 不进 locked，不交付

## 反馈源

- **自动化**：scorer.js（结构层信号 — 结构/一致性/规范性/保真度）
- **人工**：`scoring/human_scores.json` v1.1 极简版（5 条空模板已就位，Steve 找时间填）
  - 重点：写自动 scorer 漏检的内容（设计意图清晰度 / 可玩性预判 / 给制作团队可执行性）
  - 跑过 ≥3 条评分后若发现重复模式 → 上提为固定维度字段（先用着不立法）
  - **新案例完成后**：design-level Phase 5 末尾应自动追加该 case 的空模板到 human_scores.json scores 数组

## 跨项目边界

- **个人 wiki**（`~/Desktop/obsidian-warehouse/my-llm-base-wiki/`）：通用方法论沉淀，**不要**把 LevelAgent 项目内 KB 写入个人 wiki，反向也不
- **battle-mvp**（`~/Desktop/battle-mvp/`）：独立项目，不与 LevelAgent 共享代码或 KB
- **survival-mvp**：参考来源，只读

## 工作模式

- 日常迭代由 Opus 4.7（本模型）主导
- 大型重构前用 Plan Mode 出方案 → Steve 确认 → 执行
- 不为「让代码跑起来」而绕过失败检查 — 找根本原因
- 每个 session 末尾若有非平凡改动，追加 `changelog.md` 一条

## 配套方法论

本项目是「AI 协作管线四盘」方法论的实证基础之一。理论文档：
- 个人 wiki：[[meta/思维框架/AI协作管线-四盘方法论]]
- 合格清单：[[meta/工具与系统/AI协作管线-合格标准]]
- 起源诊断：`~/Desktop/ai-production-deepdive/`

诊断结论：本项目最弱板是**知识盘**（C+），近期改进 = `case_index.json` + 本 CLAUDE.md（M1）+ 待启动 human_scores（M6）。

## 版本

CLAUDE.md v0.1（2026-04-27）— 首次建立。基于 ai-production-deepdive 诊断的 M1 缺失补足。
