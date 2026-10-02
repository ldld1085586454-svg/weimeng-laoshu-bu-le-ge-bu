"""Tests the shared canvas UI in Chromium; NOT a WeChat DevTools or phone test."""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=Path(os.environ.get('SHEEP_REPORT_DIR',str(root/'reports')))
out.mkdir(exist_ok=True,parents=True)
receipt=json.loads((root/'examples/deal-270.receipt.json').read_text())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium'),headless=True)
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    # Attempt file navigation separately; managed browser policies may block file://.
    navigation={'mode':'file','local_file_passed':False}
    try:
        page.goto((root/'道具与对局联调_双击打开.html').as_uri(),wait_until='load',timeout=5000)
        navigation['local_file_passed']=True
    except Exception as error:
        navigation['local_file_error']=str(error)
        navigation['mode']='set_content_same_complete_html'
        page.close()
        page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        if os.environ.get('SHEEP_PREVIEW_URL'):
            navigation['mode']='loopback_http'
            try:
                page.goto(os.environ['SHEEP_PREVIEW_URL'],wait_until='load',timeout=5000)
                navigation['loopback_http_passed']=True
            except Exception as http_error:
                navigation['loopback_http_passed']=False
                navigation['loopback_http_error']=str(http_error)
                navigation['mode']='set_content_same_complete_html'
                page.close()
                page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_content((root/'道具与对局联调_双击打开.html').read_text(encoding='utf-8'),wait_until='load')
        else:
            page.set_content((root/'道具与对局联调_双击打开.html').read_text(encoding='utf-8'),wait_until='load')
    page.wait_for_function('window.game !== undefined')
    def click(key):
        b=page.evaluate('key=>{const b=game.getHitRegions().find(b=>b.id===key);if(!b)throw Error(key);const c=document.querySelector("canvas").getBoundingClientRect();return {x:c.left+b.x+b.w/2,y:c.top+b.y+b.h/2};}',key)
        page.mouse.click(b['x'],b['y'])
    def state():return page.evaluate('()=>({scene:game.getScene(),status:game.getSession()?.board.status,rack:game.getSession()?.board.rack,buffer:game.getSession()?.board.buffer,used:game.getSession()?.used,pending:game.getSession()?.pending})')
    page.screenshot(path=str(out/'play-home.png'))
    click('start');page.screenshot(path=str(out/'play-start.png'))
    first=page.evaluate('game.getHitRegions().find(x=>x.kind==="tile"&&x.enabled&&x.zone==="board").id')
    click(first);assert len(state()['rack'])==1
    click('undo');assert state()['pending']['assist']=='undo'
    page.screenshot(path=str(out/'play-mock-reward.png'))
    click('mock-cancelled');assert len(state()['rack'])==1 and state()['used']['undo']==0
    click('undo');click('mock-completed');assert len(state()['rack'])==0 and state()['used']['undo']==1
    # Three different visible labels, then move and return an actual buffered card.
    for _ in range(3):
        key=page.evaluate('''()=>{const s=game.getSession().board;const types=new Set(s.rack.map(id=>s.deal.cells[s.byId[id]].type));
          return game.getHitRegions().find(x=>x.kind==='tile'&&x.enabled&&!types.has(s.deal.cells[s.byId[x.tileId]].type)).id;}''')
        click(key)
    assert len(state()['rack'])==3
    click('move');click('mock-completed');assert len(state()['buffer'])==3 and len(state()['rack'])==0
    page.screenshot(path=str(out/'play-buffer.png'))
    click('tile:'+state()['buffer'][0]);assert len(state()['rack'])==1 and len(state()['buffer'])==2
    rack_before=state()['rack'];buffer_before=state()['buffer']
    click('shuffle');click('mock-failed');assert state()['used']['shuffle']==0
    click('shuffle');click('mock-share_returned');assert state()['used']['shuffle']==0
    click('shuffle');page.evaluate('game.setVisible(false);game.setVisible(true)');assert state()['pending']
    click('mock-completed');assert state()['used']['shuffle']==1
    assert state()['rack']==rack_before and state()['buffer']==buffer_before
    replay_result=page.evaluate('''()=>{const text=game.exportDiagnostic(),restored=load('src/play/session').restoreSession(text);
      return {ok:restored.ok,equal:restored.ok&&load('src/play/session').fingerprint(restored.session)===load('src/play/session').fingerprint(game.getSession())};}''')
    assert replay_result=={'ok':True,'equal':True}
    # Terminal state through 270 real accepted PICK commands.
    click('restart')
    completed=page.evaluate('''ids=>{for(const id of ids){const r=game.pickForQA(id);if(!r.ok)throw Error(r.code);}const s=game.getSession().board;
        return {cleared:s.cleared,status:s.status,rack:s.rack.length,buffer:s.buffer.length};}''',receipt['witness'])
    assert completed=={'cleared':270,'status':'WON','rack':0,'buffer':0}
    page.screenshot(path=str(out/'play-complete.png'))
    # Exercise failure by a legal adversarial policy without changing board data.
    click('restart')
    failed=page.evaluate('''()=>{for(let t=0;t<300;t++){const s=game.getSession().board;if(s.status!=='PLAYING')return s.status;
      const counts={};for(const id of s.rack){const k=s.deal.cells[s.byId[id]].type;counts[k]=(counts[k]||0)+1;}
      const legal=load('src/play/board').legalTiles(s);legal.sort((a,b)=>(counts[s.deal.cells[s.byId[a]].type]||0)-(counts[s.deal.cells[s.byId[b]].type]||0));
      if(!game.pickForQA(legal[0]).ok)throw Error('illegal');}return 'RUNNING';}''')
    assert failed=='LOST';click('revive');assert not state()['pending']
    page.screenshot(path=str(out/'play-failed.png'))
    sizes=[]
    for w,h in [(320,568),(390,844),(430,932),(1024,768)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80);click('restart')
        inside=page.evaluate('''()=>{const b=document.querySelector('canvas').getBoundingClientRect();return game.getHitRegions().every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=b.width+.1&&r.y+r.h<=b.height+.1);}''')
        assert inside,(w,h)
        sizes.append({'width':w,'height':h,'all_hit_regions_inside_canvas':inside})
    assert not errors,errors
    report={'environment':'Linux headless Chromium; not Windows, WeChat DevTools, Android or iOS',
      'navigation':navigation,'actual_pointer':True,'undo_cancel_then_complete':True,'move_and_buffer_return':True,
      'shuffle_failure_share_return_and_completion':True,'pending_preserved_on_hide_show':True,
      'diagnostic_replay':replay_result,'completion':completed,'failure_and_revive_guard':failed,
      'viewport_checks':sizes,'page_errors':errors}
    (out/'play-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
