# LevelCraft Editor 增强计划 — 执行文档 v1.0

> **用途**：在新对话框里作为独立上下文直接执行，无需参考其他历史对话。
> **执行顺序**：P1 → P2 → P3 → P4（P4 为研究阶段，视情况执行）

---

## 一、项目背景与现状

### 文件结构

```
C:/Users/fenlier/Desktop/My Ai Work/LevelAgent/
└── contracts/skills/spatial_layout/
    ├── editor.html          ← 主文件，本次修改目标
    ├── levelcraft/
    │   ├── app.js           ← KluiYao LevelCraft React bundle (2.2MB)
    │   ├── htmlgame.js      ← 辅助脚本 (635B)
    │   ├── bundle.min.js    ← Three.js 相关
    │   ├── game.min.js      ← 游戏逻辑
    │   ├── lib.min.js       ← 工具库
    │   └── *.png            ← 资源图
    ├── template.html        ← spatial_layout 模块输出模板
    └── contract.yaml        ← 模块规范
```

### editor.html 结构（344 行）

```
行 1-2     : <!DOCTYPE html> + <html lang="zh-CN">
行 3-8     : <head> — 内联 Tailwind CSS (约 40KB，单行压缩)
行 9-19    : <body> — KluiYao React 预渲染 HTML (div#root)
行 20      : <script src="./levelcraft/app.js">  ← React bundle
行 22      : <script defer src="./levelcraft/htmlgame.js">
行 24-343  : 我们的注入层 <script>...</script>
行 344     : </body></html>
```

### KluiYao 原生能力（不需我们实现的）

- 矩形/多边形绘制、拖动、缩放、旋转
- Shift+点选多选、框选、撤销/重做
- 门/窗工具（带类型颜色配置）
- 楼梯工具（矩形直梯）
- 图层管理（floors，右侧「图层」tab）
- 2D/3D 切换（THREE.js 3D 视图，支持旋转/缩放）
- JSON 导入导出、FBX/GLTF/OBJ 导出
- 尺寸标注显示开关（right panel「显示尺寸标注」checkbox）
- AI 助手（chat 界面，可根据描述生成布局）
- 测量尺、切割工具、实体放置

### 我们注入层现状（v1.0）

注入层用 IIFE `(function(){...})()` 封装，当前实现：

**State：**
```js
const zoneImages  = {};  // { [shapeLabel]: [{src:base64, caption:''}] }
let   knownZones  = [];  // 从 SVG text 扫描到的区域名
let   selectedZone = null;
let   panelOpen   = false;
```

**功能：**
- `#la-toggle` 按钮（fixed, bottom:72px, right:308px）
- `#la-panel` 浮层：扫描区域 → 区域列表 → 点选区域 → 上传图片
- 区域检测：扫描 `svg text` 元素，过滤纯数字（尺寸标注）
- 图片管理：FileReader 读为 base64，thumbnail 网格，逐张删除
- **导出拦截**（两种策略）：
  - Strategy A: capture-phase `click` 监听 `a[download][href^=blob:]`
  - Strategy B: `MutationObserver` 监听 DOM 新增 `<a>` 元素
  - 检测到 layout JSON（`data.shapes` 为数组）时，按 `shape.label` 注入 `images[]`
  - 输出 `*_enriched.json`，附加 `_enrichedAt` 和 `_editorVersion`

**`buildBlob(data)`** — 核心 merge 函数（后续所有功能均需扩展此函数）：
```js
function buildBlob(data) {
  data.shapes = data.shapes.map(s => ({
    ...s,
    images: zoneImages[s.label]
      ? zoneImages[s.label].map(img => ({ src: img.src, caption: img.caption || '' }))
      : (s.images || [])
  }));
  data._enrichedAt    = new Date().toISOString();
  data._editorVersion = 'LevelAgent-2.0';
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
```

---

## 二、P1 — 单位 cm（自适应比例尺）

### 目标

KluiYao 的尺寸标注默认单位是"抽象网格单位"（默认 grid size = 20px）。
实现：用户设定基准比例（1 grid unit = X cm），根据当前缩放自动选择显示单位（m / cm / mm）。

### 设计方案

**基准系数**：`cmPerUnit`（默认 20，即 1格 = 20cm = 0.2m）

**自适应单位规则**（根据 KluiYao 当前缩放比）：

| zoom 范围 | 显示单位 | 换算 |
|-----------|----------|------|
| < 25%     | m        | rawUnits × cmPerUnit ÷ 100 |
| 25%–300%  | cm       | rawUnits × cmPerUnit |
| ≥ 300%    | mm       | rawUnits × cmPerUnit × 10 |

**格式化函数**：
```js
function formatDim(rawUnits, zoom, cmPerUnit) {
  const cm = rawUnits * cmPerUnit;
  if (zoom < 0.25) {
    const m = cm / 100;
    return m % 1 === 0 ? m + 'm' : m.toFixed(1) + 'm';
  } else if (zoom >= 3.0) {
    const mm = cm * 10;
    return mm % 1 === 0 ? mm + 'mm' : mm.toFixed(0) + 'mm';
  } else {
    return cm % 1 === 0 ? cm + 'cm' : cm.toFixed(1) + 'cm';
  }
}
```

**获取 KluiYao 当前缩放**：
KluiYao 顶栏有 `<span class="...">缩放: 100%</span>`，用以下方法实时读取：
```js
function getZoom() {
  const spans = document.querySelectorAll('span');
  for (const s of spans) {
    const m = s.textContent.match(/^缩放:\s*(\d+)%$/);
    if (m) return parseInt(m[1]) / 100;
  }
  return 1.0; // fallback
}
```

**识别尺寸标注 vs 区域名**：
KluiYao 的尺寸标注是纯数字，区域名是文字：
```js
function isDimensionLabel(text) {
  return /^\d+(\.\d+)?$/.test(text.trim());
}
```

**MutationObserver 监听维度标签**：
```js
let dimObserver = null;
function startDimObserver() {
  if (dimObserver) dimObserver.disconnect();
  dimObserver = new MutationObserver(() => rewriteDimensions());
  const svgEl = document.querySelector('svg');
  if (svgEl) dimObserver.observe(svgEl, { subtree: true, characterData: true, childList: true });
}

function rewriteDimensions() {
  const zoom = getZoom();
  document.querySelectorAll('svg text').forEach(t => {
    const raw = t.textContent.trim();
    if (!isDimensionLabel(raw)) return;
    const rawNum = parseFloat(raw);
    if (isNaN(rawNum)) return;
    // 保存原始值到 dataset，避免重复换算
    if (!t.dataset.laRaw) t.dataset.laRaw = raw;
    const original = parseFloat(t.dataset.laRaw);
    t.textContent = formatDim(original, zoom, cmPerUnit);
  });
}
```

**zoom 变化监听**：
```js
// 监听顶栏 zoom span 的文字变化
const topBarObserver = new MutationObserver(() => rewriteDimensions());
function startZoomWatch() {
  const topBar = document.querySelector('.absolute.top-4');
  if (topBar) topBarObserver.observe(topBar, { subtree: true, characterData: true, childList: true });
}
setTimeout(startZoomWatch, 1000); // React hydration 后再启动
```

### UI 变更

在 `#la-panel` 内 `.la-hdr` 下方插入新区块（在区域列表之前）：

```html
<div id="la-scale-section" style="padding:8px 12px;border-bottom:1px solid #E0D5C5;flex-shrink:0;">
  <div style="font-size:9px;color:#8A7D6B;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;">比例尺</div>
  <div style="display:flex;align-items:center;gap:6px;">
    <span style="font-size:10px;color:#5D5647;">1格 =</span>
    <input id="la-cm-input" type="number" min="1" max="10000" value="20"
      style="width:56px;border:1px solid #E0D5C5;border-radius:4px;padding:2px 6px;font-size:11px;color:#3D3929;background:#fff;text-align:right;">
    <span style="font-size:10px;color:#5D5647;">cm</span>
    <span id="la-zoom-display" style="margin-left:auto;font-size:9px;color:#A09585;font-family:monospace;"></span>
  </div>
  <div id="la-unit-preview" style="font-size:9px;color:#A09585;margin-top:3px;"></div>
</div>
```

输入框 change 事件更新 `cmPerUnit` 并重新渲染。

### 导出时写入 enriched JSON

在 `buildBlob` 中添加：
```js
data._scale = { cmPerUnit, note: '1 KluiYao grid unit = ' + cmPerUnit + ' cm' };
```

### 完成标准

- [ ] 面板里有比例尺设置区（1格 = __ cm，默认20）
- [ ] 画布上所有纯数字 SVG text 显示为 Xcm / Xm / Xmm
- [ ] 缩放操作后，单位自动切换
- [ ] 导出 JSON 含 `_scale` 字段
- [ ] 区域名（文字标签）不被误改

---

## 三、P2 — 标记系统（Marker / Pin）

### 目标

在画布上放置可交互的 Marker（敌人/掩体/视角/触发器/自定义），每个 Marker 可挂参考图。导出时写入 `_markers[]`。

### 设计方案

**State：**
```js
const markers = [];        // [{id, x, y, canvasX, canvasY, type, label, images, annotLayerId}]
let markerMode = false;    // 是否在放置模式
let selectedMarkerId = null;
let nextMarkerId = 1;
```

**Marker 类型定义：**
```js
const MARKER_TYPES = {
  viewpoint : { label:'视角',   color:'#7B9EBE', icon:'👁' },
  enemy     : { label:'敌人',   color:'#B85450', icon:'⚔' },
  cover     : { label:'掩体',   color:'#8B9F6B', icon:'🛡' },
  trigger   : { label:'触发器', color:'#C47643', icon:'⚡' },
  custom    : { label:'自定义', color:'#A09585', icon:'📍' }
};
```

**画布坐标系**：
KluiYao SVG 的 viewport transform 在 `<g transform="translate(tx, ty) rotate(r) scale(s)">` 里。
读法：
```js
function getSVGTransform() {
  // KluiYao 有两层 g，第一层是 grid，第二层是 shapes
  const gs = document.querySelectorAll('svg > g > g');
  for (const g of gs) {
    const t = g.getAttribute('transform') || '';
    // translate(tx, ty) scale(s) 或 translate(tx, ty) rotate(r) scale(s)
    const tm = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    const sm = t.match(/scale\(([-\d.]+)\)/);
    if (tm && sm) return { tx: +tm[1], ty: +tm[2], s: +sm[1] };
  }
  return { tx: 0, ty: 0, s: 1 };
}

// 屏幕坐标 → 画布坐标
function screenToCanvas(screenX, screenY) {
  const svgEl = document.querySelector('svg');
  if (!svgEl) return { x: 0, y: 0 };
  const rect = svgEl.getBoundingClientRect();
  const { tx, ty, s } = getSVGTransform();
  return {
    x: (screenX - rect.left - tx) / s,
    y: (screenY - rect.top  - ty) / s
  };
}
```

**Overlay SVG**：
```js
// 在 body 内添加透明 overlay，覆盖画布区域（left:64px, right:288px）
const markerOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
markerOverlay.id = 'la-marker-overlay';
markerOverlay.style.cssText = `
  position:fixed; left:64px; top:0; right:288px; bottom:0;
  pointer-events:none; z-index:9990;
  overflow:visible;
`;
document.body.appendChild(markerOverlay);
```

**放置 Marker**：
```js
// 在 markerMode=true 时，在画布 SVG 上监听 click
document.querySelector('.flex-1.relative.overflow-hidden')
  ?.addEventListener('click', e => {
    if (!markerMode) return;
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const id = nextMarkerId++;
    markers.push({ id, x, y, type: activeMarkerType, label: '', images: [], annotLayerId: null });
    renderMarkers();
    openMarkerEdit(id);
    setStatus(`已放置 ${MARKER_TYPES[activeMarkerType].label} 标记`);
  });
```

**渲染 Markers**：
```js
function renderMarkers() {
  markerOverlay.innerHTML = '';
  const { tx, ty, s } = getSVGTransform();
  const svgRect = document.querySelector('svg').getBoundingClientRect();

  markers.forEach(m => {
    // 画布坐标 → overlay 屏幕坐标
    const sx = m.x * s + tx;
    const sy = m.y * s + ty;
    const { color, icon } = MARKER_TYPES[m.type] || MARKER_TYPES.custom;

    // Pin 图形: circle + 竖线
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${sx},${sy})`);
    g.style.cssText = 'pointer-events:all;cursor:pointer;';
    g.dataset.markerId = m.id;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', 0); circle.setAttribute('cy', -14);
    circle.setAttribute('r', 8);
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', 1.5);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0); line.setAttribute('y1', -6);
    line.setAttribute('x2', 0); line.setAttribute('y2', 0);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', 1.5);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', 0); text.setAttribute('y', -11);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', 9);
    text.textContent = icon;

    // 图片小角标
    if (m.images.length > 0) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      badge.setAttribute('cx', 6); badge.setAttribute('cy', -20);
      badge.setAttribute('r', 5);
      badge.setAttribute('fill', '#C47643');
      const badgeTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeTxt.setAttribute('x', 6); badgeTxt.setAttribute('y', -20);
      badgeTxt.setAttribute('text-anchor', 'middle');
      badgeTxt.setAttribute('dominant-baseline', 'middle');
      badgeTxt.setAttribute('font-size', 6);
      badgeTxt.setAttribute('fill', '#fff');
      badgeTxt.textContent = m.images.length;
      g.append(badge, badgeTxt);
    }

    g.append(line, circle, text);
    g.onclick = e => { e.stopPropagation(); openMarkerEdit(m.id); };
    markerOverlay.appendChild(g);
  });
}
```

**Marker 编辑面板**（在 #la-panel 里切换显示）：
字段：label（输入框）、type（下拉或色块选择）、images（与区域图同样的上传组件）、删除按钮

### UI 变更

在 `#la-toggle` 旁边增加 `#la-marker-toggle` 按钮（bottom:72px, right:400px）。
或者在 `#la-panel` 里加「标记」tab，与「区域图片」tab 并列。

**推荐方案**：`#la-panel` 顶部加两个 tab：

```
[📷 区域图片]  [📍 标记]
```

### 导出扩展（buildBlob）

```js
data._markers = markers.map(m => ({
  id       : m.id,
  x        : m.x,
  y        : m.y,
  type     : m.type,
  label    : m.label,
  annotLayerId: m.annotLayerId,
  images   : m.images.map(img => ({ src: img.src, caption: img.caption || '' }))
}));
```

### 完成标准

- [ ] 面板有「标记」tab
- [ ] 可选标记类型（视角/敌人/掩体/触发器/自定义），点击画布放置
- [ ] 已放置标记在 SVG overlay 显示 pin 图形，类型用颜色区分
- [ ] 点击已有标记打开编辑面板（改名/改类型/上传图片/删除）
- [ ] 有参考图的标记显示图片数量角标
- [ ] 导出 JSON 含 `_markers[]`，图片为 base64
- [ ] KluiYao 自身的缩放/平移后，marker 位置自动跟随（需重新读 SVG transform）

---

## 四、P3 — 图层系统扩展（Annotation Layers）

### 目标

KluiYao 已有"楼层"图层（floors）。我们叠加一套**语义标注图层**（Annotation Layers），用于组织 Markers：敌人层、掩体层、视角层等。同时允许对每个标注层定义：高度、关联楼层、颜色。

### 设计方案

**概念澄清（两套平行系统）**：

| 系统 | 来源 | 用途 | 本次动作 |
|------|------|------|---------|
| KluiYao Floors | React 内部 | 区分楼层（1F/2F/屋顶） | 只读，我们从 DOM 读取名称 |
| Annotation Layers | 我们注入 | 标记分组（敌人/掩体/视角） | 完整 CRUD |

**State：**
```js
const annotLayers = [
  // 内置默认层
  { id:1, name:'视角分析', type:'viewpoint', color:'#7B9EBE', visible:true, height:170, floorId:null },
  { id:2, name:'敌人分布', type:'enemy',     color:'#B85450', visible:true, height:170, floorId:null },
  { id:3, name:'掩体分布', type:'cover',     color:'#8B9F6B', visible:true, height:100, floorId:null },
];
let nextLayerId = 4;
let activeAnnotLayerId = 1;
```

**读取 KluiYao 楼层**（从 DOM）：
```js
function getKluiYaoFloors() {
  // KluiYao 「图层」tab 里有楼层列表，通常是 div 列表
  // 选择器需要在实际运行时调试确认
  const floors = [];
  document.querySelectorAll('[data-panel="right"] button, [data-panel="right"] [role="button"]')
    .forEach(el => {
      const txt = el.textContent.trim();
      if (txt && txt.length < 30 && !['设置','图层','AI','2D','3D'].includes(txt)) {
        floors.push(txt);
      }
    });
  return [...new Set(floors)];
}
```

**Annotation Layer 参数字段**：
```
name     : string        — 层名称（可自定义）
type     : enum          — viewpoint/enemy/cover/trigger/custom
color    : hex string    — 层颜色（影响该层所有标记颜色）
visible  : boolean       — 控制该层所有标记可见性
height   : number (cm)   — 标记物高度，用于 3D 参考（如视角标记 → 相机高度170cm）
floorId  : string|null   — 关联的 KluiYao 楼层名（如 "1F"）
```

### UI 变更

`#la-panel` 变为三 tab 布局：

```
[📷 区域图片]  [📍 标记]  [📐 图层]
```

「图层」tab 内容：
- 图层列表（每行：颜色圆点 + 名称 + 可见眼 + 高度值 + 关联楼层下拉）
- 「+ 新建图层」按钮（输入名称 → 选类型 → 设颜色）
- 点击图层 → 激活（新放置的 Marker 自动归到该层）
- 图层颜色影响该层 Marker 的 pin 颜色（覆盖 MARKER_TYPES 默认色）

**关联楼层下拉**：
```html
<select id="la-floor-link-{id}">
  <option value="">不关联</option>
  <!-- 动态填充 KluiYao floors -->
</select>
```

### 与 P2 Marker 系统的联动

- 放置 Marker 时，自动归到当前激活的 annotLayer
- Marker 编辑面板中可以调整所属图层
- 图层 visible=false 时，该层所有 Marker 从 overlay 隐藏
- 图层颜色改变 → 重新渲染该层所有 Marker

### 导出扩展（buildBlob）

```js
data._annotationLayers = annotLayers.map(l => ({
  id      : l.id,
  name    : l.name,
  type    : l.type,
  color   : l.color,
  visible : l.visible,
  height  : l.height,   // cm
  floorId : l.floorId
}));
// _markers 已在 P2 中包含 annotLayerId
```

### 完成标准

- [ ] 面板有「图层」tab，显示所有 annotation layers
- [ ] 可新建/删除/重命名图层，设置颜色/高度/关联楼层
- [ ] 每层有可见性开关，隐藏后该层 Marker 消失
- [ ] 放置 Marker 时自动归到当前激活层
- [ ] 导出 JSON 含 `_annotationLayers[]`
- [ ] 从 KluiYao DOM 读取楼层名填入「关联楼层」下拉

---

## 五、P4 — 3D 模型导入（研究阶段）

### 范围说明

目标：在 KluiYao 3D 视图里叠加导入的 FBX/OBJ/GLTF 作为参考底模（ghost mesh）。

### 技术可行性预研

KluiYao 3D 视图使用 THREE.js，bundle 在 `levelcraft/bundle.min.js`（117KB）。

**研究步骤（执行前先完成）**：

1. **确认 THREE 是否暴露到 window**：
   在浏览器控制台输入 `window.THREE`，若有则可直接用 THREE.js loaders。

2. **找到 KluiYao 的 THREE.js scene**：
   ```js
   // 在控制台查找
   window.__THREE_DEVTOOLS__  // 或
   document.querySelector('canvas').__three  // 或
   // 全局搜索 scene 对象
   ```

3. **确认 FBXLoader/GLTFLoader 是否已打包**：
   ```js
   window.THREE?.FBXLoader || window.THREE?.GLTFLoader
   ```

4. 若 THREE 暴露 → 可注入加载器，往 scene 里添加 mesh（不透明度 0.3 的 ghost 材质）
5. 若未暴露 → 需要通过 Proxy 拦截 module 加载，或在 `levelcraft/` 目录单独加载 THREE 和 loaders

### 实现方案（待研究后选择）

**方案 A**（THREE 全局暴露）：
```js
// 拦截 KluiYao 的 renderer 初始化
// 注入加载器，读取用户上传的 FBX/OBJ/GLTF
// 添加 ghost mesh 到现有 scene
```

**方案 B**（THREE 未暴露，独立加载）：
```js
// 在 editor.html 里添加：
// <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js">
// + FBXLoader / GLTFLoader
// 监听 KluiYao canvas，创建第二个渲染器叠加（不推荐，复杂）
```

**方案 C**（替代方案，最简单）：
仅支持导入 JSON layout 作为"参考底图层"：
```js
// 用户导入另一个 layout JSON
// 在 2D 画布 SVG 上以 opacity:0.3 绘制另一套 shapes 轮廓
// 不影响 KluiYao 内部状态
```

### 完成标准（待定）

- [ ] 先完成预研（步骤 1-4），确认技术路线
- [ ] 根据预研结果选择方案，再制定详细计划

---

## 六、实施顺序与注意事项

### 统一修改位置

**所有修改都在 editor.html 的注入层 `<script>` 内完成**（行 32-343）。
不修改 KluiYao 的任何文件（app.js、htmlgame.js 等）。

### 注入层扩展规范

每次扩展，需更新以下部分：

1. **State 块**（文件约行 36-40）— 添加新的状态变量
2. **Styles 块**（行 43-131）— 添加新的 CSS（追加到 style.textContent）
3. **Panel HTML**（行 143-164）— 修改面板结构（添加 tab / 新区块）
4. **Wire events 块**（行 167-185）— 添加新事件绑定
5. **`buildBlob()` 函数**（行 323-333）— 追加新字段到导出 JSON

### 关键约束

- 注入层无法读取 React 内部 state，只能通过 DOM 查询和事件拦截
- KluiYao 的 SVG transform 格式：`translate(tx, ty) rotate(r) scale(s)` — 解析时注意 rotate 可能不存在
- `getSVGTransform()` 需要在每次 renderMarkers 前调用，因为用户平移/缩放会改变它
- `MutationObserver` 要注意性能，避免在频繁更新的节点上做重型操作
- 所有图片以 base64 存储，大图会导致 JSON 体积膨胀；可考虑限制分辨率（最大 800px）

### 测试验证方法

```
打开 editor.html → 双击（浏览器直接打开，无需 web server）
```

**P1 验证**：画几个矩形 → 开启尺寸标注 → 缩放画布 → 确认单位切换 → 导出 JSON 含 `_scale`

**P2 验证**：切到「标记」tab → 选「视角」→ 点击画布 → 确认 pin 出现 → 上传参考图 → 导出含 `_markers`

**P3 验证**：切到「图层」tab → 新建层「敌人-2F」关联楼层"2F" height=170 → 切回标记 → 放置 → 隐藏图层确认消失 → 导出含 `_annotationLayers`

---

## 七、Enriched JSON 最终 Schema（P1+P2+P3 完成后）

```jsonc
{
  "name": "黑帮大宅",
  "gridSize": 20,
  "shapes": [
    {
      "id": "...",
      "label": "主卧",
      "x": 100, "y": 80, "width": 200, "height": 160,
      "type": "room",
      // ... KluiYao 原始字段 ...
      "images": [                           // ← 我们注入（P1前已有）
        { "src": "data:image/jpeg;base64,...", "caption": "参考截图" }
      ]
    }
  ],
  "layers": [...],    // KluiYao 原始楼层数据
  "entities": [...],  // KluiYao 原始实体数据

  // ── 我们扩展的字段 ──────────────────────────────────────
  "_enrichedAt": "2026-04-16T10:00:00.000Z",
  "_editorVersion": "LevelAgent-3.0",

  "_scale": {                               // ← P1 新增
    "cmPerUnit": 20,
    "note": "1 KluiYao grid unit = 20 cm"
  },

  "_markers": [                             // ← P2 新增
    {
      "id": 1,
      "x": 340, "y": 220,
      "type": "viewpoint",
      "label": "主入口视角",
      "annotLayerId": 1,
      "images": [
        { "src": "data:image/jpeg;base64,...", "caption": "玩家视角参考" }
      ]
    }
  ],

  "_annotationLayers": [                    // ← P3 新增
    {
      "id": 1,
      "name": "视角分析",
      "type": "viewpoint",
      "color": "#7B9EBE",
      "visible": true,
      "height": 170,
      "floorId": "1F"
    }
  ]
}
```

---

*文档版本: v1.0 — 2026-04-16*
*执行时请保持 editor.html 为唯一修改目标，不修改 levelcraft/ 目录*
