from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Dict, Iterable


def _resource_root(root: Path) -> Path:
    root = Path(root)
    candidates = [
        root / 'assets' / 'resources',
        root / 'test' / 'assets' / 'resources',
        root / 'resources',
        root,
    ]
    for candidate in candidates:
        if candidate.exists() and any(candidate.glob('config*.json')):
            return candidate
    raise FileNotFoundError(f'No Cocos resources/config*.json found under: {root}')


def _load_config(resources: Path):
    configs = sorted(resources.glob('config*.json'))
    if not configs:
        raise FileNotFoundError(f'No config*.json in {resources}')
    with configs[0].open('r', encoding='utf-8') as f:
        return json.load(f), configs[0]


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def _native_map(resources: Path) -> Dict[str, str]:
    native = resources / 'native'
    if not native.exists():
        return {}
    out: Dict[str, str] = {}
    for p in sorted(native.rglob('*')):
        if p.is_file():
            rel = p.relative_to(resources).as_posix()
            out[rel] = _digest(p)
    return out


def _stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def compare_roots(left_root: Path, right_root: Path) -> dict:
    left_res = _resource_root(Path(left_root))
    right_res = _resource_root(Path(right_root))
    left_cfg, left_cfg_path = _load_config(left_res)
    right_cfg, right_cfg_path = _load_config(right_res)
    left_native = _native_map(left_res)
    right_native = _native_map(right_res)

    left_keys = set(left_native)
    right_keys = set(right_native)
    overlap = sorted(left_keys & right_keys)
    changed = [p for p in overlap if left_native[p] != right_native[p]]
    identical = [p for p in overlap if left_native[p] == right_native[p]]

    return {
        'left_resources': str(left_res),
        'right_resources': str(right_res),
        'left_config': str(left_cfg_path),
        'right_config': str(right_cfg_path),
        'config_equal': _stable_json(left_cfg) == _stable_json(right_cfg),
        'native_left_count': len(left_native),
        'native_right_count': len(right_native),
        'native_overlap_count': len(overlap),
        'native_identical_count': len(identical),
        'native_changed': changed,
        'only_left': sorted(left_keys - right_keys),
        'only_right': sorted(right_keys - left_keys),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Compare two local Cocos build snapshots without trusting formatting or filenames alone.')
    parser.add_argument('left')
    parser.add_argument('right')
    parser.add_argument('--json-out')
    args = parser.parse_args()
    result = compare_roots(Path(args.left), Path(args.right))
    text = json.dumps(result, ensure_ascii=False, indent=2)
    print(text)
    if args.json_out:
        Path(args.json_out).write_text(text + '\n', encoding='utf-8')
    return 0 if result['config_equal'] and not result['native_changed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
