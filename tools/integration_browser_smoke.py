"""Chromium UI checks only. Does not certify Windows/WeChat/phones."""
from pathlib import Path
import json, shutil, os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]; out=root/'reports';out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    target=root/'对局与领取整合_双击打开.html'
    mode='file'
    try:page.goto(target.as_uri(),wait_until='load',timeout=6000)
    except Exception as e:
        mode='same_complete_html_set_content'
        page.close();page=browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(target.read_text(),wait_until='load')
    page.wait_for_function('window.game !== undefined')
    def click(key):
        pos=page.evaluate("""key=>{const r=game.getHitRegions().find(x=>x.id===key);
          if(!r)throw Error('missing:'+key);
          const c=document.querySelector('canvas').getBoundingClientRect();
          return {x:c.left+r.x+r.w/2,y:c.top+r.y+r.h/2};}""",key)
        page.mouse.click(pos['x'],pos['y'])
    def state():return page.evaluate("()=>({s:game.getSession(),flow:game.getFlow(),metrics:game.getCommerce()})")
    click('start')
    first=page.evaluate("game.getHitRegions().find(x=>x.kind==='tile'&&x.enabled&&x.zone==='board').id")
    click(first);assert len(state()['s']['board']['rack'])==1
    click('undo');click('source-share')
    page.screenshot(path=str(out/'integration-share.png'))
    click('dev-share-return')
    assert len(state()['s']['board']['rack'])==0 and state()['s']['used']['undo']==1
    assert state()['metrics']['shareReturns']==1 and state()['metrics']['observedAdCompletions']==0
    for _ in range(3):
        tile=page.evaluate("""()=>{const s=game.getSession().board;
         const types=new Set(s.rack.map(id=>s.deal.cells[s.byId[id]].type));
         return game.getHitRegions().find(x=>x.kind==='tile'&&x.enabled&&!types.has(s.deal.cells[s.byId[x.tileId]].type)).id;}""")
        click(tile)
    click('move');click('source-share');click('dev-share-return')
    assert len(state()['s']['board']['buffer'])==3 and len(state()['s']['board']['rack'])==0
    click('tile:'+state()['s']['board']['buffer'][0])
    assert state()['metrics']['resumed']>=1
    page.screenshot(path=str(out/'integration-board.png'))
    click('shuffle');click('source-ad');click('dev-ad-cancel')
    assert state()['s']['used']['shuffle']==0
    click('shuffle');click('source-ad');click('dev-earn-fail')
    assert state()['flow']['status']=='RECOVERY_REQUIRED'
    old=state()['flow']['id']
    page.screenshot(path=str(out/'integration-recovery.png'))
    saved=page.evaluate('game.exportDiagnostic()')
    restored=page.evaluate('s=>game.restoreForQA(s)',saved);assert restored['ok']
    click('retry')
    assert state()['flow']['id']==old and state()['s']['used']['shuffle']==1
    assert state()['metrics']['observedAdCompletions']==1
    click('restart')
    click('shuffle');click('source-share')
    old=state()['flow'];click('restart-pending')
    late=page.evaluate("e=>game.providerResultForQA(e)",{'flowId':old['id'],'roundId':old['roundId'],'kind':'share_returned'})
    assert not late['ok'] and state()['s']['used']['shuffle']==0
    receipt=json.loads((root/'examples/deal-270.receipt.json').read_text())
    complete=page.evaluate("""ids=>{for(const id of ids){const r=game.pickForQA(id);if(!r.ok)throw Error(r.code);}
       const b=game.getSession().board;return {status:b.status,cleared:b.cleared,rack:b.rack.length,buffer:b.buffer.length};}""",receipt['witness'])
    assert complete=={'status':'WON','cleared':270,'rack':0,'buffer':0}
    page.screenshot(path=str(out/'integration-complete.png'))
    viewports=[]
    for w,h in [(320,568),(390,844),(430,932),(1024,768)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80)
        click('restart');click('shuffle');click('source-ad');click('dev-earn-fail')
        ok=page.evaluate("""()=>{const b=document.querySelector('canvas').getBoundingClientRect();
        return game.getHitRegions().every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=b.width+.1&&r.y+r.h<=b.height+.1);}""")
        assert ok,(w,h);viewports.append({'width':w,'height':h,'targets_inside':ok})
        if w==320:page.screenshot(path=str(out/'integration-mobile.png'))
        click('retry')
    assert not errors,errors
    report={'environment':'Linux headless Chromium; not WeChat SDK/DevTools or phone',
      'navigation':mode,'actual_pointer_clicks':True,'share_undo_actual_board':True,
      'share_move_buffer_return':True,'ad_cancel_no_charge':True,
      'ad_earned_failure_explicit_restore_retry_same_reward':True,
      'late_old_round_callback_rejected':True,'full_runtime_completion':complete,
      'viewports':viewports,'page_errors':errors}
    (out/'integration-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
