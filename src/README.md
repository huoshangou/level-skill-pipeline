# Level Design Agent

> 大世界关卡设计 AI Agent — 从设计方案到完整关卡文档的自动化管线

## 架构

```
输入（文字/文档/图片）
    ↓
/input-processor   对话式 IR 填充器（5步对话 → ir_filled.json）
    ↓
/design-level      编排器 v2.1（读取 IR → 11模块生成 → 组装 → 评分）
    ↓
outputs/{case_id}/
    ├── manifest.json            状态中枢（模块版本/哈希/锁定状态）
    ├── assembled_document.html  完整关卡设计文档（11模块组装）
    ├── level_overview.html      01 关卡概览
    ├── bubble_chart.html        02 玩法逻辑流程图
    ├── bubble_chart.mmd         02 Mermaid 源文件（玩法模式）
    ├── emotion_curve.html       03 情绪节奏曲线
    ├── spatial_topology.html    04 空间拓扑图
    ├── asset_list.html          05 美术资产需求表
    ├── atmosphere_ref.html      06 氛围参考提示词
    ├── storyboard.html          07 核心流程分镜
    ├── lighting_req.html        08 灯光需求表
    ├── vfx_req.html             09 特效需求表
    ├── audio_req.html           10 音频需求表
    └── tech_req.html            11 程序需求文档
```

## 核心原则

- **打分通过 = 版本锁定 = 不可重生成** — 改走修改流程，不走重新生成
- **模板化生成** — 所有模块从 HTML 模板填充数据，消除 CSS/结构漂移
- **零依赖** — 产物为自包含 HTML，双击即可在浏览器打开
- **Manifest 驱动** — 每个模块的状态、版本、哈希均由 manifest.json 追踪

## 目录结构

```
contracts/              契约层
├── ir_schema.json        IR Schema v3.0（6维度）
├── manifest_schema.json  Manifest 状态中枢 schema
├── module_spec.md        产物模块规范
├── render_standards.md   统一视觉语言
├── flowchart_standards.md  流程图绘制规范（ISO 5807）
└── skills/               11 个模块的契约 + HTML 模板
    ├── bubble_chart/       contract.yaml + template.html + template_gameplay.html
    ├── emotion_curve/      ...
    └── ...

pipeline/               管线脚本
├── 01_input_processor.md   InputProcessor 执行指南
├── 02_skill_router.md      Skill Router 执行指南
├── 03_scorer.md            评分执行指南
├── render_gameplay_flow.js  Mermaid CLI → SVG → HTML 渲染
├── assemble_document.js     11 模块组装为完整文档
└── assemble_poi.py          [DEPRECATED] Python 版组装器

test_cases/             测试用例
├── case_01_truck/        卡车玩法（OpenWorldEvent）
│   ├── input.txt
│   └── ir_filled.json      IR v2.0（12节点）
└── case_02_artmuseum/    好莱坞艺术馆（POI）
    ├── input.txt
    └── ir_filled.json      IR v1.0（17节点）

outputs/                产物输出
├── case_01_truck/        11 模块 + 组装文档 + manifest
└── case_02_artmuseum/    11 模块 + 组装文档 + manifest

scoring/                评分框架
├── auto_rubric.json      自动评分规则
└── human_scores.json     人工评分记录
```

## 管线命令

```bash
# 渲染玩法流程图（Mermaid CLI 预渲染）
node pipeline/render_gameplay_flow.js outputs/case_01_truck

# 组装完整关卡设计文档
node pipeline/assemble_document.js outputs/case_01_truck
```

## 测试用例

| Case | 类型 | IR 版本 | 节点数 | 模块 | 评分 |
|------|------|---------|--------|------|------|
| case_01_truck | OpenWorldEvent | v2.0 | 12 | 11/11 locked | 0.97 PASS |
| case_02_artmuseum | POI | v1.0 | 17 | 11/11 locked | 0.97 PASS |

## 进度

见 [changelog.md](./changelog.md)
