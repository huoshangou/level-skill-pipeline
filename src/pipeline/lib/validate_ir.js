/**
 * validate_ir.js — IR 验证器
 *
 * 对 ir_filled.json 做结构完整性检查和交叉引用验证。
 * 纯确定性逻辑，不需要 LLM。
 */

const REQUIRED_DIMENSIONS = ['SPACE', 'FLOW', 'FEEL', 'MECHANIC', 'ASSET', 'SYSTEM'];

/**
 * 检查 6 维度是否存在
 */
function validateStructure(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.level_id) errors.push('缺少 level_id');
    if (!ir.level_name) errors.push('缺少 level_name');
    if (!ir.type) warnings.push('缺少 type 字段');

    for (const dim of REQUIRED_DIMENSIONS) {
        if (!ir[dim]) {
            errors.push(`缺少维度: ${dim}`);
        }
    }

    return { errors, warnings };
}

/**
 * FLOW.nodes 检查：id 唯一性、region 引用有效
 */
function validateFlowNodes(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.FLOW?.nodes) return { errors: ['FLOW.nodes 不存在'], warnings };

    const nodeIds = new Set();
    const regionIds = new Set((ir.SPACE?.regions || []).map(r => r.id));

    for (const node of ir.FLOW.nodes) {
        if (!node.id) {
            errors.push(`FLOW 节点缺少 id: ${JSON.stringify(node)}`);
            continue;
        }
        if (nodeIds.has(node.id)) {
            errors.push(`FLOW 节点 id 重复: ${node.id}`);
        }
        nodeIds.add(node.id);

        if (!node.name) warnings.push(`节点 ${node.id} 缺少 name`);
        if (!node.type) warnings.push(`节点 ${node.id} 缺少 type`);

        if (node.region && regionIds.size > 0 && !regionIds.has(node.region)) {
            warnings.push(`节点 ${node.id} 引用的 region "${node.region}" 在 SPACE.regions 中不存在`);
        }
    }

    // 节点数量警告
    if (ir.FLOW.nodes.length > 15) {
        warnings.push(`节点数 ${ir.FLOW.nodes.length} 超过建议上限 15，建议拆分子流程`);
    }

    return { errors, warnings };
}

/**
 * FLOW.edges 检查：from/to 引用存在的 node id
 */
function validateFlowEdges(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.FLOW?.edges) return { errors: ['FLOW.edges 不存在'], warnings };

    const nodeIds = new Set((ir.FLOW.nodes || []).map(n => n.id));

    for (let i = 0; i < ir.FLOW.edges.length; i++) {
        const edge = ir.FLOW.edges[i];
        if (!edge.from) errors.push(`edges[${i}] 缺少 from`);
        if (!edge.to) errors.push(`edges[${i}] 缺少 to`);

        if (edge.from && !nodeIds.has(edge.from)) {
            errors.push(`edges[${i}].from "${edge.from}" 不存在于 FLOW.nodes`);
        }
        if (edge.to && !nodeIds.has(edge.to)) {
            errors.push(`edges[${i}].to "${edge.to}" 不存在于 FLOW.nodes`);
        }
    }

    return { errors, warnings };
}

/**
 * critical_path 检查：所有节点存在
 */
function validateCriticalPath(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.FLOW?.critical_path) {
        warnings.push('FLOW.critical_path 未定义');
        return { errors, warnings };
    }

    const nodeIds = new Set((ir.FLOW.nodes || []).map(n => n.id));

    for (const nodeId of ir.FLOW.critical_path) {
        if (!nodeIds.has(nodeId)) {
            errors.push(`critical_path 引用的节点 "${nodeId}" 不存在于 FLOW.nodes`);
        }
    }

    return { errors, warnings };
}

/**
 * FEEL.emotional_beats 检查：引用的 node 存在
 */
function validateFeelBeats(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.FEEL?.emotional_beats) {
        warnings.push('FEEL.emotional_beats 未定义');
        return { errors, warnings };
    }

    const nodeIds = new Set((ir.FLOW?.nodes || []).map(n => n.id));

    for (const beat of ir.FEEL.emotional_beats) {
        if (!beat.node) {
            warnings.push('emotional_beats 中有条目缺少 node 字段');
            continue;
        }
        if (!nodeIds.has(beat.node)) {
            errors.push(`emotional_beats 引用的节点 "${beat.node}" 不存在于 FLOW.nodes`);
        }
        if (beat.intensity !== undefined && (beat.intensity < 0 || beat.intensity > 1)) {
            warnings.push(`节点 ${beat.node} 的 intensity ${beat.intensity} 超出 [0,1] 范围`);
        }
    }

    // 检查覆盖率：FLOW nodes 是否都有对应 beat
    const beatNodes = new Set(ir.FEEL.emotional_beats.map(b => b.node));
    for (const nodeId of nodeIds) {
        if (!beatNodes.has(nodeId)) {
            warnings.push(`FLOW 节点 "${nodeId}" 没有对应的 emotional_beat`);
        }
    }

    return { errors, warnings };
}

/**
 * ASSET 检查：无重复 id
 */
function validateAssets(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.ASSET?.required_assets) {
        warnings.push('ASSET.required_assets 未定义');
        return { errors, warnings };
    }

    const ids = new Set();
    for (const asset of ir.ASSET.required_assets) {
        if (!asset.id) {
            warnings.push('required_assets 中有条目缺少 id');
            continue;
        }
        if (ids.has(asset.id)) {
            errors.push(`ASSET id 重复: ${asset.id}`);
        }
        ids.add(asset.id);
    }

    return { errors, warnings };
}

/**
 * SPACE 检查：region id 唯一、connections 引用有效
 */
function validateSpace(ir) {
    const errors = [];
    const warnings = [];

    if (!ir.SPACE?.regions) {
        warnings.push('SPACE.regions 未定义');
        return { errors, warnings };
    }

    const regionIds = new Set();
    for (const region of ir.SPACE.regions) {
        if (!region.id) {
            errors.push('SPACE.regions 中有条目缺少 id');
            continue;
        }
        if (regionIds.has(region.id)) {
            errors.push(`SPACE region id 重复: ${region.id}`);
        }
        regionIds.add(region.id);
    }

    // connections 引用检查
    for (const region of ir.SPACE.regions) {
        if (region.connections) {
            for (const conn of region.connections) {
                if (!regionIds.has(conn)) {
                    errors.push(`region "${region.id}" 的 connection "${conn}" 不存在于 SPACE.regions`);
                }
            }
        }
    }

    return { errors, warnings };
}

/**
 * 运行全部检查
 */
function validateAll(ir) {
    const allErrors = [];
    const allWarnings = [];

    const checks = [
        { name: 'structure', fn: () => validateStructure(ir) },
        { name: 'space', fn: () => validateSpace(ir) },
        { name: 'flow_nodes', fn: () => validateFlowNodes(ir) },
        { name: 'flow_edges', fn: () => validateFlowEdges(ir) },
        { name: 'critical_path', fn: () => validateCriticalPath(ir) },
        { name: 'feel_beats', fn: () => validateFeelBeats(ir) },
        { name: 'assets', fn: () => validateAssets(ir) },
    ];

    const details = {};
    for (const check of checks) {
        const result = check.fn();
        details[check.name] = { errors: result.errors.length, warnings: result.warnings.length };
        allErrors.push(...result.errors.map(e => `[${check.name}] ${e}`));
        allWarnings.push(...result.warnings.map(w => `[${check.name}] ${w}`));
    }

    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        details,
        summary: `${allErrors.length} errors, ${allWarnings.length} warnings`,
    };
}

module.exports = {
    validateStructure,
    validateSpace,
    validateFlowNodes,
    validateFlowEdges,
    validateCriticalPath,
    validateFeelBeats,
    validateAssets,
    validateAll,
};
