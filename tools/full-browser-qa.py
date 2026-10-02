"""Development browser QA: real pointer input, with transport limitations recorded."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json,os,shutil,time
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir',default=os.environ.get('SHEEP_BROWSER_REPORT_DIR',str(ROOT/'local_reports/product')))
OUT=Path(parser.parse_args().output_dir).expanduser().resolve();OUT.mkdir(parents=True,exist_ok=True)
report={'version':'0.12','navigation':'set_content (complete self-contained HTML)','checks':[], 'screenshots':[], 'pageErrors':[], 'realWeChatTested':False}
html=(ROOT/'全模块游戏_双击打开.html').read_text()
def check(name,actual=True):
    if not actual: raise AssertionError(name)
    report['checks'].append({'name':name,'ok':True})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 pg=b.new_page(viewport={'width':390,'height':844})
 pg.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 pg.set_content(html,wait_until='load');pg.wait_for_function('window.game && game.getInfo() !== null')
 def shot(name):
    gameBounds=pg.locator('canvas').bounding_box();pg.screenshot(path=str(OUT/(name+'.png')));report['screenshots'].append({'file':name+'.png','canvas':gameBounds})
 def click(id):
    pos=pg.evaluate("id=>{const r=game.getHitRegions().find(r=>r.id===id);if(!r||!r.enabled)throw Error('not actionable:'+id);const c=document.querySelector('canvas').getBoundingClientRect();return {x:c.left+r.x+r.w/2,y:c.top+r.y+r.h/2}}",id)
    pg.mouse.click(pos['x'],pos['y']);pg.wait_for_timeout(28)
 def state():return pg.evaluate('game.getState()')
 def rebind(deal):
    pg.evaluate("async d=>{game.destroy();const cv=document.querySelector('canvas'),r=cv.getBoundingClientRect();window.game=load('ui/product/app').createFullApp(cv,[d],r.width,r.height,1,{motion:false});await game.ready;await game.qa.start('daily');}",deal)
 pg.evaluate('game.qa.settings({reducedMotion:true,sound:false,music:false})')
 shot('01-home')
 for name in ['rank','friends','topic','wardrobe','profile','bullet','club','settings','honor-first','honor-king','honor-fast']:
    click(name);check('home entry '+name,pg.evaluate('game.getModal() !== null'))
    if name in ['rank','friends','topic','wardrobe','settings']:shot('panel-'+name)
    if name=='friends':click('history');check('friend history navigable',pg.evaluate('game.getModal()')=='HISTORY')
    click('close')
 click('bullet');preset=pg.evaluate("game.getHitRegions().find(r=>r.id.startsWith('send-bullet:')).id");click(preset);check('preset bullet persists',len(pg.evaluate('game.getInfo().bullets'))==1)
 shot('02-home-bullet');click('start');shot('03-tutorial')
 for i in range(12):click('tile:teach-'+str(i))
 check('12 real tutorial clicks win',pg.evaluate('game.getModal()')=='TUTORIAL_WIN');click('next-daily');check('tutorial continues to daily',len(state()['board']['deal']['cells'])>=270);shot('04-daily')
 # Pin the approved 270-tile deal in a fresh development service, then use only real pointer inputs.
 deal=json.loads((ROOT/'examples/deal-270.json').read_text());receipt=json.loads((ROOT/'examples/deal-270.receipt.json').read_text())
 rebind(deal);s=state();blocked=next((x for x in pg.evaluate('game.getHitRegions()') if x['kind']=='tile' and not x['enabled']),None)
 check('layered deal has inaccessible covered tiles',blocked is not None)
 click('tile:'+receipt['witness'][0]);s=state()
 pg.evaluate("game.qa.setChannel('share')");click('undo');shot('05-offer-share');click('grant');click('dev-complete');check('share undo affects actual rack',len(state()['board']['rack'])==0 and state()['used']['undo']==1)
 click('tile:'+receipt['witness'][0]);pg.evaluate("game.qa.setChannel('video')");click('shuffle');click('grant');click('dev-cancel');check('early video exit leaves quota and map unchanged',state()['used']['shuffle']==0 and state()['board']['deal']==s['board']['deal'])
 # New run for a deterministic complete real-pointer game (no assist changes).
 rebind(deal);start=time.time()
 for id in receipt['witness']:click('tile:'+id)
 check('270 real pointer picks clear all tiles',state()['board']['status']=='WON' and state()['board']['cleared']==270)
 check('win is validated and added once',pg.evaluate('game.getModal()')=='WIN' and pg.evaluate('game.getInfo().totals.wins')==1)
 report['realPointerWin']={'tiles':270,'seconds':round(time.time()-start,2)};shot('06-win');click('return-home');click('wardrobe');click('equip:cap');check('earned skin can be equipped',pg.evaluate('game.getInfo().profile.skin')=='cap');shot('07-unlocked-wardrobe');click('close')
 # Explicit synthetic fixture exercises all reserve/revive edges visibly, not an original historical map.
 fixture={'schema':'astra-deal-1','dealId':'visual-revive-fixture','layoutId':'open-test','origin':'SYNTHETIC_NOT_HISTORICAL','slotCapacity':7,'cells':[{'id':'t'+str(i),'type':'T'+str(i%10).zfill(2),'zone':'board','z':0,'rect':{'x':(i%10)*100,'y':(i//10)*100,'w':96,'h':96}} for i in range(30)]}
 rebind(fixture)
 for i in range(3):click('tile:t'+str(i))
 click('move');click('grant');click('dev-complete');check('move retains all 3 tiles in reserve',state()['board']['buffer']==['t0','t1','t2'])
 for i in range(3,10):click('tile:t'+str(i))
 check('rack full opens revive prompt',pg.evaluate('game.getModal()')=='REVIVE');shot('08-revive-prompt')
 click('revive');click('grant');click('dev-complete');check('revive preserves old 3 reserve tiles and appends new 3',state()['board']['buffer']==['t0','t1','t2','t3','t4','t5']);shot('09-revive-six-reserve')
 for i in range(6,10):
    for j in [i+10,i+20]:click('tile:t'+str(j))
 for i in range(6):
    for j in [i,i+10,i+20]:click('tile:t'+str(j))
 check('revived fixture can genuinely win',state()['board']['status']=='WON');shot('10-revive-win')
 rebind(fixture);click('tile:t0');click('undo');click('grant');pg.evaluate('game.qa.failEarned()');check('earned failure opens recovery',pg.evaluate('game.getModal()')=='RECOVERY');shot('11-grant-recovery');requests=pg.evaluate('game.getMetrics().videoRequests');click('retry-grant');check('retry applies without new video request',state()['used']['undo']==1 and pg.evaluate('game.getMetrics().videoRequests')==requests)
 rebind(fixture)
 for i in range(7):click('tile:t'+str(i))
 click('revive');click('grant');click('dev-complete')
 for i in range(7,10):click('tile:t'+str(i))
 check('second loss goes to terminal free retry',pg.evaluate('game.getModal()')=='LOSE');shot('12-failure');old=state()['roundId'];click('restart');check('free restart has new ticket and no pending ad',state()['roundId']!=old and state()['pending'] is None and state()['used']['revive']==0)
 before=state();pg.evaluate('game.setVisible(false)');pg.evaluate("game.tap(100,200)");check('background input is blocked',state()==before);pg.evaluate('game.setVisible(true)')
 for viewport in [{'width':320,'height':568},{'width':390,'height':844},{'width':430,'height':932},{'width':1280,'height':900}]:
    pg.set_viewport_size(viewport);pg.wait_for_timeout(120);click('settings');bounds=pg.locator('canvas').bounding_box();regions=pg.evaluate('game.getHitRegions()')
    check('settings bounds '+str(viewport),all(r['x']>=0 and r['y']>=0 and r['x']+r['w']<=bounds['width']+.1 and r['y']+r['h']<=bounds['height']+.1 for r in regions));shot('responsive-'+str(viewport['width']));click('close')
 check('no uncaught browser page errors',not report['pageErrors']);b.close()
report['ok']=True
(OUT/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'ok':True,'checks':len(report['checks']),'screenshots':len(report['screenshots']),'win':report['realPointerWin'],'pageErrors':report['pageErrors']},ensure_ascii=False))
