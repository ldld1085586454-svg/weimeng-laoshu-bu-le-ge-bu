#!/usr/bin/env python3
"""Extract SpriteFrame metadata from a Cocos packed main-bundle JSON.

The tool does not download anything. It indexes a local build and emits:
- main_ui_spriteframes.csv
- main_ui_symbols.txt
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_HEX = "0123456789abcdef"


def decode_compact_uuid(value: str) -> str:
    if len(value) != 22:
        return value
    out = value[:2]
    for i in range(2, 22, 2):
        a = _B64.index(value[i])
        b = _B64.index(value[i + 1])
        out += _HEX[a >> 2]
        out += _HEX[((a & 3) << 2) | (b >> 4)]
        out += _HEX[b & 15]
    return f"{out[:8]}-{out[8:12]}-{out[12:16]}-{out[16:20]}-{out[20:]}"


def native_version(config: dict, dep: str) -> str | None:
    try:
        idx = config.get("uuids", []).index(dep)
    except ValueError:
        return None
    versions = config.get("versions", {}).get("native", [])
    for i in range(0, len(versions), 2):
        if versions[i] == idx:
            return versions[i + 1]
    return None


def resolve_native_path(native_root: Path, config: dict, dep: str) -> str:
    version = native_version(config, dep)
    decoded = decode_compact_uuid(dep)
    candidates = []
    if version:
        candidates.extend(native_root.rglob(f"{decoded}.{version}.*"))
        candidates.extend(native_root.rglob(f"{dep}.{version}.*"))
    if not candidates:
        candidates.extend(native_root.rglob(f"{decoded}.*"))
        candidates.extend(native_root.rglob(f"{dep}.*"))
    if not candidates:
        return ""
    return str(sorted(candidates)[0])


def iter_spriteframes(pack: list):
    deps = pack[1] if len(pack) > 1 and isinstance(pack[1], list) else []
    records = pack[5] if len(pack) > 5 and isinstance(pack[5], list) else []
    for record in records:
        if not isinstance(record, list) or not record:
            continue
        first = record[0]
        if not isinstance(first, list) or not first or not isinstance(first[0], dict):
            continue
        obj = first[0]
        if not isinstance(obj.get("name"), str) or not isinstance(obj.get("rect"), list):
            continue
        tail = record[-1] if record else None
        dep_index = tail[0] if isinstance(tail, list) and len(tail) == 1 and isinstance(tail[0], int) else None
        dep = deps[dep_index] if dep_index is not None and 0 <= dep_index < len(deps) else ""
        rect = obj.get("rect", ["", "", "", ""])
        original = obj.get("originalSize", ["", ""])
        offset = obj.get("offset", ["", ""])
        yield {
            "resource_name": obj["name"],
            "texture_alias": dep,
            "x": rect[0], "y": rect[1], "w": rect[2], "h": rect[3],
            "offset_x": offset[0] if len(offset) > 0 else "",
            "offset_y": offset[1] if len(offset) > 1 else "",
            "original_w": original[0] if len(original) > 0 else "",
            "original_h": original[1] if len(original) > 1 else "",
            "rotated": 1 if obj.get("rotated") else 0,
        }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack-json", required=True)
    ap.add_argument("--config-json", required=True)
    ap.add_argument("--native-root", required=True)
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()

    pack_path = Path(args.pack_json)
    config_path = Path(args.config_json)
    native_root = Path(args.native_root)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    config = json.loads(config_path.read_text(encoding="utf-8"))
    rows = list(iter_spriteframes(pack))
    for row in rows:
        row["native_path"] = resolve_native_path(native_root, config, row["texture_alias"]) if row["texture_alias"] else ""

    fields = [
        "resource_name", "texture_alias", "native_path", "x", "y", "w", "h",
        "offset_x", "offset_y", "original_w", "original_h", "rotated"
    ]
    with (out_dir / "main_ui_spriteframes.csv").open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    (out_dir / "main_ui_symbols.txt").write_text(
        "\n".join(sorted({r["resource_name"] for r in rows})) + ("\n" if rows else ""),
        encoding="utf-8"
    )
    print(json.dumps({"spriteframes": len(rows), "output": str(out_dir)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
