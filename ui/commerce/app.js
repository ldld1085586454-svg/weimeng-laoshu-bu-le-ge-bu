'use strict';
(function(){
 const M=window.CommerceModel,C=window.COMMERCE_CONFIG,G=window.RELEASE_GATES;
 const $=id=>document.getElementById(id);
 let flows=[],current=null,serial=0,round=1,used={move:0,undo:0,shuffle:0,revive:0},lastEvent=null,notice='选择一个业务触点，逐步检查领取与兑现。';
 const names={move:'移出',undo:'撤回',shuffle:'洗牌',revive:'复活'};
 const states={OFFERED:'等待自愿选择',LOADING:'等待广告加载',READY:'广告已就绪',SHOWING:'展示中（客户端观察）',EARNED_PENDING:'已取得机会，待兑现',RECOVERY_REQUIRED:'兑现待恢复',APPLIED:'道具作用已提交',RESUMED:'已继续操作',FAILED:'广告未成功',CANCELLED:'本次未领取',UNVERIFIED:'结果不能确认'};
 function el(tag,text,cls){const e=document.createElement(tag);if(text!==null)e.textContent=text;if(cls)e.className=cls;return e;}
 function button(text,id,fn,secondary=false){const b=el('button',text,secondary?'secondary':'');b.dataset.action=id;b.addEventListener('click',fn);return b;}
 function choose(kind){
  const pre=M.decideOffer({placement:kind,roundId:'r'+round,boardRevision:5,used:used[kind],effectReady:true,phase:kind==='revive'?'LOST':'PLAYING',mode:'simulation'},C);
  if(!pre.allowed){notice=pre.reason==='EFFECT_UNBOUND'?'复活入口属原作范围，但效果未绑定：在请求广告之前拦截，不模拟一个不存在的救局。':'本局已用完；需要开始新的模拟对局。';render();return;}
  if(current&&!['RESUMED','FAILED','CANCELLED','UNVERIFIED'].includes(current.state)){notice='先处理当前领取。已完成观看的待兑现记录不能直接丢弃。';render();return;}
  current=M.createFlow({id:'f'+(++serial),roundId:'r'+round,placement:kind,boardRevision:5,dayKey:'2026-09-18',configVersion:C.version});flows.push(current);lastEvent=null;notice='这是业务场景模拟，不执行正式牌局，也不播放真实广告。';render();
 }
 function emit(kind,extra={}){
  if(!current)return;
  const before=current.state,e={id:current.id+'-e'+(current.events.length+1),kind,at:1000+current.events.length,...extra};
  try{current=M.advance(current,e).flow;flows[flows.findIndex(f=>f.id===current.id)]=current;lastEvent=e;
   if(before!=='APPLIED'&&current.state==='APPLIED')used[current.placement]++;
   notice=current.state==='RECOVERY_REQUIRED'?'已经完成观看：重试原局兑现，不需要再看一条广告。':'完成证据、道具作用和平台收入分别记录。';
  }catch(err){notice=err.message;}render();
 }
 function repeat(){if(!current||!lastEvent)return;const before=JSON.stringify(current);const r=M.advance(current,lastEvent);notice=r.replayed&&JSON.stringify(r.flow)===before?'重复事件已确认：不再作用、不重复记数。':'状态发生变化，请检查。';render();}
 function render(){
  $('notice').textContent=notice;
  for(const kind of Object.keys(names))$('quota-'+kind).textContent=kind==='revive'?'未绑定':`本模拟局剩余 ${1-used[kind]}/1`;
  const panel=$('flow-panel');panel.replaceChildren();
  if(!current){panel.append(el('h2','先检查一个触点'),el('p','左侧选择移出、撤回或洗牌。复活会在广告之前明确拦截。','muted'));}
  else{
   panel.append(el('div',`${current.id} · ${current.roundId} · ${names[current.placement]}`,'eyebrow'),el('h2',states[current.state]),el('p','此处“成功”都是模拟事件；不等于微信真机、服务端事务或现金结算通过。','muted'));
   const actions=el('div',null,'actions'),add=(title,id,k,extra={},secondary=false)=>actions.append(button(title,id,()=>emit(k,extra),secondary));
   switch(current.state){
    case 'OFFERED':add('观看视频并使用（模拟）','accept','ACCEPT');add('不使用','decline','DECLINE',{},true);break;
    case 'LOADING':add('模拟加载成功','loaded','AD_READY');add('模拟无可用广告','no-ad','AD_FAILED',{reason:'NO_FILL_SIMULATED'},true);add('模拟加载失败','load-error','AD_FAILED',{reason:'NETWORK_SIMULATED'},true);break;
    case 'READY':add('模拟展示成功','show','SHOW');add('模拟展示失败','show-error','AD_FAILED',{},true);break;
    case 'SHOWING':add('模拟完整观看','complete','AD_CLOSE',{isEnded:true});add('提前关闭','early-close','AD_CLOSE',{isEnded:false},true);add('缺少完成标志','unknown','AD_CLOSE',{},true);add('普通分享返回','share-return','SHARE_RETURN',{},true);break;
    case 'EARNED_PENDING':add('模拟作用提交成功','grant','GRANT_COMMITTED',{roundId:current.roundId,beforeRevision:5});add('模拟发奖网络失败','grant-error','GRANT_FAILED',{},true);add('模拟原局已更换','stale-round','GRANT_COMMITTED',{roundId:'other-round',beforeRevision:5},true);break;
    case 'RECOVERY_REQUIRED':add('模拟恢复原局并重试兑现','retry-grant','GRANT_COMMITTED',{roundId:current.roundId,beforeRevision:5});panel.append(el('p','不补到另一局、不要求再看广告。真实恢复与数据库事务仍是后续接入任务。','warning'));break;
    case 'APPLIED':add('模拟返回原局并有效取牌','resume','PLAY_RESUMED',{roundId:current.roundId});break;
    default:panel.append(el('p','可开始另一个业务触点，或开启新的模拟对局。','muted'));
   }
   if(lastEvent)actions.append(button('重放上一回调：检查防重复','repeat',repeat,true));
   panel.append(actions);
  }
  const m=M.summarizeFlows(flows);$('metrics').replaceChildren();
  for(const [key,label] of [['offers','机会'],['optedIn','主动选择'],['clientPresented','展示观察'],['observedComplete','完成证据'],['grants','作用到账'],['resumed','有效继续']]){const a=el('div',null,'metric');a.append(el('strong',String(m[key])),el('span',label));$('metrics').append(a);}
  $('revenue-status').textContent='实际平台收入：未接入，不显示0元或预估盈利';
  $('pending').textContent=`待兑现 ${m.pendingGrants} 笔 · 未核定 ${m.unverified} 笔`;
  const log=$('event-log');log.replaceChildren();
  const events=flows.flatMap(f=>f.events.map(e=>({f:f.id,...e})));
  for(const e of events.slice(-9).reverse()){const row=el('div',null,'log-row');row.append(el('code',e.f+' / '+e.kind),el('span',states[e.toState]||e.toState));log.append(row);}
  if(!events.length)log.append(el('p','暂无模拟事件。','muted'));
 }
 for(const k of Object.keys(names))$('offer-'+k).addEventListener('click',()=>choose(k));
 $('new-round').addEventListener('click',()=>{if(current&&['LOADING','READY','SHOWING','EARNED_PENDING','RECOVERY_REQUIRED','APPLIED'].includes(current.state)){notice='当前流程未结清。先结束或恢复兑现；不能用重开清除待兑现记录。';render();return;}round++;used={move:0,undo:0,shuffle:0,revive:0};current=null;lastEvent=null;notice='已创建新的模拟对局。此前流程仍留在本次演示日志。';render();});
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(p=>p.hidden=p.dataset.view!==b.dataset.tab);document.querySelectorAll('[data-tab]').forEach(p=>p.classList.toggle('active',p===b));}));
 const fields=['platformImpressions','estimatedNetFen','settledNetFen','cashReceivedFen','paidTrafficFen','variableCostFen'];
 function report(){try{const input={currency:'CNY',timezone:'Asia/Shanghai',status:$('coverage').value,sourceReportId:'SIMULATED_MANUAL_INPUT',asOf:'2026-09-18 (DEMO)'};
  for(const k of fields){const t=$(k).value.trim();if(t==='')input[k]=null;else{if(!/^\d+(\.\d{1,2})?$/.test(t))throw Error('金额最多两位小数；留空表示缺少数据。');const v=Number(t);input[k]=k==='platformImpressions'?v:Math.round(v*100);}}
  const r=M.reconcile(input),out=$('financial-result');out.replaceChildren();
  for(const [k,l] of [['ecpmNetCny','净eCPM（演算）'],['estimatedNetCny','预估净收入'],['settledContributionCny','结算口径贡献'],['cashReceivedCny','实际到账输入']]){const a=el('div',null,'metric');a.append(el('strong',r[k]===null?'未提供':'¥'+r[k].toFixed(2)),el('span',l));out.append(a);}
  $('financial-note').textContent='以上全部为手工假设输入，不是本项目收入。已结算贡献不包含未输入的固定成本/税费；现金不与收入相加。数据状态：'+(r.status==='partial'?'未完整':'示例完整');
 }catch(e){$('financial-note').textContent=e.message;}}
 for(const k of fields)$(k).addEventListener('input',report);$('coverage').addEventListener('change',report);
 const gates=$('gates');for(const g of G){const a=el('div',null,'gate');a.append(el('strong',g.id),el('span',g.requirement),el('small','待真实验收'));gates.append(a);}
 $('export').addEventListener('click',()=>{const data={mode:'SIMULATION_ONLY',flows,summary:M.summarizeFlows(flows),config:C,actualPlatformRevenue:null};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='commercial-simulation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 window.commercialLab={choose,emit,getState:()=>current,getSummary:()=>M.summarizeFlows(flows)};
 render();report();
})();
