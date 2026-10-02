#!/usr/bin/env python3
from __future__ import annotations
import argparse, csv, json
from pathlib import Path

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
HEX = "0123456789abcdef"

def decode_uuid(s: str) -> str:
    if len(s) != 22:
        return s
    out = s[:2]
    for i in range(2, 22, 2):
        a, b = B64.index(s[i]), B64.index(s[i+1])
        out += HEX[a >> 2] + HEX[((a & 3) << 2) | (b >> 4)] + HEX[b & 15]
    return f"{out[:8]}-{out[8:12]}-{out[12:16]}-{out[16:20]}-{out[20:]}"

def version_map(items):
    return {int(items[i]): items[i+1] for i in range(0, len(items), 2)}

def find_config(root: Path) -> Path:
    hits = sorted(root.glob('config.*.json')) + sorted(root.glob('config.json'))
    if not hits:
        raise FileNotFoundError(f'no config.*.json under {root}')
    return hits[0]

def resolve(resources_root: Path):
    cfg_path = find_config(resources_root)
    cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
    iv = version_map(cfg.get('versions', {}).get('import', []))
    nv = version_map(cfg.get('versions', {}).get('native', []))
    rows = []
    for k, spec in cfg.get('paths', {}).items():
        idx = int(k)
        key = spec[0]
        compact = cfg['uuids'][idx]
        uid = decode_uuid(compact)
        native_version = nv.get(idx)
        import_version = iv.get(idx)
        native_path = ''
        if native_version:
            d = resources_root / 'native' / uid[:2]
            if d.exists():
                matches = sorted(d.glob(f'{uid}.{native_version}.*'))
                if matches:
                    native_path = str(matches[0].relative_to(resources_root)).replace('\\','/')
        import_path = ''
        if import_version:
            d = resources_root / 'import' / uid[:2]
            if d.exists():
                matches = sorted(d.glob(f'{uid}.{import_version}.json'))
                if matches:
                    import_path = str(matches[0].relative_to(resources_root)).replace('\\','/')
        rows.append({
            'index': idx, 'resource_key': key, 'uuid': uid,
            'import_version': import_version or '', 'import_path': import_path,
            'native_version': native_version or '', 'native_path': native_path,
        })
    return cfg_path, rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('resources_root', type=Path, help='Cocos assets/resources directory')
    ap.add_argument('-o','--output', type=Path, default=Path('resolved_resources.csv'))
    ns = ap.parse_args()
    cfg, rows = resolve(ns.resources_root)
    ns.output.parent.mkdir(parents=True, exist_ok=True)
    with ns.output.open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ['index'])
        w.writeheader(); w.writerows(rows)
    print(f'config={cfg}')
    print(f'rows={len(rows)} output={ns.output}')

if __name__ == '__main__':
    main()
