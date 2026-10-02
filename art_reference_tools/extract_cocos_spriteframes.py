#!/usr/bin/env python3
"""Extract SpriteFrame crops from a Cocos atlas PNG using a CSV manifest.

This tool does not download any game asset. You must provide an atlas image that
you are authorized to use. It is intended for local reconstruction/research.
"""
from __future__ import annotations
import argparse, csv
from pathlib import Path
from PIL import Image

def parse_args():
    p=argparse.ArgumentParser()
    p.add_argument('--atlas', required=True, help='atlas PNG path')
    p.add_argument('--manifest', required=True, help='CSV manifest path')
    p.add_argument('--out', required=True, help='output directory')
    p.add_argument('--rotation', choices=['ccw','cw'], default='ccw', help='rotation used to undo rotated sprites')
    p.add_argument('--reconstruct-original', action='store_true', help='center trimmed crop on originalSize canvas')
    return p.parse_args()

def intv(row,key,default=0):
    try:return int(float(row.get(key,default)))
    except:return default

def main():
    a=parse_args(); atlas=Image.open(a.atlas).convert('RGBA'); out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    with open(a.manifest,'r',encoding='utf-8-sig',newline='') as f:
        rows=list(csv.DictReader(f))
    made=0
    for row in rows:
        name=row.get('asset_key') or row.get('name')
        if not name: continue
        if row.get('rect'):
            x,y,w,h=[int(float(v.strip())) for v in row['rect'].split(',')]
            if row.get('original_size'):
                ow,oh=[int(float(v.strip())) for v in row['original_size'].split(',')]
            else: ow,oh=w,h
        else:
            x=intv(row,'rect_x'); y=intv(row,'rect_y'); w=intv(row,'rect_w'); h=intv(row,'rect_h')
            ow=intv(row,'original_w',w); oh=intv(row,'original_h',h)
        crop=atlas.crop((x,y,x+w,y+h))
        rotated=str(row.get('rotated','0')).strip().lower() in ('1','true','yes')
        if rotated:
            crop=crop.rotate(90 if a.rotation=='ccw' else -90, expand=True)
        if a.reconstruct_original:
            canvas=Image.new('RGBA',(ow,oh),(0,0,0,0))
            px=(ow-crop.width)//2; py=(oh-crop.height)//2
            canvas.alpha_composite(crop,(px,py)); crop=canvas
        crop.save(out/f'{name}.png')
        made+=1
    print(f'extracted={made} atlas={atlas.size[0]}x{atlas.size[1]} out={out}')

if __name__=='__main__': main()
