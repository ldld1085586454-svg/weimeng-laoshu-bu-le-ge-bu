'use strict';
/** Active time with reason-based pausing; no ad duration or wall-clock reward inference. */
function createClock(now=Date.now){let active=false,started=0,total=0,reasons=new Set();
 const flush=()=>{if(active&&reasons.size===0)total+=Math.max(0,now()-started);started=now();};
 return {start(){if(!active){started=now();active=true;}},pause(reason){flush();reasons.add(reason);},
 resume(reason){flush();reasons.delete(reason);},stop(){flush();active=false;},
 elapsed(){return Math.round(total+(active&&reasons.size===0?Math.max(0,now()-started):0));},
 reset(){active=false;total=0;started=now();reasons.clear();},paused:()=>reasons.size>0};
}
module.exports={createClock};
