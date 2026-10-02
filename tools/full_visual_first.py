from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,time,shutil,json
root=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node','-e',"require('./services/server').createServer({persist:false}).listen(8770,'127.0.0.1')"],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
 time.sleep(.5)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
  pg=b.new_page(viewport={'width':390,'height':844});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  try:pg.goto('http://127.0.0.1:8770',wait_until='load',timeout=6000);mode='http'
  except Exception as e:
   mode='set_content';pg.set_content((root/'全模块游戏_双击打开.html').read_text(),wait_until='load')
  pg.wait_for_function('window.game && game.getInfo() !== null')
  pg.screenshot(path=str(root/'reports/product/home-first.png'))
  def click(id):
   pos=pg.evaluate("id=>{const r=game.getHitRegions().find(r=>r.id===id);if(!r)throw Error(id);const c=document.querySelector('canvas').getBoundingClientRect();return {x:c.left+r.x+r.w/2,y:c.top+r.y+r.h/2}}",id)
   pg.mouse.click(pos['x'],pos['y']);pg.wait_for_timeout(120)
  click('start');pg.screenshot(path=str(root/'reports/product/tutorial-first.png'))
  print(json.dumps({'mode':mode,'scene':pg.evaluate('game.getScene()'),'state':pg.evaluate('game.getState()?.board.deal.cells.length'),'errors':errors}));b.close()
finally:
 server.terminate();server.wait(timeout=4)
