# Deck 布局库（4 种）

> deck 视图的布局比 guizang 通用 PPT 库少得多 — 因为 deck 不重新叙事，只把模块**包**进 slide 容器。
> 主体内容靠模块自身（contracts/skills/{module}/template.html 渲染的产物）。
> 编排 slide 只 4 种：cover / act_divider / module_wrap / coda。
>
> **永久禁项**（v0.2.1 决策）：
> - `open_loops` slide — uncertainty_flags 是 log 噪音，不应面向团队评审者出现在 deck 中
> - `spatial_topology` 模块引用 — 已在 changelog v2.4 移除（"功能由 bubble_chart + spatial_layout 共同覆盖"）
> - 任何"重新叙事"的 layout（stat_grid / triplet / big_quote / ...）— v0.1 走错过的方向

## 设计哲学（v0.2 修正）

guizang 的核心价值对 LevelAgent 来说**不是叙事重构**（cover / triplet / big_quote / stat_grid 这套演讲专用 layout），而是**呈现层壳**：

- 横向滑动 + 翻页 JS
- 杂志感字体（衬线大标题 + 等宽元数据）
- WebGL 双背景
- hero / non-hero 节奏交替

**13 个模块的内容原样不动**（属性表、SVG 流程图、卡片、配色都保留），通过 iframe 隔离嵌入 deck 容器。每个模块 = 1 张 slide，slide 内部 iframe 独立滚动。

试做参考：`outputs/case_05_gangster_mansion/deck/index.html`（17 页 deck = 1 cover + 4 act_divider + 11 modules + 1 coda）。

## 生成前必读

### A. 类名预检（同 guizang）

所有 chrome / kicker / foot / frame / lead / h-hero / meta-row 等类来自 `template.html` 的 `<style>` 块。不允许发明新类名。

### B. iframe 隔离规范（v3 核心）

**每个模块 slide 强制结构**：

```html
<section class="slide light">
  <div class="chrome">
    <div>{module_name} · {模块中文名}</div>
    <div>{page} / {total}</div>
  </div>
  <div style="padding:5vh 4vw 2vh; display:flex; flex-direction:column; height:100vh; box-sizing:border-box">
    <div class="kicker" style="margin-bottom:1vh">Module · {模块短描述}</div>
    <iframe src="{module}.html" loading="lazy"
            style="flex:1; width:100%; border:1px solid rgba(var(--ink-rgb),.15); background:#fff; border-radius:2px;"></iframe>
  </div>
  <div class="foot">
    <div>来源 · {module}.html · {可选元数据}</div>
    <div>Page {page} · {module}</div>
  </div>
</section>
```

**为什么 iframe 而非 srcdoc / shadow DOM**：
- iframe src 文件路径稳定，内容更新自动同步（不用重新嵌入字符串）
- 完全 CSS 隔离，13 个模块各自的 :root 主题色互不污染
- iframe 内独立滚动，完美承接 spatial_layout (7345 行) 这种长内容
- shadow DOM 浏览器兼容性更脆，且要 JS 注入

**height: 100vh 关键**：让 iframe 占满 slide 视口高度，内部独立滚动；外部 deck 仍按 100vh × N 横向排列。

**视觉上的"杂志感"来源**：iframe 加 1px 浅边 + 白底 + 圆角 2px → 看起来像"杂志里内插的彩印附录"，而非"嵌图"。

### C. 主题节奏（同 v0.1）

- 每页 `<section>` 必须带 `light` / `dark` / `hero light` / `hero dark`
- module_wrap 全部 `light`（保留模块原视觉），act_divider 全部 hero（light/dark 交替制造节奏）
- 全 deck ≥1 hero dark + ≥1 hero light（4 个 act_divider 必须 light/dark 交替）

### D. 默认页结构（动态计算）

总页数 = 1 cover + N act_dividers + N modules + 1 coda（**不再有 open_loops**）

**空间类满配（POI 11 模块齐全）**：17 页 = 1 + 4 + 11 + 1
**玩法类裁剪（OpenWorldEvent 仅核心 6 模块）**：12 页 = 1 + 4 + 6 + 1

| 段 | Layout | Theme | 内容（按术语 spatial / gameplay 切换）|
|---|---|---|---|
| 01 | L1 cover | hero dark | 关卡名 / 玩法名 + Type + 一句话 hook |
| 02 | L2 act_divider Act I | hero light | "关卡定调" / "玩法定调" |
| 03 | L3 module_wrap | light | iframe → level_overview.html |
| 04 | L2 act_divider Act II | hero dark | "空间与氛围" / "机制与流程" |
| ... | L3 module_wrap × N | light | spatial_layout / atmosphere_ref / bubble_chart |
| ... | L2 act_divider Act III | hero light | "节奏与情绪" |
| ... | L3 module_wrap × N | light | emotion_curve / storyboard |
| ... | L2 act_divider Act IV | hero dark | "制作需求" |
| ... | L3 module_wrap × N | light | lighting_req / vfx_req / audio_req / tech_req / asset_list |
| 末 | L4 coda | hero light | 收束 + 元数据 |

**Act 分组规则**（render_deck.js 写死，模块按 manifest 实际状态动态过滤）：
- Act I：level_overview
- Act II：spatial_layout / atmosphere_ref / bubble_chart（**注意：spatial_topology 已废弃 v2.4，永不引用**）
- Act III：emotion_curve / storyboard
- Act IV：lighting_req / vfx_req / audio_req / tech_req / asset_list

新增模块时需更新 `contract.yaml` 的 `act_grouping` 配置 + render_deck.js 的 `ACT_TEMPLATE`。

### E. 玩法 vs 关卡术语（硬规则）

`isGameplay()` 由 IR.type 判定：
- `OpenWorldEvent` / `OpenWorldChallenge` → 玩法类
- `POI` → 空间类
- `MainMission` / `SideQuest` → 按 spatial_layout.html 是否存在兜底（来源 level_type_rules.md）

| 字段 | 空间类 | 玩法类 |
|---|---|---|
| 文档类型名 | 关卡设计文档 / Level Design Document | 玩法设计文档 / Gameplay Design Document |
| level_overview 中文名 | 关卡概览 | 玩法概览 |
| Act I 标题 | 关卡定调 | 玩法定调 |
| Act II 标题 | 空间与氛围 | 机制与流程 |
| Act III / IV | 节奏与情绪 / 制作需求 | 节奏与情绪 / 制作需求 |
| coda 大字号 | "N 个模块 · 一份**关卡**文档" | "N 个模块 · 一份**玩法**文档" |

**永远不能在玩法类 deck 中出现「关卡」字样**（cover / chrome / kicker / foot 全部要切换）。详见 memory/feedback_levelagent_gameplay_vs_level.md。

---

## L1 · cover · 关卡封面

```html
<section class="slide hero dark">
  <div class="chrome">
    <div>{{REGION_GROUP}} · {{TYPE_TAG}}</div>
    <div>Vol.{{CASE_INDEX}} · {{DATE}}</div>
  </div>
  <div class="frame" style="display:grid; gap:4vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>{{TYPE}} · {{TONE_TAG}}</div>
    <h1 class="h-hero" data-anim>{{LEVEL_NAME}}</h1>
    <h2 class="h-sub" data-anim>{{SUBTITLE}}</h2>
    <p class="lead" style="max-width:62vw" data-anim>{{HOOK_PARAGRAPH}}</p>
    <div class="meta-row" data-anim>
      <span>{{LEVEL_ID}}</span><span>·</span><span>v{{IR_VERSION}}</span><span>·</span><span>{{CONFIRMED_AT}}</span>
    </div>
  </div>
  <div class="foot">
    <div>关卡设计文档 · Level Design Document</div>
    <div>— {{PROJECT}} · {{REGION_GROUP}} —</div>
  </div>
</section>
```

要点：deck 唯一的"叙事性"slide。HOOK_PARAGRAPH 1-2 句给关卡画面感开场。其他 17 页都不重新叙事。

---

## L2 · act_divider · 章节幕封

```html
<section class="slide hero {light|dark}">
  <div class="chrome">
    <div>Act {{N}} · {{ACT_TITLE}}</div>
    <div>Act {{N}} · {{PAGE}} / {{TOTAL}}</div>
  </div>
  <div class="frame" style="display:grid; gap:6vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>Act {{N}}</div>
    <h1 class="h-hero" style="font-size:8.5vw" data-anim>{{ACT_TITLE}}</h1>
    <p class="lead" style="max-width:55vw" data-anim>{{ACT_SUBTITLE}}</p>
  </div>
  <div class="foot">
    <div>第{{N}}幕 · Modules {{MODULES_RANGE}} · {{MODULE_NAMES}}</div>
    <div>— · —</div>
  </div>
</section>
```

要点：4 个 act 强制 hero light / hero dark **交替**。ACT_TITLE 4 字内（"关卡定调" / "空间与氛围" / "节奏与情绪" / "制作需求"）。foot 列出本 act 包含的模块名，给读者预期。

---

## L3 · module_wrap · 模块包装（核心）

```html
<section class="slide light">
  <div class="chrome">
    <div>{{MODULE_NAME}} · {{MODULE_NAME_ZH}}</div>
    <div>{{PAGE}} / {{TOTAL}}</div>
  </div>
  <div style="padding:5vh 4vw 2vh; display:flex; flex-direction:column; height:100vh; box-sizing:border-box">
    <div class="kicker" style="margin-bottom:1vh">Module · {{MODULE_DESC}}</div>
    <iframe src="{{MODULE_FILENAME}}" loading="lazy"
            style="flex:1; width:100%; border:1px solid rgba(var(--ink-rgb),.15); background:#fff; border-radius:2px;"></iframe>
  </div>
  <div class="foot">
    <div>来源 · {{MODULE_FILENAME}} · {{OPTIONAL_META}}</div>
    <div>Page {{PAGE}} · {{MODULE_NAME}}</div>
  </div>
</section>
```

**这是 deck 的核心 layout，13 个模块全用这个**。

要点：
- `height:100vh` + `box-sizing:border-box` 是 iframe 撑满 slide 视口的关键
- iframe 必须 `loading="lazy"` 避免一次性加载 13 个模块拖慢首屏
- iframe 边框用 `rgba(var(--ink-rgb),.15)`：跟随 deck 主题色变浅，不抢眼
- chrome / kicker / foot 是 deck 沙丘风；iframe 内是模块自有视觉（橙色 #FF4500 等）— 故意的层次感

**MODULE_DESC 由 contract.yaml 配置**（不要 LLM 现编）：
- `level_overview`: "关卡概览"
- `spatial_layout`: "空间布局 · 2D / 3D 交互"
- `atmosphere_ref`: "氛围参考 · 各区域 mood prompt"
- `bubble_chart`: "核心流程图"
- `emotion_curve`: "emotional_beats SVG 曲线"
- `storyboard`: "关键分镜 · 演出节点拆解"
- `lighting_req`: "灯光需求 · 主线烘焙 / Boss 工地灯"
- `vfx_req`: "特效需求"
- `audio_req`: "音频需求 · 区域级 mood"
- `tech_req`: "技术需求 · 系统依赖 + 硬约束"
- `asset_list`: "资产清单 · required + reuse_candidates"

---

## ~~L4 · open_loops~~（v0.2.1 永久移除）

uncertainty_flags 在 LevelAgent 主流程中早已被用户标记为「log 噪音」并从模块输出中删除（changelog 早期记录）。把它做成 hero dark 的"团队问题"页是变相把噪音重新搬到面向评审者的 deck 中，**违反用户原始意图**。永久禁用，不要再加回。

如果未来确实需要展示未决项，应该在 module 级（如 level_overview）按各 module 自己的契约决定，**不归 deck 视图层管**。

---

## L4 · coda · 收束

```html
<section class="slide hero light">
  <div class="chrome">
    <div>Coda · 收束</div>
    <div>{{PAGE}} / {{TOTAL}}</div>
  </div>
  <div class="frame" style="display:grid; gap:5vh; align-content:center; min-height:80vh">
    <div class="kicker" data-anim>End of Deck</div>
    <h1 class="h-hero" style="font-size:7vw; line-height:1.2" data-anim>{{COMPLETION_LINE}}</h1>
    <p class="lead" style="max-width:62vw" data-anim>{{NEXT_STEP_PARAGRAPH}}</p>
    <div data-anim style="display:flex; gap:2vw; max-width:70vw; margin-top:1vh; font-family:var(--mono); font-size:max(11px,.85vw); opacity:.7; flex-wrap:wrap">
      <span>{{MODULE_COUNT}} modules · {{ACT_COUNT}} acts · {{TOTAL_PAGES}} slides</span>
      <span>·</span>
      <span>IR v{{IR_VERSION}}</span>
      <span>·</span>
      <span>Auto Score {{AUTO_SCORE}}</span>
    </div>
    <div class="meta-row" data-anim style="margin-top:2vh">
      <span>LevelAgent · pipeline {{PIPELINE_VERSION}}</span><span>·</span><span>deck v{{DECK_VERSION}}</span>
    </div>
  </div>
  <div class="foot">
    <div>End of Deck · {{LEVEL_NAME}} · {{TYPE_TAG}}</div>
    <div>— {{PROJECT}} · {{YEAR}} —</div>
  </div>
</section>
```

要点：`hero light` 收束。COMPLETION_LINE 一句话表态。下方 meta 注入 manifest 信息。

---

## 已废弃的 layout（按删除时间排）

| 版本 | layout | 删除原因 | 内容应来自哪 |
|---|---|---|---|
| v0.2.1 | **L4 open_loops** | uncertainty_flags 早被用户标为「log 噪音」从主流程删除，不应在面向团队的 deck 中重新出现 | module 级（如 level_overview）按各模块自己的契约决定 |
| v0.2 | L3 stat_grid（数据大字报） | 演讲式压缩，丢失 IR 细节 | level_overview 模块（属性表 + 数据摘要表）|
| v0.2 | L4 triplet（Fantasy/Challenge/Sensation 三联） | 重新叙事 | level_overview 模块（核心体验卡片）|
| v0.2 | L5 big_quote（设计意图金句） | 抽离 overall_tone 单独成页 = 信息稀疏 | level_overview 模块（设计说明段）|
| v0.2 | L6 text_image（图文混排） | 把流程图 + 文字摘要重新排版 | spatial_layout 或 bubble_chart 模块 |
| v0.2 | L7 zone_grid（区域卡片网格） | 跟 atmosphere_ref 重复 | atmosphere_ref 模块 |
| v0.2 | L8 emotion_curve（SVG 曲线） | 跟 emotion_curve 模块完全重复 | emotion_curve 模块（已是 SVG）|
| v0.2 | L9 pipeline（流水线） | 跟 storyboard / bubble_chart 部分重复 | storyboard 或 bubble_chart |

## 已废弃的模块引用（永不在 deck 中出现）

| 模块 | 删除版本 | 原因 |
|---|---|---|
| `spatial_topology` | LevelAgent v2.4 | 「功能由 bubble_chart（流程拓扑）+ spatial_layout（完整空间布局）共同覆盖，独立拓扑图属冗余」。即使旧 case 目录里仍有 spatial_topology.html 文件（历史遗留），也不要在 ACT_TEMPLATE 里引用 |

教训：
1. **deck 不该和模块抢饭吃**。模块负责"信息层"，deck 负责"呈现层"，互不重叠。
2. **改 LevelAgent 任何视图前必查 changelog**（grep "废弃|移除|删除"），避免把过去删过的东西加回。详见 memory/feedback_levelagent_check_changelog.md。
