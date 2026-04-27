"""
[DEPRECATED] 已被 assemble_document.js v2.0 替代（Node.js 实现，无 Python 依赖）。
保留此文件仅供参考，不再维护。

POI Document Assembler v2.0
Extracts <section class="module"> from each standalone module HTML
and assembles them into a single POI document with zero content loss.

v2.0: Reads IR metadata for dynamic hero section (no hardcoded titles).

Usage: python assemble_poi.py <case_output_dir> [ir_json_path]
Example:
  python assemble_poi.py "outputs/case_02_artmuseum" "test_cases/case_02_artmuseum/ir_filled.json"

If ir_json_path is omitted, looks for ir_filled.json in ../test_cases/{case_id}/
"""
import re
import sys
import os
import json
from datetime import datetime

# Module order and display names
MODULE_ORDER = [
    ('level_overview', '关卡概览'),
    ('bubble_chart', '玩法流程气泡图'),
    ('emotion_curve', '情绪节奏曲线'),
    ('asset_list', '美术资产需求表'),
    ('atmosphere_ref', '氛围参考提示词表'),
    ('storyboard', '核心流程分镜'),
    ('lighting_req', '灯光需求表'),
    ('vfx_req', '特效需求表'),
    ('audio_req', '音频需求表'),
    ('tech_req', '程序需求文档'),
]


def extract_section(html_content):
    """Extract <section class="module"...>...</section> from HTML."""
    match = re.search(r'(<section class="module".*?</section>)', html_content, re.DOTALL)
    return match.group(1) if match else None


def extract_styles(html_content):
    """Extract CSS from <style> tag."""
    match = re.search(r'<style>(.*?)</style>', html_content, re.DOTALL)
    return match.group(1) if match else ''


def load_ir_metadata(ir_path):
    """Load metadata from ir_filled.json for dynamic hero section."""
    defaults = {
        'level_name': '未命名关卡',
        'level_id': 'unknown',
        'type': 'Unknown',
        'description': '',
        'node_count': 0,
        'region_count': 0,
        'mechanic_count': 0,
        'asset_count': 0,
        'emotion_segments': 0,
        'overall_tone': '',
        'environment_type': '',
    }
    if not ir_path or not os.path.exists(ir_path):
        print(f'  [WARN] IR file not found: {ir_path}, using defaults')
        return defaults

    try:
        with open(ir_path, encoding='utf-8') as f:
            ir = json.load(f)

        defaults['level_name'] = ir.get('level_name', defaults['level_name'])
        defaults['level_id'] = ir.get('level_id', defaults['level_id'])
        defaults['type'] = ir.get('type', defaults['type'])

        # FLOW
        flow = ir.get('FLOW', {})
        nodes = flow.get('nodes', [])
        defaults['node_count'] = len(nodes)

        # SPACE
        space = ir.get('SPACE', {})
        defaults['region_count'] = len(space.get('regions', []))
        defaults['environment_type'] = space.get('environment_type', '')

        # MECHANIC
        mech = ir.get('MECHANIC', {})
        defaults['mechanic_count'] = len(mech.get('mechanics', []))

        # ASSET
        asset = ir.get('ASSET', {})
        defaults['asset_count'] = len(asset.get('required_assets', []))

        # FEEL
        feel = ir.get('FEEL', {})
        defaults['overall_tone'] = feel.get('overall_tone', '')
        beats = feel.get('emotional_beats', [])
        # Count distinct emotion segments
        emotions = set()
        for b in beats:
            e = b.get('emotion', '')
            if e:
                emotions.add(e)
        defaults['emotion_segments'] = len(emotions)

        # Build description from flow
        if nodes:
            start = next((n.get('name', '') for n in nodes if n.get('type') == 'start'), '')
            end = next((n.get('name', '') for n in nodes if n.get('type') == 'end'), '')
            if start and end:
                defaults['description'] = f'从「{start}」到「{end}」，共 {len(nodes)} 个流程节点。'

        print(f'  [IR] {defaults["level_name"]} ({defaults["level_id"]})')
        return defaults
    except Exception as e:
        print(f'  [WARN] Failed to parse IR: {e}')
        return defaults


def find_ir_path(case_dir):
    """Try to find ir_filled.json based on case directory."""
    case_id = os.path.basename(case_dir)
    # Try sibling test_cases directory
    project_root = os.path.dirname(os.path.dirname(case_dir))
    candidate = os.path.join(project_root, 'test_cases', case_id, 'ir_filled.json')
    if os.path.exists(candidate):
        return candidate
    # Try inside case_dir itself
    candidate2 = os.path.join(case_dir, 'ir_filled.json')
    if os.path.exists(candidate2):
        return candidate2
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python assemble_poi.py <case_output_dir> [ir_json_path]")
        sys.exit(1)

    case_dir = sys.argv[1]
    ir_path = sys.argv[2] if len(sys.argv) > 2 else find_ir_path(case_dir)

    meta = load_ir_metadata(ir_path)

    # Collect available modules
    available = []
    sections = {}
    all_styles = []

    for mod_id, mod_name in MODULE_ORDER:
        filepath = os.path.join(case_dir, f'{mod_id}.html')
        if os.path.exists(filepath):
            with open(filepath, encoding='utf-8') as f:
                content = f.read()
            section = extract_section(content)
            if section:
                section = section.replace('class="module"', f'class="module" id="mod-{mod_id}"', 1)
                sections[mod_id] = section
                available.append((mod_id, mod_name))
                all_styles.append(f'/* === {mod_id.upper()} === */\n{extract_styles(content)}')
                print(f'  [OK] {mod_name} ({mod_id}.html) - {len(section)} chars')
            else:
                print(f'  [SKIP] {mod_name} - no <section class="module"> found')
        else:
            print(f'  [MISS] {mod_name} ({mod_id}.html) - file not found')

    if not available:
        print("ERROR: No modules found to assemble.")
        sys.exit(1)

    # Build nav items
    nav_available = '\n'.join(
        f'        <a href="#mod-{mid}">{mname} <span class="nav-status">\u2713</span></a>'
        for mid, mname in available
    )

    missing_modules = [
        mname for mid, mname in MODULE_ORDER
        if mid not in sections
    ]
    nav_pending = '\n'.join(
        f'        <a href="#" style="color:var(--border-light);cursor:default;">{name}</a>'
        for name in missing_modules
    )

    # Build module sections
    module_sections = ''
    for mod_id, mod_name in available:
        module_sections += f'''
<!-- {"="*60} -->
<!-- MODULE: {mod_name} ({mod_id}) -->
<!-- {"="*60} -->
<div class="module-section-wrapper">
{sections[mod_id]}
</div>
'''

    merged_css = '\n'.join(all_styles)
    timestamp = datetime.now().strftime('%Y-%m-%d')

    # Dynamic hero stats
    stats_html = ''
    stat_items = [
        (meta['node_count'], '流程节点'),
        (meta['emotion_segments'], '情绪类型'),
        (meta['region_count'], '空间区域'),
        (meta['asset_count'] if meta['asset_count'] > 0 else len(available), '资产需求' if meta['asset_count'] > 0 else '文档模块'),
        (meta['mechanic_count'], '玩法机制'),
    ]
    for val, label in stat_items:
        if val > 0:
            stats_html += f'        <div><div class="hero-stat-value">{val}</div><div class="hero-stat-label">{label}</div></div>\n'

    # Type badge mapping
    type_label = {
        'POI': 'POI DESIGN DOCUMENT',
        'MainMission': 'MAIN MISSION DESIGN',
        'SideQuest': 'SIDE QUEST DESIGN',
        'OpenWorldEvent': 'OPEN WORLD EVENT DESIGN',
    }.get(meta['type'], 'LEVEL DESIGN DOCUMENT')

    nav_type_info = f'{meta["type"]}'
    if meta['environment_type']:
        nav_type_info += f' · {meta["environment_type"]}'
    nav_type_info += f' · {meta["level_id"]}'

    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{type_label} — {meta["level_name"]}</title>
    <style>
        :root {{
            --bg-primary:#F4F4F0;--bg-secondary:#E8E8E4;--bg-card:#FFFFFF;
            --text-primary:#111111;--text-secondary:#333333;--text-muted:#666666;
            --accent:#FF4500;--border:#111111;--border-light:#CCCCCC;
            --green:#228B22;--blue:#4169E1;
            --emo-tension-low:#E8F5E9;--emo-tension-high:#FFF3E0;--emo-tension-spike:#FFEBEE;
            --emo-relief:#E3F2FD;--emo-excitement:#FFF8E1;--emo-calm:#F5F5F5;
        }}
        *{{margin:0;padding:0;box-sizing:border-box;}}
        body{{font-family:'Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg-primary);color:var(--text-primary);line-height:1.6;overflow-x:hidden;}}
        .nav{{position:fixed;top:0;left:0;width:240px;height:100vh;background:var(--bg-secondary);border-right:2px solid var(--border);padding:20px 0;overflow-y:auto;z-index:100;}}
        .nav-header{{padding:0 16px 16px;border-bottom:1px solid var(--border-light);margin-bottom:12px;}}
        .nav-header h2{{font-size:12px;color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;font-weight:600;}}
        .nav-header p{{font-size:18px;font-weight:700;letter-spacing:-.5px;}}
        .nav-header .nav-type{{font-size:11px;color:var(--text-muted);margin-top:2px;}}
        .nav-section{{padding:6px 16px;}}
        .nav-section-title{{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;padding-left:4px;}}
        .nav a{{display:block;padding:6px 10px;color:var(--text-secondary);text-decoration:none;font-size:12px;margin-bottom:1px;border-left:2px solid transparent;transition:all .2s;}}
        .nav a:hover,.nav a.active{{color:var(--accent);border-left-color:var(--accent);}}
        .nav a .nav-status{{float:right;font-size:9px;color:var(--green);}}
        .main{{margin-left:240px;}}
        .hero{{padding:48px 40px 36px;border-bottom:2px solid var(--border);}}
        .hero-badge{{display:inline-block;font-size:11px;color:var(--accent);letter-spacing:2px;font-weight:500;text-transform:uppercase;margin-bottom:12px;}}
        .hero h1{{font-size:32px;font-weight:700;line-height:1.2;margin-bottom:12px;letter-spacing:-1px;}}
        .hero-desc{{font-size:14px;color:var(--text-secondary);max-width:600px;margin-bottom:24px;}}
        .hero-stats{{display:flex;gap:32px;flex-wrap:wrap;}}
        .hero-stat-value{{font-size:24px;font-weight:700;color:var(--accent);}}
        .hero-stat-label{{font-size:10px;color:var(--text-muted);margin-top:2px;letter-spacing:.5px;}}
        .module-section-wrapper{{padding:0;border-bottom:2px solid var(--border-light);}}
        .module-section-wrapper:last-child{{border-bottom:none;}}
        .module-section-wrapper .module{{max-width:100%;padding:40px;}}
        .poi-footer{{padding:24px 40px;border-top:2px solid var(--border);background:var(--bg-secondary);text-align:center;}}
        .poi-footer p{{font-size:11px;color:var(--text-muted);letter-spacing:1px;}}
        @media(max-width:900px){{.nav{{display:none;}}.main{{margin-left:0;}}.hero{{padding:40px 20px 30px;}}.module-section-wrapper .module{{padding:30px 20px;}}}}
        @media print{{.nav{{display:none;}}.main{{margin-left:0;}}body{{background:white;}}.module-section-wrapper{{page-break-inside:avoid;}}}}

        /* === MODULE STYLES (merged from standalone files) === */
{merged_css}
    </style>
    <script>
    document.addEventListener('DOMContentLoaded',function(){{
        const sections=document.querySelectorAll('.module[id]');
        const navLinks=document.querySelectorAll('.nav a[href^="#mod-"]');
        function update(){{let c='';const y=window.scrollY+60;sections.forEach(s=>{{if(s.offsetTop<=y)c=s.id;}});navLinks.forEach(l=>{{l.classList.remove('active');if(l.getAttribute('href')==='#'+c)l.classList.add('active');}});}}
        window.addEventListener('scroll',update,{{passive:true}});update();
    }});
    </script>
</head>
<body>

<nav class="nav">
    <div class="nav-header">
        <h2>{type_label}</h2>
        <p>{meta["level_name"]}</p>
        <div class="nav-type">{nav_type_info}</div>
    </div>
    <div class="nav-section">
        <div class="nav-section-title">已完成模块</div>
{nav_available}
    </div>
    <div class="nav-section">
        <div class="nav-section-title">待开发</div>
{nav_pending}
    </div>
</nav>

<main class="main">

<section class="hero">
    <div class="hero-badge">[{type_label}]</div>
    <h1>{meta["level_name"]}</h1>
    <p class="hero-desc">{meta["description"]}</p>
    <div class="hero-stats">
{stats_html}    </div>
</section>

{module_sections}

</main>

<footer class="poi-footer">
    <p>LEVEL DESIGN AGENT · {type_label} · {meta["level_name"]} · {meta["level_id"]}</p>
    <p style="margin-top:4px;">Generated {timestamp} · {len(available)} modules assembled (zero-loss) · v2.0</p>
</footer>

</body>
</html>'''

    output_path = os.path.join(case_dir, 'poi_document.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f'\nPOI document assembled: {output_path}')
    print(f'Total size: {len(html)} chars')
    print(f'Modules: {len(available)} (zero content loss)')
    if missing_modules:
        print(f'Missing: {", ".join(missing_modules)}')


if __name__ == '__main__':
    main()
