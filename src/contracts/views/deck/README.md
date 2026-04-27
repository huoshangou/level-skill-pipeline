# Deck View

> 横向翻页 deck 视图。**呈现层壳** — 把 13 个模块用 iframe 包进 horizontal swipe 容器。
> 与 `assembled_document.html` 平级，是 N 模块（按 case_type 动态裁剪）的另一种聚合呈现 — 模块原内容 100% 保留，零编辑。

## 这是什么

`deck` 是 `contracts/views/` 下的第一个**视图层**契约。和 `contracts/skills/` 的关系：

| 层 | 角色 | 例子 |
|---|---|---|
| `contracts/skills/` | 数据生产者 | `level_overview` 渲一段卡片 |
| `contracts/views/` | 呈现层壳，跨模块串联 | `deck` 把 11 模块用 iframe 串成翻页 deck |

视图不参与 `manifest` 锁定流程，不影响 score。视图渲染失败不阻塞 pipeline。

## v0.2 关键设计判断（已踩坑）

**v0.1 走错了方向**：把 guizang 当成"叙事重构方法论"，写了 11 个关卡专用 layout（cover / triplet / big_quote / stat_grid / emotion_curve_svg / pipeline...），尝试把 IR 数据**重新编排成演讲式 PPT**。结果：丢失模块原本的细节、和模块抢饭吃、信息密度下降。

**v0.2 修正方向**：guizang 真正能给 LevelAgent 带来的不是"重新叙事"，而是**呈现层壳**：

- 横向滑动 + 翻页 JS（键盘 / 滚轮 / 触屏）
- 杂志感字体（衬线大标题 + 等宽元数据）
- WebGL 双背景（hero 页透出）
- hero / non-hero 节奏交替
- 章节封面（act_divider）

13 个模块的内容**原样不动**，通过 iframe 嵌入 deck 容器。每个模块 = 1 张 slide，slide 内部 iframe 独立滚动。

## 灵感来源

- `op7418/guizang-ppt-skill`（`~/references/guizang-ppt-skill/`）— 横向翻页杂志风
- 借鉴：5 套主题色 / template = 种子文件 / WebGL 背景 / 翻页 JS / P0 自检
- **未借鉴**：guizang 的 10 个通用 layout（演讲专用，不适合保留细节的设计文档）

## 文件结构

```
contracts/views/deck/
├── README.md           本文件
├── contract.yaml       视图契约（input/output/quality/theme/act_grouping）
├── template.html       种子文件（默认沙丘 + WebGL + 翻页 JS）
├── motion.min.js       Motion One 离线副本（约 64KB）
├── layouts.md          4 个 deck 编排骨架（cover/act_divider/module_wrap/coda）+ 玩法vs关卡术语表
└── checklist.md        P0-P3 自检规则（迭代踩坑总结）
```

渲染产物落到：

```
outputs/{case_id}/deck/
├── index.html          单文件 deck（iframe src 指向上一级 ../{module}.html）
└── motion.min.js       离线动效兜底
```

注意：deck 不复制 13 个模块文件，iframe src 用相对路径指向 `../{module}.html`，模块更新自动同步。

## 默认页结构（18 页 = 5 编排 + N 模块（按 case_type 动态裁剪））

| # | Layout | Theme | 内容（按术语 spatial / gameplay 切换）|
|---|---|---|---|
| 01 | cover | hero dark | 关卡名 / 玩法名 + Type + 一句话 hook |
| 02 | act_divider Act I | hero light | "关卡定调" / "玩法定调" |
| 03 | module_wrap | light | iframe → level_overview.html（"关卡概览" / "玩法概览"）|
| 04 | act_divider Act II | hero dark | "空间与氛围" / "机制与流程" |
| ... | module_wrap × N | light | spatial_layout (空间类) / atmosphere_ref / bubble_chart |
| ... | act_divider Act III | hero light | "节奏与情绪" |
| ... | module_wrap × N | light | emotion_curve / storyboard |
| ... | act_divider Act IV | hero dark | "制作需求" |
| ... | module_wrap × N | light | lighting_req / vfx_req / audio_req / tech_req / asset_list |
| 末 | coda | hero light | 收束 + 元数据展示 |

Act 分组写死在 contract.yaml `act_grouping`，新增模块需更新此处。
**spatial_topology 已在 v2.4 废弃，永不引用**。详见 layouts.md "已废弃" 段。

## 玩法 vs 关卡术语切换

由 `isGameplay()` 按 IR.type 判定（OpenWorldEvent / OpenWorldChallenge → 玩法类；POI → 空间类；MainMission/SideQuest 按 spatial_layout 是否存在兜底）。详细映射表见 layouts.md "E. 玩法 vs 关卡术语" 段 + memory/feedback_levelagent_gameplay_vs_level.md。

**玩法类 deck 不能出现「关卡」字样**（cover / chrome / kicker / foot 全部要切换）。

## case_type → theme 映射（硬规则）

deck 不允许任意自定义颜色 — 5 套主题色由 IR.type 决定。

| case_type | theme | 视觉 | 适用 |
|---|---|---|---|
| `POI` | 沙丘 dune | 炭灰 + 沙色 | 潜行 / 夜晚 / 复合空间 |
| `MECHANIC` | 墨水经典 ink_classic | 纯墨 + 暖米 | 玩法系统 / 通用 fallback |
| `STRATEGY` | 靛蓝瓷 indigo_porcelain | 深靛 + 瓷白 | 战略 / 技术评审 |
| `NARRATIVE` | 牛皮纸 kraft_paper | 深棕 + 暖米 | 叙事 / 文化 |
| `PROTOTYPE` | 森林墨 forest_ink | 森绿 + 象牙 | 原型展示 / 自然 / 生存 |

切换方法：`render_deck.js` 渲染时根据 IR.type 整体替换 `template.html` `:root{}` 块里的 6 行变量。

## 调用方式（v0.2 待实现，本期仅落地契约层）

### 集成调用（未来）

`/design-level` Phase 5 score 通过 + locked 后，新增 1 行 prompt：
> 「是否生成 deck 视图？(Y / N / Skip)」

用户选 Y → 调 `pipeline/render_deck.js {case_id}` → 写入 `outputs/{case_id}/deck/`。

### 独立调用（未来）

`~/.claude/commands/level-deck.md`（新 skill，待建）：
- 输入 case_id
- 校验 manifest.ir.status == 'confirmed' AND assembly.status == 'assembled'（拒绝草稿和未组装）
- 调 render_deck.js
- 浏览器打开

可反复调用、单独迭代视觉、不必重跑 pipeline。

## 隔离原则（避免污染主流程）

1. **数据源单一**：deck 只读 `ir_filled.json` + `manifest.json` + 11 个模块 HTML 文件，不改任何源
2. **iframe 隔离**：模块的 :root 主题、CSS 类名互不污染（每个模块在自己的 document context 内）
3. **不参与 score**：deck 是演示视图，不影响 `passed: true`
4. **不卡主流程**：deck 渲染失败只在日志报警告，不阻塞 lock
5. **输出隔离**：写入 `outputs/{case_id}/deck/index.html`，不与 11 模块文件混用文件名

## 试做参考

- `outputs/case_05_gangster_mansion/presentation_v2.html` — v0.1 试做（手写 15 页，叙事重构版本，**作为反例参考**）
- `outputs/case_05_gangster_mansion/presentation_v3_iframe.html` — **v0.2 试做（iframe 包装版本，当前方向）**

## 版本

- v0.2.0（2026-04-27）— 方向修正。从 11 layout 砍到 5 layout，引入 iframe 隔离规范。
- v0.1.0（2026-04-27）— 首次建立（已废弃叙事重构方向）。
