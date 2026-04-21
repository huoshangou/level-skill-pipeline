# Scorer — 产物自动评分 + 人工评分收集

> 本文档是 Claude Code 执行评分阶段的操作指南。
> 读取产物 + IR + 评分规则 → 逐项检查 → 输出评分报告 → 收集人工评分

## 输入

- `outputs/{case_id}/bubble_chart.mmd`：Skill 产物
- `test_cases/{case_id}/ir_filled.json`：对应的 IR
- `scoring/auto_rubric.json`：评分规则

## 输出

- `outputs/{case_id}/score_report.json`：评分报告
- `scoring/human_scores.json`：人工评分记录（追加）

## 执行步骤

### 1. 自动评分

逐维度、逐检查项执行评分：

#### 结构完整性（30%）
- 检查是否有 START 节点（type=start 对应的 ID 出现在 .mmd 中）
- 检查是否有 END 节点（type=end 对应的 ID 出现在 .mmd 中）
- 检查关键路径是否连通（critical_path 中相邻节点之间有边）
- 检查节点数是否 ≤ 12（超过给 warning）

#### 一致性（30%）
- 对比 .mmd 中的节点 ID 集合与 IR.FLOW.nodes 的 ID 集合
- 对比 .mmd 中的边与 IR.FLOW.edges
- 检查 critical_path 上的边是否使用 ==>（粗线）
- 检查每个节点的 classDef 是否与 FEEL.emotional_beats 的 emotion 一致

#### 规范符合度（20%）
- 检查 `flowchart TD` 声明存在
- 检查节点标签是否中文
- 检查 classDef 定义是否完整（所有引用的类都有定义）

#### 信息保真度（20%）
- 检查是否有 IR 中不存在的节点（编造）
- 检查是否有 IR 中存在但 .mmd 中缺失的节点（遗漏）
- 检查 optional/fail/loop 边是否用虚线
- 检查有 label 的边是否保留标签

### 2. 计算总分

每个检查项：通过 = 不扣分，失败 = 扣 deduction_if_fail
维度分数 = 1.0 - Σ(扣分)，下限 0.0
总分 = Σ(维度分数 × 权重)

### 3. 输出评分报告

```json
{
  "case_id": "case_02_artmuseum",
  "skill": "BubbleChart",
  "timestamp": "2026-03-31T...",
  "auto_score": {
    "structure_completeness": {
      "score": 0.9,
      "weight": 0.3,
      "checks": [
        { "id": "sc_01", "passed": true },
        { "id": "sc_02", "passed": true },
        { "id": "sc_03", "passed": true },
        { "id": "sc_04", "passed": false, "detail": "17个节点，超过12个建议上限" }
      ],
      "deductions": [
        { "check_id": "sc_04", "amount": 0.1, "reason": "节点数17 > 12" }
      ]
    },
    ...其他维度...
    "weighted_total": 0.85
  },
  "human_score": null,
  "summary": "通过。17个节点超过建议上限（warning），其余各项正常。",
  "improvement_suggestions": [
    "考虑将部分线性过渡节点合并以减少总节点数"
  ]
}
```

### 4. 展示结果并收集人工评分

向用户展示：
1. 自动评分总分和各维度分数
2. 扣分项列表
3. 改进建议

然后请用户回答 3 个问题（1-5 分）：
1. **可用性**：拿到这个流程图，我能直接用于评审或开发沟通吗？
2. **准确性**：流程图描述的和我理解的设计意图一致吗？
3. **完整性**：有没有我觉得重要但流程图遗漏的信息？

### 5. 记录人工评分

追加到 `scoring/human_scores.json`：
```json
{
  "scores": [
    {
      "case_id": "case_02_artmuseum",
      "skill": "BubbleChart",
      "timestamp": "2026-03-31T...",
      "usability": 4,
      "accuracy": 5,
      "completeness": 3,
      "notes": "用户备注...",
      "auto_total": 0.85
    }
  ]
}
```

## 评分行为规则

- 总分 ≥ 0.7 → **通过**，展示结果，收集人工评分
- 总分 0.6-0.7 → **边界**，向用户报告扣分项，用户决定接受或重试
- 总分 < 0.6 → **需重试**，向用户报告所有扣分项和改进建议，用户决定重试或调整 IR
- 总分 < 0.4 → **失败**，标记为 Skill 问题，需排查 prompt 或 contract

**不自动重试** — 所有决策权交给用户。
