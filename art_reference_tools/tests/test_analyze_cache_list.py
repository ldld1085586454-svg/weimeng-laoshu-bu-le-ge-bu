import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / 'analyze_cache_list.py'

def test_maps_source_url_to_local_cache_and_filters_targets(tmp_path):
    cache = {
        'files': {
            'https://cdn.example/remote/resources/native/80/abc.bc433.mp3': {
                'bundle': 'resources',
                'url': 'wxfile://usr/gamecaches/resources/123.mp3',
                'lastTime': '1663847712008'
            },
            'https://cdn.example/remote/main/config.ac8a6.json': {
                'bundle': 'main',
                'url': 'wxfile://usr/gamecaches/main/456.json',
                'lastTime': '1663847712513'
            }
        }
    }
    p = tmp_path / 'cacheList.json'
    p.write_text(json.dumps(cache), encoding='utf-8')
    out = tmp_path / 'out.json'
    cp = subprocess.run(
        [sys.executable, str(TOOL), str(p), '--contains', 'bc433;ac8a6', '--json', str(out)],
        text=True, capture_output=True
    )
    assert cp.returncode == 0, cp.stderr
    data = json.loads(out.read_text(encoding='utf-8'))
    assert data['total_entries'] == 2
    assert len(data['matched']) == 2
    assert data['matched'][0]['source_url'].startswith('https://cdn.example/')
    assert data['matched'][0]['local_path'].startswith('gamecaches/')
    assert data['matched'][0]['cached_at_utc'].startswith('2022-09-22T')


def test_csv_export_has_expected_columns(tmp_path):
    cache = {'files': {'https://cdn/x.png': {'bundle': 'resources', 'url': 'wxfile://usr/gamecaches/resources/x.png', 'lastTime': '1663847712008'}}}
    p = tmp_path / 'cacheList.json'
    p.write_text(json.dumps(cache), encoding='utf-8')
    out = tmp_path / 'out.csv'
    cp = subprocess.run([sys.executable, str(TOOL), str(p), '--csv', str(out)], text=True, capture_output=True)
    assert cp.returncode == 0, cp.stderr
    text = out.read_text(encoding='utf-8-sig')
    assert 'source_url,local_path,bundle,last_time_ms,cached_at_utc' in text
    assert 'gamecaches/resources/x.png' in text
