'use strict';

// Shared pointer capture for Canvas hosts. Hit regions are re-created on draw,
// so semantic IDs, rather than object identity, bind a press to its action.
function createPointerInput({hitTest,activate,onChange=()=>{},enabled=()=>true}){
 let capture=null,pressedId=null,disposed=false;
 const validId=id=>(typeof id==='number'&&Number.isFinite(id))||(typeof id==='string'&&id.length>0);
 const validPoint=(x,y)=>Number.isFinite(x)&&Number.isFinite(y);
 const actionable=region=>region?.enabled===true&&validId(region.id);
 function feedback(id){
  if(pressedId===id)return;
  pressedId=id;
  onChange();
 }
 function reset(){capture=null;feedback(null);}
 function down(x,y,pointerId=0){
  if(disposed||capture||!validId(pointerId)||!validPoint(x,y)||!enabled())return false;
  const region=hitTest(x,y);
  if(!actionable(region))return false;
  capture={pointerId,id:region.id};
  feedback(region.id);
  return true;
 }
 function move(x,y,pointerId=0){
  if(disposed||!capture||pointerId!==capture.pointerId)return false;
  if(!validPoint(x,y)||!enabled()){reset();return false;}
  const region=hitTest(x,y);
  feedback(actionable(region)&&region.id===capture.id?capture.id:null);
  return true;
 }
 function up(x,y,pointerId=0){
  if(disposed||!capture||pointerId!==capture.pointerId)return false;
  const id=capture.id;
  reset();
  if(disposed||!validPoint(x,y)||!enabled())return false;
  const region=hitTest(x,y);
  if(!actionable(region)||region.id!==id)return false;
  const result=activate(id);
  // Event hosts can ignore the return value. Keep the original Promise for
  // callers while preventing an ignored rejection from escaping the host.
  if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});
  return result;
 }
 function cancel(pointerId){
  if(disposed||!capture||(pointerId!==undefined&&pointerId!==capture.pointerId))return false;
  reset();
  return true;
 }
 function dispose(){if(disposed)return;disposed=true;reset();}
 return {down,move,up,cancel,pressed:()=>pressedId,reset,dispose};
}

module.exports={createPointerInput};
