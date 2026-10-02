#!/usr/bin/env python3
import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


def normalize_local(url: str) -> str:
    prefix = 'wxfile://usr/'
    return url[len(prefix):] if url.startswith(prefix) else url


def iso_from_ms(value):
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        return ''


def parse_cache(data):
    files = data.get('files') or {}
    rows = []
    for source_url, meta in files.items():
        meta = meta or {}
        last = str(meta.get('lastTime') or '')
        rows.append({
            'source_url': source_url,
            'local_path': normalize_local(str(meta.get('url') or '')),
            'bundle': str(meta.get('bundle') or ''),
            'last_time_ms': last,
            'cached_at_utc': iso_from_ms(last),
        })
    return rows


def main():
    ap = argparse.ArgumentParser(description='Analyze a WeChat Cocos cacheList.json without copying binary assets.')
    ap.add_argument('cache_list')
    ap.add_argument('--contains', default='', help='semicolon-separated substrings matched against source/local paths')
    ap.add_argument('--json', dest='json_out')
    ap.add_argument('--csv', dest='csv_out')
    ns = ap.parse_args()

    data = json.loads(Path(ns.cache_list).read_text(encoding='utf-8'))
    rows = parse_cache(data)
    terms = [x for x in (s.strip() for s in ns.contains.split(';')) if x]
    matched = rows if not terms else [r for r in rows if any(t in r['source_url'] or t in r['local_path'] for t in terms)]

    result = {'total_entries': len(rows), 'match_terms': terms, 'matched': matched}
    if ns.json_out:
        Path(ns.json_out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    if ns.csv_out:
        with Path(ns.csv_out).open('w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=['source_url','local_path','bundle','last_time_ms','cached_at_utc'])
            w.writeheader(); w.writerows(matched)
    if not ns.json_out and not ns.csv_out:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
