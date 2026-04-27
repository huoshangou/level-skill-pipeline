/**
 * extractors.js — 模块数据提取器集合
 *
 * 每个提取器: (irSlice) => { vars: {}, repeats: [], sections?: [] }
 * irSlice 是经过 slice_ir 裁剪后的 IR 子集
 *
 * 注册方式: 在 fill_template.js 中调用 registerExtractor(key, fn)
 */

// ============================================================================
// 工具函数
// ============================================================================

function ts() { return new Date().toISOString().split('T')[0]; }

/** 从 emotional_beats 中找到匹配节点的情绪 */
function findBeat(beats, nodeId) {
    return beats.find(b => b.node === nodeId) || null;
}

/** 从 audio_intent 中找到匹配区域的音频意图 */
function findAudio(audioIntents, regionId) {
    return audioIntents.find(a => a.region === regionId) || null;
}

/** 区域 ID → 名称映射 */
function buildRegionMap(regions) {
    const m = {};
    for (const r of regions) m[r.id] = r.name;
    return m;
}

/** 情绪 → 颜色映射 */
const EMO_COLORS = {
    tension_low: '#8BC34A', tension_medium: '#FF9800', tension_spike: '#F44336',
    dread: '#9C27B0', relief: '#2196F3', wonder: '#00BCD4', excitement: '#FF5722',
};
function emoColor(emotion) { return EMO_COLORS[emotion] || '#999999'; }

// ============================================================================
// lighting_req 提取器
// ============================================================================
function extractLightingReq(irSlice) {
    const regions = irSlice.SPACE?.regions || [];
    const beats = irSlice.FEEL?.emotional_beats || [];
    const audioIntents = irSlice.FEEL?.audio_intent || [];
    const tone = irSlice.FEEL?.overall_tone || '';

    const regionRows = regions.map(r => {
        const beat = findBeat(beats, r.id) || {};
        const audio = findAudio(audioIntents, r.id);
        return {
            region_name: r.name,
            region_id: r.id,
            floor: r.elevation || '—',
            primary_light: '—',
            color_temp_swatch: '#FFF8E1',
            color_temp_desc: '暖色调',
            brightness: '—',
            special_lights: '—',
            emotion_support: audio?.mood || beat.emotion || '—',
            reference: '—',
        };
    });

    // 灯光转场：从 emotional_beats 中找强度变化大的节点
    const transitionRows = [];
    for (let i = 1; i < beats.length; i++) {
        const diff = Math.abs((beats[i].intensity || 0) - (beats[i - 1].intensity || 0));
        if (diff >= 0.2) {
            transitionRows.push({
                trigger_point: beats[i].node,
                light_change: `${beats[i - 1].emotion} → ${beats[i].emotion}`,
                transition_type: diff >= 0.4 ? '硬切' : '渐变',
                duration: diff >= 0.4 ? '0.5s' : '2-3s',
            });
        }
    }
    if (transitionRows.length === 0) {
        transitionRows.push({ trigger_point: '—', light_change: '暂无转场', transition_type: '—', duration: '—' });
    }

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            region_count: regions.length,
            environment: irSlice.SPACE?.environment_type || '—',
            timestamp: ts(),
            lighting_overview: tone,
        },
        repeats: [regionRows, transitionRows],
    };
}

// ============================================================================
// vfx_req 提取器
// ============================================================================
function extractVfxReq(irSlice) {
    const assets = irSlice.ASSET?.required_assets || [];
    const vfxAssets = assets.filter(a => a.type === 'vfx');

    const vfxRows = vfxAssets.length > 0
        ? vfxAssets.map((v, i) => ({
            vfx_index: i + 1,
            vfx_name: v.id,
            vfx_description: v.notes || '—',
            priority: v.priority === 'must_have' ? '必要' : '可选',
            priority_tag: v.priority === 'must_have' ? 'must' : 'nice',
            trigger_nodes: '—',
            regions: v.region || '—',
            tech_notes: '—',
            perf_level: '低',
            perf_tag: 'low',
        }))
        : [{ vfx_index: 1, vfx_name: '—', vfx_description: '暂无 VFX 需求', priority: '—', priority_tag: 'nice', trigger_nodes: '—', regions: '—', tech_notes: '—', perf_level: '—', perf_tag: 'low' }];

    // 性能风险行 — 简单默认
    const perfRows = [{ risk_point: '—', perf_level: '—', perf_tag: 'low', mitigation: '暂无', related_vfx: '—' }];

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            vfx_count: vfxAssets.length,
            timestamp: ts(),
        },
        repeats: [vfxRows, perfRows],
    };
}

// ============================================================================
// audio_req 提取器
// ============================================================================
function extractAudioReq(irSlice) {
    const audioIntents = irSlice.FEEL?.audio_intent || [];
    const regions = irSlice.SPACE?.regions || [];
    const tone = irSlice.FEEL?.overall_tone || '';

    const ambienceRows = audioIntents.length > 0
        ? audioIntents.map(a => ({
            region_name: a.region,
            ambience_description: a.notes || a.mood || '—',
            emotion: a.mood || '—',
            volume_level: '中',
            spatialization: '3D',
            reference: '—',
        }))
        : [{ region_name: '—', ambience_description: '暂无', emotion: '—', volume_level: '—', spatialization: '—', reference: '—' }];

    // BGM 行 — 从 emotional_beats 推导，模板列: 区域/音乐风格/节奏BPM/情绪/触发方式/过渡/参考/优先级
    const beats = irSlice.FEEL?.emotional_beats || [];
    const regionMap = buildRegionMap(regions);
    const bgmRows = [];
    let currentStyle = '';
    for (const b of beats) {
        const style = b.intensity >= 0.7 ? '紧张/战斗' : b.intensity >= 0.4 ? '探索/悬疑' : '安静/氛围';
        if (style !== currentStyle) {
            const node = (irSlice.FLOW?.nodes || []).find(n => n.id === b.node);
            bgmRows.push({
                region_name: regionMap[node?.region] || node?.region || b.node,
                music_style: style,
                bpm: b.intensity >= 0.7 ? '120-140' : b.intensity >= 0.4 ? '80-100' : '60-80',
                emotion: b.emotion || '—',
                trigger: '进入区域',
                transition: currentStyle ? `从"${currentStyle}"过渡` : '开始',
                reference: '—',
                priority: b.intensity >= 0.7 ? '必要' : '建议',
                priority_tag: b.intensity >= 0.7 ? 'must' : 'nice',
            });
            currentStyle = style;
        }
    }
    if (bgmRows.length === 0) {
        bgmRows.push({ region_name: '—', music_style: '—', bpm: '—', emotion: '—', trigger: '—', transition: '—', reference: '—', priority: '—', priority_tag: 'nice' });
    }

    // SFX 行 — 模板列: #/音效名称/触发节点/描述/空间化/优先级
    const soundAssets = (irSlice.ASSET?.required_assets || []).filter(a => a.type === 'sound');
    const sfxRows = soundAssets.length > 0
        ? soundAssets.map((s, i) => ({
            sfx_index: i + 1,
            sfx_name: s.id,
            trigger_nodes: s.region || '—',
            sfx_description: s.notes || '—',
            spatialization: '3D',
            priority: s.priority === 'must_have' ? '必要' : '建议',
            priority_tag: s.priority === 'must_have' ? 'must' : 'nice',
        }))
        : [{ sfx_index: 1, sfx_name: '—', sfx_description: '暂无特殊 SFX', trigger_nodes: '—', spatialization: '—', priority: '—', priority_tag: 'nice' }];

    // 模板 REPEAT 顺序: BGM → SFX → Ambience
    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            region_count: audioIntents.length || regions.length,
            audio_overview: tone,
            timestamp: ts(),
        },
        repeats: [bgmRows, sfxRows, ambienceRows],
    };
}

// ============================================================================
// atmosphere_ref 提取器
// ============================================================================
function extractAtmosphereRef(irSlice, caseDir) {
    const beats = irSlice.FEEL?.emotional_beats || [];
    const audioIntents = irSlice.FEEL?.audio_intent || [];
    const regions = irSlice.SPACE?.regions || [];
    const regionMap = buildRegionMap(regions);
    const nodes = irSlice.FLOW?.nodes || [];

    // 加载 image_manifest（可选）
    let imageEmbed = null;
    let manifest = null;
    let PROJECT_ROOT = null;
    let caseId = null;
    if (caseDir) {
        try {
            const path = require('path');
            const fs = require('fs');
            PROJECT_ROOT = path.resolve(__dirname, '..', '..');
            caseId = path.basename(caseDir);
            imageEmbed = require('./image_embed');
            manifest = imageEmbed.loadManifest(PROJECT_ROOT, caseId);
        } catch (e) {
            console.warn('[atmosphere_ref] image_embed failed:', e.message);
        }
    }

    // 尝试读取用户手填的 atmosphere_assets.json（优先级最高）
    let manualRegionImages = null;
    if (caseDir && PROJECT_ROOT && caseId) {
        const path = require('path');
        const fs = require('fs');
        const manualPath = path.join(PROJECT_ROOT, 'test_cases', caseId, 'atmosphere_assets.json');
        if (fs.existsSync(manualPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(manualPath, 'utf-8'));
                manualRegionImages = {};
                for (const [regionId, entry] of Object.entries(raw)) {
                    if (regionId.startsWith('_')) continue;
                    // entry 格式：string[] 或 { images: string[], _中文名: "..." }
                    const files = Array.isArray(entry) ? entry : (entry.images || []);
                    if (files.length > 0) {
                        manualRegionImages[regionId] = files
                            .filter(f => typeof f === 'string' && f.trim())
                            .map(f => ({
                                src: `../../test_cases/${caseId}/images/${f.trim()}`,
                                caption: f.trim(),
                            }));
                    }
                }
            } catch (e) {
                console.warn('[atmosphere_ref] Failed to parse atmosphere_assets.json:', e.message);
                manualRegionImages = null;
            }
        }
    }

    // 按区域分组生成 section HTML（嵌套 REPEAT 需要预生成）
    const regionGroups = {};
    for (const beat of beats) {
        const node = nodes.find(n => n.id === beat.node);
        const regionId = node?.region || 'unknown';
        if (!regionGroups[regionId]) regionGroups[regionId] = [];
        regionGroups[regionId].push({ beat, node });
    }

    // 每个区域取一组参考图：手填优先，否则走自动匹配
    const regionImages = {};
    if (manualRegionImages) {
        // 手填模式：直接使用
        Object.assign(regionImages, manualRegionImages);
    } else if (manifest && imageEmbed) {
        // 自动匹配模式
        for (const regionId of Object.keys(regionGroups)) {
            const regionName = regionMap[regionId] || regionId;
            const imgs = imageEmbed.getRegionImages(manifest, regionId, regionName, caseId, PROJECT_ROOT, {
                maxImages: 3,
                maxSizeKB: 1500,
            });
            if (imgs.length > 0) regionImages[regionId] = imgs;
        }
    }

    let globalIndex = 1;
    const sections = [];

    // 整体参考图画廊（放在所有 region-section 之前）
    if (manifest && imageEmbed) {
        const galleryHtml = imageEmbed.buildAtmoGalleryHtml(manifest, caseId, PROJECT_ROOT);
        if (galleryHtml) sections.push(galleryHtml);
    }

    for (const [regionId, items] of Object.entries(regionGroups)) {
        const regionName = regionMap[regionId] || regionId;
        const audio = findAudio(audioIntents, regionId);
        const beatName = items[0]?.beat?.emotion || '—';
        const refImgs = regionImages[regionId] || [];

        // 各行图片：轮流使用 refImgs（不够则降级为 placeholder）
        const rows = items.map(({ beat, node }, rowIdx) => {
            const idx = globalIndex++;
            const refImg = refImgs[rowIdx % refImgs.length];
            let imgCell;
            if (refImg) {
                imgCell = `<div class="img-ref" style="width:100%;height:110px;overflow:hidden;border-radius:3px;background:#000;">` +
                    `<img src="${refImg.src}" alt="${refImg.caption}" title="${refImg.caption}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">` +
                    `</div>` +
                    `<div style="font-size:9px;color:var(--text-muted,#888);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${refImg.caption}">${refImg.caption}</div>`;
            } else {
                imgCell = `<div class="img-placeholder">待生成<br>[API 接入后自动填充]</div>`;
            }
            return `                    <tr>
                        <td>${idx}</td>
                        <td>${node?.name || '—'}<br><code style="font-size:9px;">${node?.id || '—'}</code></td>
                        <td>${node?.description || '—'}</td>
                        <td><span class="emo-tag" style="border-color:${emoColor(beat.emotion)};color:${beat.emotion || '—'};">${beat.emotion || '—'}</span></td>
                        <td>—</td>
                        <td><div class="prompt-cell">${regionName} scene, ${beat.emotion || 'neutral'} mood, ${beat.notes || ''}</div></td>
                        <td>${imgCell}</td>
                    </tr>`;
        });

        sections.push(`    <div class="region-section">
        <div class="region-title">${regionName} (${regionId}) — ${beatName}</div>
        <div class="region-audio">音频意图: ${audio?.mood || '—'} · ${audio?.notes || '—'}</div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr><th style="width:30px;">#</th><th style="width:100px;">场景节点</th><th style="width:160px;">画面描述</th><th style="width:100px;">情绪关键词</th><th style="width:100px;">构图建议</th><th>生图提示词 (EN)</th><th style="width:140px;">预览</th></tr>
                </thead>
                <tbody>
${rows.join('\n')}
                </tbody>
            </table>
        </div>
    </div>`);
    }

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            region_count: regions.length,
            scene_count: globalIndex - 1,
            timestamp: ts(),
        },
        sections,
        repeats: [],
    };
}

// ============================================================================
// tech_req 提取器
// ============================================================================
function extractTechReq(irSlice) {
    const deps = irSlice.SYSTEM?.dependencies || [];
    const interfaces = irSlice.SYSTEM?.interfaces || [];
    const constraints = irSlice.SYSTEM?.constraints || [];
    const mechanics = irSlice.MECHANIC?.mechanics || [];
    const nodes = irSlice.FLOW?.nodes || [];

    // 系统依赖表
    const sysRows = deps.map(d => ({
        system_name: d.system_name || d.name || '—',
        system_purpose: d.usage || '—',
        system_status: d.version || '待确认',
        status_tag: d.version && d.version !== '待确认' ? 'ready' : 'pending',
        integration_notes: '—',
        trigger_points: '—',
    }));

    // 接口/API 表
    const apiRows = interfaces.map(i => ({
        system_name: i.name || '—',
        api_status: i.type || '—',
        system_purpose: i.description || '—',
    }));

    // 约束条件表
    const constraintRows = constraints.map((c, i) => ({
        constraint_index: i + 1,
        constraint_name: typeof c === 'string' ? c.substring(0, 30) : c.name || '—',
        constraint_desc: typeof c === 'string' ? c : c.description || '—',
        impact_scope: '关卡全局',
        suggested_solution: '—',
    }));

    // 状态节点 <li> — 模板用 state_name + state_description
    const stateNodeRows = nodes.slice(0, 15).map(n => ({
        state_name: n.name || n.id,
        state_description: n.type || n.description?.substring(0, 30) || '—',
    }));

    // 转场条件 <li> — 模板用 from_state + to_state + transition_condition
    const edges = irSlice.FLOW?.edges || [];
    const transitionRows = edges.slice(0, 15).map(e => {
        const fromNode = nodes.find(n => n.id === e.from);
        const toNode = nodes.find(n => n.id === e.to);
        return {
            from_state: fromNode?.name || e.from,
            to_state: toNode?.name || e.to,
            transition_condition: e.condition || e.label || '默认推进',
        };
    });

    // 配置项 — 从 mechanics 提取, 模板用 config_name + config_count + config_description
    const configRows = mechanics.map(m => ({
        config_name: m.name || m.id,
        config_count: '1',
        config_description: m.description || m.rules || '—',
    }));

    // 模板 REPEAT 顺序: sysRows(<tr>) → stateNodeRows(<li>) → transitionRows(<li>) → constraintRows(<tr>) → configRows(<tr>)
    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            system_count: deps.length,
            config_count: mechanics.length,
            api_status: interfaces.length > 0 ? `${interfaces.length} 个接口` : '无特殊接口需求',
            state_machine_overview: `${nodes.length} 个状态节点，${edges.length} 条转换`,
            timestamp: ts(),
        },
        repeats: [sysRows, stateNodeRows, transitionRows, constraintRows, configRows],
    };
}

// ============================================================================
// emotion_curve 提取器
// ============================================================================
function extractEmotionCurve(irSlice) {
    const beats = irSlice.FEEL?.emotional_beats || [];
    const tone = irSlice.FEEL?.overall_tone || '';
    const nodes = irSlice.FLOW?.nodes || [];
    const criticalPath = irSlice.FLOW?.critical_path || [];
    const regionMap = buildRegionMap(irSlice.SPACE?.regions || []);

    // SVG 坐标计算
    const svgW = 1060, svgH = 320;
    const padL = 50, padR = 30, padT = 30, padB = 50;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;
    const n = beats.length || 1;

    const points = beats.map((b, i) => {
        const x = padL + (i / (n - 1 || 1)) * plotW;
        const y = padT + plotH - (b.intensity || 0) * plotH;
        return { x, y, ...b };
    });

    // 折线 points 字符串
    const linePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    // 面积图 points
    const areaPoints = `${padL},${padT + plotH} ${linePoints} ${padL + plotW},${padT + plotH}`;

    // 节点行 REPEAT（表格）— 模板用 node_label 不是 beat_name
    const nodeRows = beats.map((b, i) => {
        const node = nodes.find(nd => nd.id === b.node);
        const regionId = node?.region || '';
        return {
            node_index: i + 1,
            node_label: node?.name || b.node,
            beat_location: regionMap[regionId] || regionId || '—',
            emo_type_label: b.emotion || '—',
            emo_color: emoColor(b.emotion),
            intensity: (b.intensity || 0).toFixed(2),
            intensity_percent: Math.round((b.intensity || 0) * 100),
            intensity_bar_width: Math.round((b.intensity || 0) * 100),
            node_note: b.notes || '—',
        };
    });

    // SVG 分隔线 REPEAT（<line> — beat dividers）
    const dividerRows = points.map(p => ({
        beat_divider_x: p.x.toFixed(1),
    }));

    // SVG beat 标签 REPEAT（<text> — beat section labels）
    const beatLabelRows = points.map((p, i) => {
        return {
            beat_label_x: p.x.toFixed(1),
            beat_name: (i + 1).toString(),
            beat_location: '',
        };
    });

    // SVG 节点 REPEAT（<circle> — 圆圈）
    const svgNodeRows = points.map((p, i) => ({
        node_x: p.x.toFixed(1),
        node_y: p.y.toFixed(1),
        node_r: '5',
        emo_color: emoColor(p.emotion),
        node_short_label: (i + 1).toString(),
    }));

    // SVG 旋转标签 REPEAT（<text> — 下方编号标签）
    const svgLabelRows = points.map((p, i) => ({
        node_x: p.x.toFixed(1),
        node_short_label: (i + 1).toString(),
    }));

    // 模板 REPEAT 顺序（从上到下）：
    // 1. beat dividers (<line>)
    // 2. beat labels (<text> with beat_name)
    // 3. circles (<circle>)
    // 4. rotated labels (<text> with node_short_label)
    // 5. table rows (<tr>)
    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            overall_tone: tone,
            critical_node_count: criticalPath.length,
            line_points: linePoints,
            area_points: areaPoints,
            timestamp: ts(),
        },
        repeats: [dividerRows, beatLabelRows, svgNodeRows, svgLabelRows, nodeRows],
    };
}

// ============================================================================
// 力导向布局算法 (Fruchterman-Reingold)
// 输入: nodes [{id}], edges [[fromId, toId]], options
// 输出: { [id]: { x, y } }
// ============================================================================
function forceDirectedLayout(nodes, edges, options = {}) {
    const { width = 900, height = 600, padding = 80, iterations = 400 } = options;
    const n = nodes.length;
    if (n === 0) return {};

    const W = width - padding * 2;
    const H = height - padding * 2;
    const K = Math.sqrt((W * H) / n); // 最优弹簧长度

    // 确定性圆形初始化（无随机）
    const pos = {};
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / n;
        const r = Math.min(W, H) * 0.38;
        pos[node.id] = {
            x: padding + W / 2 + r * Math.cos(angle),
            y: padding + H / 2 + r * Math.sin(angle),
        };
    });

    // 迭代（线性降温退火）
    for (let iter = 0; iter < iterations; iter++) {
        const temp = K * Math.max(0.05, 1 - iter / iterations);
        const disp = {};
        nodes.forEach(node => { disp[node.id] = { x: 0, y: 0 }; });

        // 斥力：两两节点互相排斥
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = nodes[i], b = nodes[j];
                let dx = pos[a.id].x - pos[b.id].x;
                let dy = pos[a.id].y - pos[b.id].y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.5) { dx = 0.5; dy = 0.5; dist = Math.sqrt(0.5); }
                const f = (K * K) / dist;
                disp[a.id].x += (dx / dist) * f;
                disp[a.id].y += (dy / dist) * f;
                disp[b.id].x -= (dx / dist) * f;
                disp[b.id].y -= (dy / dist) * f;
            }
        }

        // 引力：连接的节点相互吸引
        for (const [fromId, toId] of edges) {
            if (!pos[fromId] || !pos[toId]) continue;
            const dx = pos[fromId].x - pos[toId].x;
            const dy = pos[fromId].y - pos[toId].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.5;
            const f = (dist * dist) / K;
            disp[fromId].x -= (dx / dist) * f;
            disp[fromId].y -= (dy / dist) * f;
            disp[toId].x += (dx / dist) * f;
            disp[toId].y += (dy / dist) * f;
        }

        // 应用位移（温度限幅 + 边界约束）
        nodes.forEach(node => {
            const d = disp[node.id];
            const dlen = Math.sqrt(d.x * d.x + d.y * d.y) || 0.5;
            const scale = Math.min(dlen, temp) / dlen;
            pos[node.id].x = Math.max(padding, Math.min(padding + W, pos[node.id].x + d.x * scale));
            pos[node.id].y = Math.max(padding, Math.min(padding + H, pos[node.id].y + d.y * scale));
        });
    }

    return pos;
}

// ============================================================================
// spatial_topology 提取器（draw.io mxGraph XML 版）
// ============================================================================
function extractSpatialTopology(irSlice) {
    const regions = irSlice.SPACE?.regions || [];
    const criticalPath = irSlice.SPACE?.critical_path || [];

    // 节点尺寸与字号
    const nodeW = regions.length > 12 ? 100 : 120;
    const nodeH = regions.length > 12 ? 44 : 52;
    const fontSize = regions.length > 12 ? 10 : 12;

    // 画布尺寸
    const cols = Math.ceil(Math.sqrt(regions.length));
    const canvasW = Math.max(1000, cols * 180 + 200);
    const canvasH = Math.max(700, Math.ceil(regions.length / cols) * 160 + 160);

    // 有向边列表（保留方向，供 draw.io 渲染箭头）
    const directedEdges = [];
    for (const r of regions) {
        for (const connId of (r.connections || [])) {
            directedEdges.push([r.id, connId]);
        }
    }

    // 无向去重边列表（用于力导向布局坐标计算）
    const layoutEdgeSet = new Set();
    const layoutEdges = [];
    for (const [a, b] of directedEdges) {
        const key = [a, b].sort().join('|');
        if (!layoutEdgeSet.has(key)) {
            layoutEdgeSet.add(key);
            layoutEdges.push([a, b]);
        }
    }

    // 力导向布局
    const nodePositions = forceDirectedLayout(
        regions,
        layoutEdges,
        { width: canvasW, height: canvasH, padding: nodeW * 0.6, iterations: 450 }
    );
    const critSet = new Set(criticalPath);

    // XML 属性值安全转义
    function xmlAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 构建 mxGraph XML cells
    const cellLines = [
        '<mxCell id="0" />',
        '<mxCell id="1" parent="0" />',
    ];

    // ① 边（先定义 → 渲染在节点下方）
    const edgesSeen = new Set();
    for (const [fromId, toId] of directedEdges) {
        const edgeId = `e_${fromId}_${toId}`;
        if (edgesSeen.has(edgeId)) continue;
        edgesSeen.add(edgeId);
        if (!nodePositions[fromId] || !nodePositions[toId]) continue;

        const isCrit = critSet.has(fromId) && critSet.has(toId);
        const strokeColor = isCrit ? '#FF4500' : '#999999';
        const sw = isCrit ? 3 : 1.5;
        const dashed = isCrit ? 0 : 1;
        const arrowStyle = isCrit
            ? 'endArrow=block;endFill=1;'
            : 'endArrow=open;endSize=8;';

        cellLines.push(
            `<mxCell id="${xmlAttr(edgeId)}" ` +
            `style="edgeStyle=none;curved=1;${arrowStyle}` +
            `strokeColor=${strokeColor};strokeWidth=${sw};dashed=${dashed};" ` +
            `edge="1" source="${xmlAttr(fromId)}" target="${xmlAttr(toId)}" parent="1">` +
            `<mxGeometry relative="1" as="geometry" /></mxCell>`
        );
    }

    // ② 节点（后定义 → 渲染在边上方）
    for (const r of regions) {
        const pos = nodePositions[r.id];
        if (!pos) continue;
        const isCrit = critSet.has(r.id);
        const fillColor = isCrit ? '#FFE8E0' : '#EEF1FF';
        const strokeColor = isCrit ? '#FF4500' : '#4169E1';
        const sw = isCrit ? 3 : 2;
        const dashed = isCrit ? 0 : 1;

        cellLines.push(
            `<mxCell id="${xmlAttr(r.id)}" value="${xmlAttr(r.name)}" ` +
            `style="rounded=1;whiteSpace=wrap;html=1;fontSize=${fontSize};fontStyle=1;` +
            `fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=${sw};dashed=${dashed};" ` +
            `vertex="1" parent="1">` +
            `<mxGeometry x="${pos.x.toFixed(0)}" y="${pos.y.toFixed(0)}" ` +
            `width="${nodeW}" height="${nodeH}" as="geometry" /></mxCell>`
        );
    }

    // 拼 mxGraphModel XML
    const mxXml = [
        `<mxGraphModel dx="${canvasW}" dy="${canvasH}" grid="0" gridSize="10" guides="0" tooltips="1" connect="0" arrows="1" fold="0" page="0" pageScale="1" pageWidth="${canvasW}" pageHeight="${canvasH}" math="0" shadow="0">`,
        '  <root>',
        ...cellLines.map(l => '    ' + l),
        '  </root>',
        '</mxGraphModel>',
    ].join('\n');

    // JSON 序列化后进行 HTML 实体编码，确保安全嵌入 data-mxgraph="" 属性
    const drawioConfig = JSON.stringify({ xml: mxXml, highlight: '#FF4500', nav: false, resize: false, fit: true, border: 20, toolbar: 'zoom' })
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // 表格行 REPEAT
    const tableRows = regions.map(r => {
        const conns = (r.connections || []).map(c => {
            const cr = regions.find(rr => rr.id === c);
            return cr?.name || c;
        }).join(', ') || '—';
        const isCrit = critSet.has(r.id);
        return {
            region_id: r.id,
            region_name: r.name,
            region_function: r.function || '—',
            floor: r.elevation || '地面层',
            connections: conns,
            path_type: isCrit ? '主路径' : '可选',
            path_tag: isCrit ? 'critical' : 'optional',
            space_description: r.spatial_notes || '—',
        };
    });

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            region_count: regions.length,
            environment: irSlice.SPACE?.environment_type || '—',
            area_desc: irSlice.SPACE?.total_area_estimate || '—',
            drawio_config: drawioConfig,
            drawio_height: canvasH,
            timestamp: ts(),
        },
        repeats: [tableRows],
    };
}

// ============================================================================
// spatial_layout 提取器
// ============================================================================
function extractSpatialLayout(irSlice, caseDir) {
    const regions = irSlice.SPACE?.regions || [];
    const path = require('path');
    const fs = require('fs');

    // 尝试读取 layout_data.json
    let layoutJson = '{}';
    let assetsJson = '{}';
    let floorCount = '—', doorCount = '—', windowCount = '—';
    let roomLabels = [];

    if (caseDir) {
        // 从 test_cases 目录读取
        const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
        const caseId = path.basename(caseDir);
        const candidates = [
            path.join(PROJECT_ROOT, 'test_cases', caseId, 'layout_data.json'),
            path.join(caseDir, 'layout_data.json'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf-8');
                layoutJson = raw;
                try {
                    const data = JSON.parse(raw);
                    const shapes = data.shapes || [];
                    const layers = data.layers || [];
                    floorCount = layers.length;
                    doorCount = shapes.reduce((sum, s) => sum + (s.strokeExclusions?.length || 0), 0);
                    windowCount = shapes.reduce((sum, s) => sum + (s.strokeWindows?.length || 0), 0);
                    roomLabels = shapes.map(s => s.label).filter(Boolean);
                } catch (e) { /* ignore parse errors */ }
                break;
            }
        }

        // 优先从 layout_assets.json 读取（手工维护的资产映射）
        const assetsCandidates = [
            path.join(PROJECT_ROOT, 'test_cases', caseId, 'layout_assets.json'),
            path.join(caseDir, 'layout_assets.json'),
        ];
        let foundAssets = false;
        for (const p of assetsCandidates) {
            if (fs.existsSync(p)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    // 归一化：支持 string[] 和 {src,caption}[] 两种格式，过滤 _ 开头的 meta 字段
                    const normalized = {};
                    for (const [key, val] of Object.entries(raw)) {
                        if (key.startsWith('_')) continue;
                        const arr = Array.isArray(val) ? val : [];
                        normalized[key] = arr
                            .filter(item => item && (typeof item === 'string' || item.file || item.src))
                            .map(item => {
                                if (typeof item === 'string') {
                                    return { src: `../../test_cases/${caseId}/images/${item.trim()}`, caption: item.trim() };
                                }
                                if (item.file) {
                                    return { src: `../../test_cases/${caseId}/images/${item.file}`, caption: item.caption || item.context || item.file };
                                }
                                return item; // already {src, caption}
                            });
                        if (normalized[key].length === 0) delete normalized[key];
                    }
                    assetsJson = JSON.stringify(normalized, null, 2);
                    foundAssets = true;
                } catch (e) {
                    console.warn('[spatial_layout] Failed to parse layout_assets.json:', e.message);
                }
                break;
            }
        }

        // 若无手工资产文件，从 image_manifest.json 自动构建
        if (!foundAssets) {
            try {
                const imageEmbed = require('./image_embed');
                const manifest = imageEmbed.loadManifest(PROJECT_ROOT, caseId);
                if (manifest) {
                    assetsJson = imageEmbed.buildSpatialAssetsJson(manifest, caseId, PROJECT_ROOT, roomLabels);
                }
            } catch (e) {
                console.warn('[spatial_layout] image_embed failed:', e.message);
            }
        }
    }

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            environment: irSlice.SPACE?.environment_type || '—',
            room_count: regions.length,
            floor_count: floorCount,
            door_count: doorCount,
            window_count: windowCount,
            LAYOUT_JSON: layoutJson,
            ASSETS_JSON: assetsJson,
            timestamp: ts(),
        },
        repeats: [],
    };
}

// ============================================================================
// storyboard 提取器
// ============================================================================
function extractStoryboard(irSlice) {
    const nodes = irSlice.FLOW?.nodes || [];
    const beats = irSlice.FEEL?.emotional_beats || [];
    const regions = irSlice.SPACE?.regions || [];
    const regionMap = buildRegionMap(regions);
    const criticalPath = irSlice.FLOW?.critical_path || [];

    // 分镜卡片 — 每个关键节点一帧
    const frameNodes = criticalPath.length > 0
        ? criticalPath.map(id => nodes.find(n => n.id === id)).filter(Boolean)
        : nodes;

    const frameRows = frameNodes.map((node, i) => {
        const beat = findBeat(beats, node.id);
        const regionId = node.region || '';
        return {
            frame_number: i + 1,
            frame_count: frameNodes.length,
            beat_index: i + 1,
            beat_name: node.name || node.id,
            beat_location: regionMap[regionId] || regionId || '—',
            beat_start_class: node.type === 'start' ? 'start' : '',
            scene_title: node.name || node.id,
            scene_description: node.description || '—',
            node_id: node.id,
            node_role: node.type || '—',
            emo_label: beat?.emotion || '—',
            emo_text: beat?.notes || '—',
            emo_color: emoColor(beat?.emotion),
            intensity: beat ? Math.round((beat.intensity || 0) * 100) + '%' : '—',
            camera_direction: '—',
            en_prompt: `Scene: ${node.name}. ${node.description || ''}. Mood: ${beat?.emotion || 'neutral'}`,
            coverage: '—',
        };
    });

    // 摘要行（简表） — 和帧行一样的数据，用不同的 REPEAT
    const summaryRows = frameRows.map(f => ({
        beat_index: f.beat_index,
        beat_name: f.beat_name,
        beat_location: f.beat_location,
        emo_label: f.emo_label,
        intensity: f.intensity,
    }));

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            frame_count: frameRows.length,
            coverage: criticalPath.length > 0 ? '关键路径' : '全节点',
            timestamp: ts(),
        },
        repeats: [summaryRows, frameRows],
    };
}

// ============================================================================
// bubble_chart 提取器（POI 空间功能气泡图）
// ============================================================================

/** 情绪标签 → CSS class 映射 */
const EMO_CLASS_MAP = {
    tension_low: 'emo-tension-low',
    tension_medium: 'emo-tension-high',
    tension_high: 'emo-tension-high',
    tension_spike: 'emo-tension-spike',
    dread: 'emo-tension-spike',
    relief: 'emo-relief',
    wonder: 'emo-excitement',
    excitement: 'emo-excitement',
    calm: 'emo-calm',
};
function emoClass(emotion) { return EMO_CLASS_MAP[emotion] || 'emo-calm'; }

function extractBubbleChart(irSlice) {
    const nodes = irSlice.FLOW?.nodes || [];
    const edges = irSlice.FLOW?.edges || [];
    const criticalPath = irSlice.FLOW?.critical_path || [];
    const beats = irSlice.FEEL?.emotional_beats || [];
    const regions = irSlice.SPACE?.regions || [];
    const regionMap = buildRegionMap(regions);

    // 建立节点 ID → beat 映射
    const beatMap = {};
    for (const b of beats) beatMap[b.node] = b;

    // 检测复合 POI（多条 flow_line）
    const flowLines = new Set(nodes.map(n => n.flow_line).filter(Boolean));
    const isComposite = flowLines.size > 1;

    // 为一组节点生成 flowchart sections
    function generateFlowSections(flowNodes, flowEdges, critPath) {
        const critSet = new Set(critPath);
        const criticalNodes = critPath.map(id => flowNodes.find(n => n.id === id)).filter(Boolean);
        const optionalNodes = flowNodes.filter(n => !critSet.has(n.id));

        const groupSize = Math.max(3, Math.ceil(criticalNodes.length / Math.ceil(criticalNodes.length / 4)));
        const beatGroups = [];
        for (let i = 0; i < criticalNodes.length; i += groupSize) {
            beatGroups.push(criticalNodes.slice(i, i + groupSize));
        }

        function groupBeatInfo(group) {
            const groupBeats = group.map(n => beatMap[n.id]).filter(Boolean);
            if (groupBeats.length === 0) return { name: '过渡', intensity: 5, emotion: 'calm' };
            const peak = groupBeats.reduce((a, b) => (b.intensity || 0) > (a.intensity || 0) ? b : a, groupBeats[0]);
            return {
                name: peak.notes || group[0].name,
                intensity: Math.round((peak.intensity || 0.5) * 10),
                emotion: peak.emotion || 'calm',
            };
        }

        // 可选节点归属
        const optionalByGroup = beatGroups.map(() => []);
        for (const opt of optionalNodes) {
            const relatedEdge = flowEdges.find(e =>
                (e.from === opt.id && critSet.has(e.to)) || (e.to === opt.id && critSet.has(e.from)));
            if (relatedEdge) {
                const critId = critSet.has(relatedEdge.from) ? relatedEdge.from : relatedEdge.to;
                const groupIdx = beatGroups.findIndex(g => g.some(n => n.id === critId));
                if (groupIdx >= 0) { optionalByGroup[groupIdx].push(opt); continue; }
            }
            if (optionalByGroup.length > 0) optionalByGroup[optionalByGroup.length - 1].push(opt);
        }

        const htmls = [];
        for (let gi = 0; gi < beatGroups.length; gi++) {
            const group = beatGroups[gi];
            const info = groupBeatInfo(group);
            const optionals = optionalByGroup[gi];
            const region = regionMap[group[0]?.region] || '';

            const critNodesHtml = group.map((n, ni) => {
                const beat = beatMap[n.id];
                const ec = beat ? emoClass(beat.emotion) : 'emo-calm';
                const nodeHtml = `<div class="node ${ec} critical" id="${n.id}">
                        <div class="node-label">${n.name}</div>
                        <div class="node-type">${n.type || ''}</div>
                    </div>`;
                const arrow = ni < group.length - 1 ? '<div class="arrow critical">&rarr;</div>' : '';
                return nodeHtml + (arrow ? '\n                    ' + arrow : '');
            }).join('\n                    ');

            let optRowHtml = '';
            if (optionals.length > 0) {
                const optNodesHtml = optionals.map((n, ni) => {
                    const beat = beatMap[n.id];
                    const ec = beat ? emoClass(beat.emotion) : 'emo-calm';
                    const nodeHtml = `<div class="node ${ec}" id="${n.id}">
                        <div class="node-label">${n.name}</div>
                        <div class="node-type">${n.type || ''}</div>
                    </div>`;
                    const arrow = ni < optionals.length - 1 ? '<div class="arrow">&rarr;</div>' : '';
                    return nodeHtml + (arrow ? '\n                    ' + arrow : '');
                }).join('\n                    ');
                optRowHtml = `
                <div class="node-row optional-row">
                    ${optNodesHtml}
                </div>`;
            }

            htmls.push(`        <div class="beat-section">
            <div class="beat-label">
                <div class="beat-label-name">${info.name.substring(0, 20)}</div>
                <div class="beat-label-location">${region}</div>
                <div class="beat-label-strength">强度 ${info.intensity}/10</div>
            </div>
            <div class="beat-content">
                <div class="node-row">
                    ${critNodesHtml}
                </div>${optRowHtml}
            </div>
        </div>`);

            if (gi < beatGroups.length - 1) {
                htmls.push(`        <div class="beat-divider">
            <div class="beat-divider-line"></div>
            <div class="beat-divider-arrow">&darr;</div>
            <div class="beat-divider-line"></div>
        </div>`);
            }
        }
        return htmls;
    }

    const FLOW_LINE_LABELS = {
        mainline: '区域主动线',
        boss_line: 'Boss 体验线',
    };

    const sectionHtmls = [];

    if (isComposite) {
        // 复合 POI: 为每条 flow_line 生成独立的 flowchart 区块
        for (const line of flowLines) {
            const lineNodes = nodes.filter(n => n.flow_line === line);
            const lineNodeIds = new Set(lineNodes.map(n => n.id));
            const lineEdges = edges.filter(e => lineNodeIds.has(e.from) || lineNodeIds.has(e.to));
            let lineCritPath = criticalPath.filter(id => lineNodeIds.has(id));
            // 如果该 flow_line 没有节点在全局 critical_path 中，使用全部节点作为该线的路径
            if (lineCritPath.length === 0) {
                lineCritPath = lineNodes.map(n => n.id);
            }

            const lineLabel = FLOW_LINE_LABELS[line] || line;
            sectionHtmls.push(`        <div style="margin:24px 0 16px;padding:12px 20px;background:var(--bg-secondary);border-left:4px solid var(--accent);font-size:14px;font-weight:700;">${lineLabel}（${lineNodes.length} 节点）</div>`);
            sectionHtmls.push(...generateFlowSections(lineNodes, lineEdges, lineCritPath));

            sectionHtmls.push(`        <div class="beat-divider" style="margin:32px 0;">
            <div class="beat-divider-line" style="border-top-width:2px;"></div>
            <div class="beat-divider-arrow" style="font-size:18px;">◆</div>
            <div class="beat-divider-line" style="border-top-width:2px;"></div>
        </div>`);
        }
        // 去掉最后一个分隔符
        sectionHtmls.pop();
    } else {
        // 单条 flow_line
        const allEdges = edges;
        sectionHtmls.push(...generateFlowSections(nodes, allEdges, criticalPath));
    }

    return {
        vars: {
            level_id: irSlice.level_id || '',
            level_name: irSlice.level_name || '',
            type: irSlice.type || '',
            node_count: nodes.length,
            critical_count: criticalPath.length,
            optional_count: nodes.length - criticalPath.length,
            timestamp: ts(),
            total_score: '—',
            score_status: '待评分',
            score_structure: '—',
            score_consistency: '—',
            score_compliance: '—',
            score_fidelity: '—',
        },
        sections: sectionHtmls,
        repeats: [],
    };
}

// ============================================================================
// 导出
// ============================================================================
module.exports = {
    extractLightingReq,
    extractVfxReq,
    extractAudioReq,
    extractAtmosphereRef,
    extractTechReq,
    extractEmotionCurve,
    extractSpatialTopology,
    extractSpatialLayout,
    extractStoryboard,
    extractBubbleChart,
};
