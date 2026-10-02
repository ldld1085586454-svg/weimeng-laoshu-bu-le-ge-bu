from pathlib import Path
import json
import os
import shutil
from playwright.sync_api import sync_playwright

base = Path(__file__).resolve().parents[1]
out = Path(os.environ.get('SHEEP_REPORT_DIR', str(base / 'reports'))).resolve()
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    chrome = os.environ.get('CHROME_BIN') or shutil.which('chromium')
    browser = p.chromium.launch(**({'executable_path': chrome} if chrome else {}), headless=True)
    page = browser.new_page(viewport={'width': 420, 'height': 860}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content((base / '算法联调_双击打开.html').read_text(encoding='utf-8'), wait_until='load')
    page.wait_for_function('window.probe !== undefined')
    before = page.evaluate('({status:probe.getState().status,tiles:probe.getState().deal.cells.length})')
    assert before == {'status': 'PLAYING', 'tiles': 270}
    page.screenshot(path=str(out / 'probe-start.png'), full_page=True)
    # Exercise actual pointer events at one playable card center; transforms follow the visible canvas.
    point = page.evaluate('''() => {
      const s=probe.getState(),cs=s.deal.cells,c=cs.find((c,i)=>!s.taken[i]&&s.blockers[i]===0);
      const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
      const minX=Math.min(...cs.map(c=>c.rect.x)),maxX=Math.max(...cs.map(c=>c.rect.x+c.rect.w));
      const minY=Math.min(...cs.map(c=>c.rect.y)),maxY=Math.max(...cs.map(c=>c.rect.y+c.rect.h));
      const scale=Math.min((r.width-30)/(maxX-minX),(r.height-350)/(maxY-minY));
      return {x:r.left+(r.width-(maxX-minX)*scale)/2+(c.rect.x-minX+c.rect.w/2)*scale,
              y:r.top+122+(c.rect.y-minY+c.rect.h/2)*scale};
    }''')
    page.mouse.click(point['x'], point['y'])
    assert page.evaluate('probe.getState().rack.length') == 1
    page.evaluate('probe.restart()')
    # Call every step through the same runtime used by the visible probe, not a forged result.
    count = page.evaluate('''() => {let n=0;while(probe.stepEvidence())n++;return n;}''')
    after = page.evaluate('({status:probe.getState().status,cleared:probe.getState().cleared,rack:probe.getState().rack.length})')
    assert count == 270 and after == {'status': 'WON', 'cleared': 270, 'rack': 0}
    page.screenshot(path=str(out / 'probe-complete.png'), full_page=True)
    assert not errors, errors
    # Phone-sized resize smoke.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('probe.restart()')
    assert page.evaluate('probe.getState().status') == 'PLAYING'
    # Pure JS identity/validation also executes in the browser, without Node polyfills.
    identity_checks = page.evaluate("""() => {
      const rt=modules.runtime,hash=modules['content-hash'].hashSnapshot;
      const initial=probe.getState();
      const a=rt.shuffleRemaining(initial,{shuffle:x=>x.slice()});
      const b=rt.shuffleRemaining(initial,{shuffle:x=>x.slice().reverse()});
      let rejected=false;
      try {const bad=JSON.parse(JSON.stringify(initial.deal));bad.cells[0].type='BAD';rt.createRound(bad);} catch(e){rejected=true;}
      return {original:initial.deal.snapshotHash===hash(initial.deal),
        shuffled:a.deal.snapshotHash===hash(a.deal)&&b.deal.snapshotHash===hash(b.deal),
        distinguishesMappings:a.deal.snapshotHash!==b.deal.snapshotHash,badInputRejected:rejected};
    }""")
    assert all(identity_checks.values()), identity_checks
    file_navigation = {'tested': True, 'passed': False}
    try:
        page.goto((base / '算法联调_双击打开.html').as_uri(), wait_until='load', timeout=10000)
        page.wait_for_function('window.probe !== undefined', timeout=3000)
        assert page.evaluate('probe.getState().status') == 'PLAYING'
        file_navigation['passed'] = True
    except Exception as error:
        file_navigation['error'] = str(error)
    result={'environment':'Headless Chromium; set_content gameplay tests plus a separately reported local-file navigation attempt. NOT WeChat DevTools, Windows desktop or phone',
            'browser_identity_checks':identity_checks,'local_file_navigation':file_navigation, 'pointer_pick':True,
            'evidence_steps':count,'completion':after,'resize_restart':True,'page_errors':errors}
    (out/'browser-smoke.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    browser.close()
