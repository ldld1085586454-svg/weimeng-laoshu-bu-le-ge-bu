from pathlib import Path
import json, os, shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
report={'environment':'Linux headless Chromium','real_wechat':False,'real_ads':False,'navigation_attempts':[],'checks':[]}
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 html=(root/'商业化流程演示_双击打开.html').read_text()
 try:
  page.goto((root/'商业化流程演示_双击打开.html').as_uri(),wait_until='load',timeout=15000)
  report['navigation_attempts'].append({'method':'file_url','ok':True})
 except Exception as e:
  report['navigation_attempts'].append({'method':'file_url','ok':False,'reason':str(e)[:500]})
  page.close()
  page=browser.new_page(viewport={'width':1100,'height':900},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load')
  report['navigation_attempts'].append({'method':'same_html_set_content','ok':True})
 page.locator('#offer-move').click()
 for a in ['accept','loaded','show','complete','grant-error']:
  page.locator('[data-action="'+a+'"]').click()
 assert page.evaluate('commercialLab.getState().state')=='RECOVERY_REQUIRED'
 assert page.evaluate('commercialLab.getSummary().grants')==0
 report['checks'].append({'name':'earned_then_failed_retains_pending_without_grant','pass':True})
 page.screenshot(path=str(root/'reports/commerce-recovery-desktop.png'),full_page=True)
 page.locator('[data-action="retry-grant"]').click()
 page.locator('[data-action="repeat"]').click()
 assert page.evaluate('commercialLab.getSummary().grants')==1
 assert page.locator('#quota-move').inner_text().endswith('0/1')
 page.locator('[data-action="resume"]').click()
 assert page.evaluate('commercialLab.getSummary().resumed')==1
 assert page.evaluate('commercialLab.getSummary().revenueCny') is None
 report['checks'].append({'name':'retry_once_repeat_idempotent_resume_no_cash','pass':True})
 page.locator('#offer-undo').click()
 for a in ['accept','loaded','show','early-close']:page.locator('[data-action="'+a+'"]').click()
 assert page.locator('#quota-undo').inner_text().endswith('1/1')
 report['checks'].append({'name':'incomplete_does_not_use_allowance','pass':True})
 page.locator('#offer-revive').click()
 assert '未绑定' in page.locator('#notice').inner_text()
 assert page.evaluate('commercialLab.getSummary().offers')==2
 report['checks'].append({'name':'unbound_revive_blocked_before_offer_or_ad','pass':True})
 page.locator('#offer-shuffle').click()
 for a in ['accept','loaded','show','share-return']:page.locator('[data-action="'+a+'"]').click()
 assert page.evaluate('commercialLab.getState().state')=='UNVERIFIED'
 report['checks'].append({'name':'share_return_is_not_ad_completion','pass':True})
 page.locator('[data-tab="finance"]').click()
 assert '¥20.00' in page.locator('#financial-result').inner_text()
 assert '¥35.00' in page.locator('#financial-result').inner_text()
 page.locator('#estimatedNetFen').fill('')
 assert '未提供' in page.locator('#financial-result').inner_text()
 report['checks'].append({'name':'financial_example_net_and_missing_inputs','pass':True})
 page.locator('[data-tab="release"]').click()
 assert page.locator('.gate').count()==12
 report['checks'].append({'name':'all_12_release_gates_visible','pass':True})
 page.locator('[data-tab="flow"]').click()
 for w,h in [(320,568),(390,844),(768,1024),(1100,900)]:
  page.set_viewport_size({'width':w,'height':h})
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  report['checks'].append({'name':f'no_horizontal_overflow_{w}x{h}','pass':True})
  if w==390:page.screenshot(path=str(root/'reports/commerce-mobile.png'),full_page=True)
 assert not errors,errors
 report['page_errors']=errors
 report['final_summary']=page.evaluate('commercialLab.getSummary()')
 browser.close()
report['pass']=all(c['pass'] for c in report['checks'])
(root/'reports/commerce-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
