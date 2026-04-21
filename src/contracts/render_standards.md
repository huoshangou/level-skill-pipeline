# 渲染标准 — Level Design Agent 产物视觉语言

> 源自 Level_Design_Agent_v4.html，所有 HTML 类产物必须遵循此标准。

## CSS 变量

```css
:root {
    --bg-primary: #F4F4F0;    /* 主背景 - 奶油色 */
    --bg-secondary: #E8E8E4;  /* 次背景 - 代码块/导航 */
    --bg-card: #FFFFFF;        /* 卡片背景 */
    --text-primary: #111111;   /* 主文字 */
    --text-secondary: #333333; /* 次文字 */
    --text-muted: #666666;     /* 弱文字 */
    --accent: #FF4500;         /* 强调色 - 橙红 */
    --border: #111111;         /* 主边框 */
    --border-light: #CCCCCC;   /* 轻边框 */
    --green: #228B22;          /* 成功/正面 */
    --blue: #4169E1;           /* 信息/RAG */
}
```

## 字体

- 正文：`'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif`
- 代码：`'JetBrains Mono', 'Fira Code', monospace`
- 行高：1.6
- 中文字号基准：14px

## 组件模式

### 卡片 `.card`
- 白色背景 + 2px `var(--border)` 实线边框
- 内边距 24px
- hover: 边框变 `var(--accent)`，上移 2px，阴影 `4px 4px 0 rgba(0,0,0,.1)`

### 提示框 `.callout`
- 白色背景 + 2px 实线边框
- 内边距 20px 24px
- 变体：
  - `.insight` — 左 4px `var(--accent)` 橙红（设计洞察）
  - `.warning` — 左 4px `#FF8C00` 橙色（警告/注意）
  - `.success` — 左 4px `var(--green)` 绿色（优势/正面）
  - `.blue` — 左 4px `var(--blue)` 蓝色（信息/RAG 相关）

### 标签 `.tag`
- 内联块，padding 2px 10px
- 1px 边框，10px 字号，600 字重
- `.p0` — `var(--accent)` 橙红
- `.p1` — `var(--text-secondary)` 灰

### 代码块
- `.code-header` — 标题栏（文件名），`var(--bg-secondary)` 背景
- `.code-block` — 代码内容，`var(--bg-secondary)` 背景 + 2px 边框

### 表格
- 条纹行（hover 时 `rgba(255,69,0,.03)` 微红）
- 表头：`var(--bg-secondary)` 背景 + 2px 下边框
- 单元格：12px 16px 内边距

## 技术约束

- 单个 HTML 文件（内联 CSS + JS）
- 不依赖外部 CDN（离线可用）
- 支持 Chrome / Edge 最新版
- 中文排版优化（适当字间距、行高 1.6+）

## 适用范围

- 评分报告 HTML 渲染
- BubbleChart SVG 预览页
- 后续所有 Skill 的 HTML 类产物
- 项目文档和报告
