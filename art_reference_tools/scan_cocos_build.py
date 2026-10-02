#!/usr/bin/env python3
"""Scan a Cocos Creator packaged resources directory and build a reusable asset index.

Input: directory containing config.*.json plus import/ and native/.
Output is a Python dict or CSV/JSON files when used from CLI.
No network access and no asset redistribution are performed by this tool.
"""
from __future__ import annotations
import argparse, csv, json, re, struct
from pathlib import Path
from typing import Any

_B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
_HEX='0123456789abcdef'


def decode_uuid(s: str) -> str:
    """Decode Cocos 22-char compressed UUID; leave short aliases untouched."""
    if not isinstance(s,str) or len(s)!=22:
        return s
    out=s[:2]
    try:
        for i in range(2,22,2):
            a=_B64.index(s[i]); b=_B64.index(s[i+1])
            out += _HEX[a>>2] + _HEX[((a&3)<<2)|(b>>4)] + _HEX[b&15]
    except ValueError:
        return s
    return f'{out[:8]}-{out[8:12]}-{out[12:16]}-{out[16:20]}-{out[20:]}'


def _versions(seq: list[Any] | None) -> dict[int,str]:
    seq=seq or []
    out={}
    for i in range(0,len(seq)-1,2):
        try: out[int(seq[i])]=str(seq[i+1])
        except Exception: pass
    return out


def _find_config(root: Path) -> Path:
    files=sorted(root.glob('config*.json'))
    if not files:
        raise FileNotFoundError(f'no config*.json under {root}')
    return files[0]


def _uuid_stem(raw: str) -> str:
    return decode_uuid(raw) if len(raw)==22 else raw


def _candidate_import(root: Path, raw: str, ver: str | None) -> Path | None:
    if not ver: return None
    stem=_uuid_stem(raw); p=root/'import'/stem[:2]/f'{stem}.{ver}.json'
    return p if p.exists() else None


def _candidate_native(root: Path, raw: str, ver: str | None) -> Path | None:
    if not ver: return None
    stem=_uuid_stem(raw); d=root/'native'/stem[:2]
    if not d.exists(): return None
    exact=list(d.glob(f'{stem}.{ver}.*'))
    return exact[0] if exact else None


def _walk(v: Any):
    if isinstance(v,dict):
        yield v
        for x in v.values(): yield from _walk(x)
    elif isinstance(v,list):
        for x in v: yield from _walk(x)


def _string_walk(v: Any):
    if isinstance(v,str): yield v
    elif isinstance(v,dict):
        for x in v.values(): yield from _string_walk(x)
    elif isinstance(v,list):
        for x in v: yield from _string_walk(x)


def _png_size(path: Path | None):
    if not path or path.suffix.lower()!='.png': return None
    try:
        with path.open('rb') as f:
            sig=f.read(24)
        if sig[:8] != b'\x89PNG\r\n\x1a\n': return None
        return list(struct.unpack('>II',sig[16:24]))
    except Exception:
        return None


def _dep_info(root: Path, cfg: dict[str,Any], raw: str, native_versions: dict[int,str]):
    uuids=cfg.get('uuids',[])
    try: idx=uuids.index(raw)
    except ValueError: idx=-1
    nv=native_versions.get(idx)
    native=_candidate_native(root,raw,nv) if idx>=0 else None
    return {
        'rawUuid':raw,
        'decodedUuid':decode_uuid(raw),
        'index':idx,
        'nativeVersion':nv,
        'nativePath':str(native.relative_to(root)).replace('\\','/') if native else None,
        'nativeBytes':native.stat().st_size if native else None,
        'nativeImageSize':_png_size(native),
    }


def _parse_import(root: Path, cfg: dict[str,Any], import_path: Path, logical_key: str | None, native_versions: dict[int,str]):
    try: data=json.loads(import_path.read_text(encoding='utf-8'))
    except Exception:
        return [],[]
    deps=[]
    if isinstance(data,list) and len(data)>1 and isinstance(data[1],list):
        deps=[x for x in data[1] if isinstance(x,str)]
    dep_infos=[_dep_info(root,cfg,x,native_versions) for x in deps]
    spriteframes=[]
    for obj in _walk(data):
        if isinstance(obj.get('name'),str) and isinstance(obj.get('rect'),list) and len(obj['rect'])==4:
            spriteframes.append({
                'logicalKey':logical_key,
                'name':obj['name'],
                'importPath':str(import_path.relative_to(root)).replace('\\','/'),
                'rect':obj.get('rect'),
                'offset':obj.get('offset',[0,0]),
                'originalSize':obj.get('originalSize',obj.get('rect',[0,0,0,0])[2:]),
                'rotated':bool(obj.get('rotated',0)),
                'capInsets':obj.get('capInsets'),
                'textureDependencies':dep_infos,
            })
    skeletons=[]
    atlas_texts=[s for s in _string_walk(data) if '\nsize:' in s and '.png' in s]
    skeleton_objs=[o for o in _walk(data) if isinstance(o.get('skeleton'),dict) and isinstance(o.get('animations'),dict)]
    for sk in skeleton_objs:
        atlas=atlas_texts[0] if atlas_texts else ''
        m=re.search(r'(?:^|\n)([^\n]+\.png)\nsize:\s*(\d+)\s*,\s*(\d+)',atlas)
        skeletons.append({
            'logicalKey':logical_key,
            'importPath':str(import_path.relative_to(root)).replace('\\','/'),
            'atlasTextureName':m.group(1) if m else None,
            'atlasSize':[int(m.group(2)),int(m.group(3))] if m else None,
            'spineVersion':sk.get('skeleton',{}).get('spine'),
            'skins':[x.get('name') for x in sk.get('skins',[]) if isinstance(x,dict) and x.get('name')],
            'animations':list(sk.get('animations',{}).keys()),
            'textureDependencies':dep_infos,
        })
    return spriteframes,skeletons


def scan_resources(resources_root: str | Path) -> dict[str,Any]:
    root=Path(resources_root).resolve()
    cfg_path=_find_config(root)
    cfg=json.loads(cfg_path.read_text(encoding='utf-8'))
    impv=_versions(cfg.get('versions',{}).get('import'))
    natv=_versions(cfg.get('versions',{}).get('native'))
    rows=[]; spriteframes=[]; skeletons=[]
    paths=cfg.get('paths',{})
    for k,val in sorted(paths.items(), key=lambda kv:int(kv[0])):
        try: idx=int(k)
        except Exception: continue
        logical=val[0] if isinstance(val,list) and val else None
        raw=cfg.get('uuids',[None]*(idx+1))[idx] if idx < len(cfg.get('uuids',[])) else None
        if not raw: continue
        iv=impv.get(idx); nv=natv.get(idx)
        imp=_candidate_import(root,raw,iv)
        native=_candidate_native(root,raw,nv)
        row={
            'index':idx,'logicalKey':logical,'rawUuid':raw,'decodedUuid':decode_uuid(raw),
            'importVersion':iv,'nativeVersion':nv,
            'importPath':str(imp.relative_to(root)).replace('\\','/') if imp else None,
            'nativePath':str(native.relative_to(root)).replace('\\','/') if native else None,
            'nativeBytes':native.stat().st_size if native else None,
            'nativeImageSize':_png_size(native),
        }
        rows.append(row)
        if imp:
            sf,sk=_parse_import(root,cfg,imp,logical,natv)
            spriteframes.extend(sf); skeletons.extend(sk)
    return {
        'configPath':str(cfg_path.relative_to(root)).replace('\\','/'),
        'resourcesRoot':str(root),
        'resourceCount':len(rows),
        'spriteframeCount':len(spriteframes),
        'skeletonCount':len(skeletons),
        'resources':rows,
        'spriteframes':spriteframes,
        'skeletons':skeletons,
    }


def _write_csv(path: Path, rows: list[dict[str,Any]], fields: list[str]):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore'); w.writeheader()
        for r in rows:
            rr=dict(r)
            for k,v in list(rr.items()):
                if isinstance(v,(list,dict)): rr[k]=json.dumps(v,ensure_ascii=False,separators=(',',':'))
            w.writerow(rr)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--resources-root',required=True,help='directory containing config*.json, import/, native/')
    p.add_argument('--out',required=True,help='output index directory')
    a=p.parse_args(); out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    report=scan_resources(a.resources_root)
    (out/'scan_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    _write_csv(out/'resource_file_index.csv',report['resources'],[
        'index','logicalKey','rawUuid','decodedUuid','importVersion','nativeVersion','importPath','nativePath','nativeBytes','nativeImageSize'])
    sf=report['spriteframes']
    _write_csv(out/'spriteframes.csv',sf,['logicalKey','name','importPath','rect','offset','originalSize','rotated','textureDependencies'])
    _write_csv(out/'block_spriteframes.csv',[x for x in sf if (x.get('logicalKey') or '').startswith('block/')],['logicalKey','name','importPath','rect','offset','originalSize','rotated','textureDependencies'])
    _write_csv(out/'reward_spriteframes.csv',[x for x in sf if (x.get('logicalKey') or '').startswith('rewardIcon/')],['logicalKey','name','importPath','rect','offset','originalSize','rotated','textureDependencies'])
    _write_csv(out/'rank_spriteframes.csv',[x for x in sf if (x.get('logicalKey') or '').startswith('rank/')],['logicalKey','name','importPath','rect','offset','originalSize','rotated','textureDependencies'])
    (out/'spine_assets.json').write_text(json.dumps(report['skeletons'],ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['configPath','resourceCount','spriteframeCount','skeletonCount']},ensure_ascii=False))

if __name__=='__main__': main()
