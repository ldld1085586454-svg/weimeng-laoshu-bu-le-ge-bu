'use strict';
// Main-domain bridge. Friend records stay inside the open data context.
function createPlatform(wx,config={}){
 let club=null;
 const disabled=()=>({ok:false,code:'NATIVE_CAPABILITY_UNAVAILABLE'});
 function friends(info){if(!config.nativeSocial||typeof wx.getOpenDataContext!=='function')return disabled();
  const c=wx.getOpenDataContext();c.postMessage({type:'SHOW_FRIENDS',day:info.day,history:!!info.history,
   width:info.width,height:info.height,page:info.page||0});return {ok:true,canvas:c.canvas};}
 function hideFriends(){if(config.nativeSocial&&typeof wx.getOpenDataContext==='function')wx.getOpenDataContext().postMessage({type:'HIDE_FRIENDS'});}
 function publish(info){if(!config.nativeSocial||typeof wx.setUserCloudStorage!=='function')return Promise.resolve(disabled());
  return new Promise(resolve=>wx.setUserCloudStorage({KVDataList:[
   {key:'sheep_dev_today',value:JSON.stringify({day:info.day,win:info.today.won,failures:info.today.failures})},
   {key:'sheep_dev_history',value:JSON.stringify({wins:info.history.wins})}],
   success:()=>resolve({ok:true}),fail:()=>resolve({ok:false,code:'CLOUD_SCORE_FAILED'})}));}
 function showClub(bounds){if(!config.nativeSocial||typeof wx.createGameClubButton!=='function')return disabled();
  try{if(club)club.destroy();club=wx.createGameClubButton({type:'text',text:'打开游戏圈',style:{left:bounds.x||0,top:bounds.y||0,width:bounds.w||160,height:bounds.h||44,lineHeight:bounds.h||44,backgroundColor:'#81be37',color:'#213019',textAlign:'center',fontSize:16,borderRadius:8}});club.show();return {ok:true};}catch(e){return {ok:false,code:'GAME_CLUB_FAILED'};}}
 function hideClub(){if(club){club.hide();club.destroy();club=null;}}
 return {friends,hideFriends,publish,club:showClub,hideClub,destroy(){hideClub();hideFriends();}};
}
module.exports={createPlatform};
