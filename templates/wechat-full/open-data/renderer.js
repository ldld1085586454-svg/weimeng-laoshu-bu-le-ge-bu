'use strict';
/** Friend data is read and rendered only in this isolated domain. No user list leaves it. */
function installOpenData(wx){const canvas=wx.getSharedCanvas(),ctx=canvas.getContext('2d');let generation=0,visible=false;
 function text(value,x,y,size=18,color='#304630'){ctx.fillStyle=color;ctx.font=size+'px sans-serif';ctx.textAlign='left';ctx.fillText(String(value),x,y);}
 function clear(){ctx.clearRect(0,0,canvas.width,canvas.height);}
 function onMessage(m){if(m?.type==='HIDE_FRIENDS'){generation++;visible=false;clear();return;}
  if(m?.type!=='SHOW_FRIENDS'||!Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<1||m.width>4096||m.height<1||m.height>4096)return;
  visible=true;const seq=++generation;canvas.width=m.width;canvas.height=m.height;clear();const scale=Math.max(1,canvas.width/320);text('微信好友 · 开发成绩',10*scale,25*scale,14*scale);
  if(typeof wx.getFriendCloudStorage!=='function'){text('好友数据不可用',10*scale,70*scale,16*scale);return;}
  wx.getFriendCloudStorage({keyList:['sheep_dev_today','sheep_dev_history'],success:r=>{if(!visible||seq!==generation)return;clear();text('微信好友 · 开发成绩',10*scale,24*scale,14*scale);
   const list=(Array.isArray(r.data)?r.data:[]).map(u=>{let today={},history={};for(const item of u.KVDataList||[])try{if(item.key==='sheep_dev_today')today=JSON.parse(item.value);if(item.key==='sheep_dev_history')history=JSON.parse(item.value);}catch(e){}
    return {name:String(u.nickname||'微信用户').slice(0,20),wins:Math.max(0,Number(history.wins)||0),win:today.day===m.day&&today.win===true,failures:today.day===m.day?Math.max(0,Number(today.failures)||0):0};});
   list.sort((a,b)=>m.history?b.wins-a.wins:Number(b.win)-Number(a.win)||b.failures-a.failures);
   const rows=Math.max(1,Math.floor((canvas.height/scale-40)/58)),page=Math.max(0,Math.min(999,Number(m.page)||0)),subset=list.slice(page*rows,(page+1)*rows);
   if(!subset.length)text('暂无好友成绩',10*scale,80*scale,16*scale);
   subset.forEach((u,i)=>{const y=(63+i*58)*scale;text((page*rows+i+1)+'. '+u.name,10*scale,y,17*scale);text(m.history?'累计 '+u.wins+' 天':u.win?'今日已通关':'今日失败 '+u.failures+' 次',14*scale,y+22*scale,12*scale,'#697c56');});
  },fail:()=>{if(visible&&seq===generation){clear();text('好友数据读取失败，请稍后重试',10*scale,70*scale,14*scale);}}});
 }
 wx.onMessage(onMessage);return {destroy(){generation++;visible=false;clear();}};
}
if(typeof wx!=='undefined'&&typeof wx.getSharedCanvas==='function')installOpenData(wx);
module.exports={installOpenData};
