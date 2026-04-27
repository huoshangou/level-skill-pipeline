#!/usr/bin/env python3
"""扫描 outputs/*/manifest.json，重新生成 outputs/INDEX.md。

用法：
    python3 ~/LevelAgent/pipeline/regen_index.py
    python3 ~/LevelAgent/pipeline/regen_index.py /custom/outputs/path
"""
import json
import os
import sys
import datetime
import tempfile

DEFAULT_OUTPUTS = os.path.expanduser("~/LevelAgent/outputs")


def scan(outputs_dir: str) -> list[dict]:
    rows = []
    for name in sorted(os.listdir(outputs_dir)):
        d = os.path.join(outputs_dir, name)
        if not os.path.isdir(d):
            continue
        info = {
            "case_id": name,
            "ir_version": "—",
            "status": "空",
            "last_updated": "—",
            "assembled": False,
        }
        m = os.path.join(d, "manifest.json")
        if os.path.isfile(m):
            try:
                data = json.load(open(m))
                info["ir_version"] = data.get("ir", {}).get("version", "—")
                ts = data.get("last_updated", "")
                if ts:
                    info["last_updated"] = ts.replace("T", " ")[:16]
                statuses = [v.get("status") for v in data.get("modules", {}).values()]
                if statuses and all(s == "locked" for s in statuses):
                    info["status"] = "locked"
                elif any(s == "confirmed" for s in statuses):
                    info["status"] = "confirmed"
                elif any(s == "generated" for s in statuses):
                    info["status"] = "generated"
                else:
                    info["status"] = "—"
            except (json.JSONDecodeError, OSError) as e:
                info["status"] = f"manifest错误: {e.__class__.__name__}"
        info["assembled"] = os.path.isfile(os.path.join(d, "assembled_document.html"))
        rows.append(info)
    return rows


def render(rows: list[dict], outputs_dir: str) -> str:
    lines = [
        "# LevelAgent Outputs Index",
        "",
        f"更新于 {datetime.date.today().isoformat()} | 真源目录：`{outputs_dir.replace(os.path.expanduser('~'), '~')}/`",
        "",
        "| case | IR 版本 | 模块状态 | 最近更新 | 交付 |",
        "|------|---------|---------|---------|------|",
    ]
    for r in rows:
        a = (
            f"[assembled]({r['case_id']}/assembled_document.html)"
            if r["assembled"] else "—"
        )
        lines.append(
            f"| {r['case_id']} | {r['ir_version']} | {r['status']} | {r['last_updated']} | {a} |"
        )
    lines += [
        "",
        "## 维护说明",
        "",
        "- **真源**：本目录是所有 case 交付物的唯一真源。`~/Desktop/level-skill-pipeline/src/outputs/` 是开发副本，未来建议软链至此。",
        "- **归档**：历史版本存于 `~/Archive/LevelAgent-YYYY-MM-DD/`。",
        "- **重生成索引**：`python3 ~/LevelAgent/pipeline/regen_index.py`",
        "",
    ]
    return "\n".join(lines)


def atomic_write(path: str, content: str) -> None:
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".INDEX.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def main() -> int:
    outputs_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUTS
    if not os.path.isdir(outputs_dir):
        print(f"目录不存在: {outputs_dir}", file=sys.stderr)
        return 1
    rows = scan(outputs_dir)
    content = render(rows, outputs_dir)
    out = os.path.join(outputs_dir, "INDEX.md")
    atomic_write(out, content)
    print(f"✓ 已写入 {out}（{len(rows)} 个 case）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
