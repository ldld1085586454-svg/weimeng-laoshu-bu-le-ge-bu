'use strict';

const clone=value=>JSON.parse(JSON.stringify(value));
const failure=code=>Object.assign(new Error(code),{code});
const conflict=error=>/^PROGRESS_.*CONFLICT$/.test(error?.code||error?.message||'');
function validProgress(value){
 return !!value&&typeof value==='object'&&typeof value.ticket?.id==='string'&&!!value.ticket.id&&typeof value.log==='string'&&value.log.length>0&&value.log.length<=8*1024*1024&&Number.isSafeInteger(value.elapsedMs)&&value.elapsedMs>=0;
}
function errorCopy(error){return error?Object.assign(new Error(error.message),{code:error.code||error.message}):null;}

// Serializes one account's optimistic cloud writes. Pending snapshots remain in
// memory after a failure; the caller remains responsible for durable local saves.
function createProgressSync(client,{onChange}={}){
 if(!client||typeof client.request!=='function')throw failure('INVALID_PROGRESS_CLIENT');
 let revision=0,confirmed=null,current=null,blocked=null,lastError=null;
 let queue=[],flushWaiters=[],destroyed=false,identityInvalid=false,reloadedConflict=false,needsReload=false;
 let scope=client.scope??null;
 function checkScope(){
  if(destroyed)throw failure('PROGRESS_SYNC_DESTROYED');
  if(identityInvalid)throw failure('IDENTITY_CHANGED');
  const actual=client.scope??null;
  if(scope===null){if(actual!==null)scope=actual;}
  else if(actual!==scope){identityInvalid=true;throw failure('IDENTITY_CHANGED');}
 }
 function projectedProgress(){
  let value=confirmed;
  for(const task of [blocked,current,...queue]){
   if(task?.discarded)continue;
   if(task?.kind==='save')value=task.progress;
   else if(task?.kind==='clear'&&value?.ticket?.id===task.ticketId)value=null;
  }
  return value===null?null:clone(value);
 }
 function getStatus(){
  return {revision,pending:!!(current||blocked||queue.length),error:errorCopy(lastError),progress:projectedProgress()};
 }
 function notify(){if(!destroyed&&typeof onChange==='function')try{onChange(getStatus());}catch(_){/* UI cannot break CAS ordering. */}}
 function taskPromise(task){
  return new Promise((resolve,reject)=>task.waiters.push({resolve,reject}));
 }
 function settleTask(task,error,result){
  if(!task)return;
  for(const waiter of task.waiters.splice(0)){
   if(error)waiter.reject(errorCopy(error));else waiter.resolve(clone(result));
  }
 }
 function settleFlush(error){
  if(!error&&(current||blocked||queue.length))return;
  for(const waiter of flushWaiters.splice(0)){
   if(error)waiter.reject(errorCopy(error));else waiter.resolve(getStatus());
  }
 }
 function poisonIdentity(error){
  identityInvalid=true;lastError=error;
  for(const task of [current,blocked,...queue])settleTask(task,error);
  settleFlush(error);
 }
 function validatedResponse(raw,task){
  let response;
  try{response=clone(raw);}catch(_){throw failure('INVALID_PROGRESS_RESPONSE');}
  if(!response||!Number.isSafeInteger(response.revision)||response.revision<revision||!(response.progress===null||validProgress(response.progress)))throw failure('INVALID_PROGRESS_RESPONSE');
  if(task.kind==='save'&&(response.progress?.ticket.id!==task.ticketId||response.revision<=task.expectedRevision))throw failure('INVALID_PROGRESS_RESPONSE');
  if(task.kind==='clear'&&(response.progress!==null||response.revision<task.expectedRevision))throw failure('INVALID_PROGRESS_RESPONSE');
  return {revision:response.revision,progress:response.progress};
 }
 function pump(){
  if(destroyed||identityInvalid||current)return;
  // An explicit read can inspect a conflict without discarding failed writes.
  const index=blocked||needsReload?queue.findIndex(task=>task.kind==='load'):0;
  if(index<0||queue.length===0){settleFlush(blocked?lastError:null);return;}
  const task=queue.splice(index,1)[0];current=task;
  if(task.kind!=='load'&&task.expectedRevision===undefined)task.expectedRevision=revision;
  let action,data;
  if(task.kind==='load'){action='progress.get';data={};}
  else if(task.kind==='clear'){action='progress.clear';data={expectedRevision:task.expectedRevision,ticketId:task.ticketId};}
  else {action='progress.put';data={expectedRevision:task.expectedRevision,ticketId:task.ticketId,log:clone(task.progress.log),elapsedMs:task.progress.elapsedMs};}
  Promise.resolve().then(()=>{checkScope();if(task.discarded)return;return client.request(action,data);}).then(raw=>{
   if(destroyed)return;
   checkScope();
   if(task.discarded){current=null;notify();pump();return;}
   const result=validatedResponse(raw,task);
   revision=result.revision;confirmed=result.progress;current=null;
   if(task.kind==='load')needsReload=false;
   if(task.kind==='load'&&blocked&&conflict(lastError))reloadedConflict=true;
   if(!blocked)lastError=null;
   settleTask(task,null,result);notify();pump();
  }).catch(error=>{
   if(destroyed)return;
   if(error.code==='IDENTITY_CHANGED'||identityInvalid){poisonIdentity(failure('IDENTITY_CHANGED'));notify();return;}
   current=null;
   if(task.discarded){notify();pump();return;}
   if(task.kind==='load'){
    settleTask(task,error);
    if(!blocked)lastError=error;
   }else{
    blocked=task;lastError=error;reloadedConflict=false;
    settleTask(task,error);
    for(const queued of queue)if(queued.kind!=='load')settleTask(queued,error);
   }
   settleFlush(error);notify();pump();
  });
 }
 function enqueue(task){
  checkScope();
  const promise=taskPromise(task);
  queue.push(task);notify();pump();return promise;
 }
 function enqueueWrite(task){
  checkScope();
  // A new explicit save after a successful conflict inspection authorizes a
  // fresh CAS baseline. Merely loading or retrying never grants this choice.
  if(blocked&&conflict(lastError)&&reloadedConflict){
   for(const prior of [blocked,...queue])if(prior.kind!=='load')settleTask(prior,lastError);
   queue=queue.filter(prior=>prior.kind==='load');blocked=null;lastError=null;reloadedConflict=false;
  }
  const tail=queue[queue.length-1];
  let target=task;
  if(task.kind==='save'&&tail?.kind==='save'&&tail.ticketId===task.ticketId&&tail.expectedRevision===undefined){
   tail.progress=task.progress;target=tail;
  }else queue.push(task);
  const promise=taskPromise(target);
  if(blocked)settleTask(target,lastError);
  notify();pump();return promise;
 }
 function guarded(action){
  try{return action();}catch(error){
   if(error.code==='IDENTITY_CHANGED'){poisonIdentity(error);notify();}
   return Promise.reject(error);
  }
 }
 function flush(){return guarded(()=>{
  checkScope();
  if(blocked)throw lastError;
  if(!current&&!queue.length){if(lastError)throw lastError;return Promise.resolve(getStatus());}
  return new Promise((resolve,reject)=>flushWaiters.push({resolve,reject}));
 });}
 return {
  load:()=>guarded(()=>enqueue({kind:'load',waiters:[]})),
  save:value=>guarded(()=>{
   checkScope();
   let progress;try{progress=clone(value);}catch(_){throw failure('INVALID_PROGRESS');}
   if(!validProgress(progress))throw failure('INVALID_PROGRESS');
   return enqueueWrite({kind:'save',ticketId:progress.ticket.id,progress,waiters:[]});
  }),
  remove:ticketId=>guarded(()=>{
   checkScope();
   if(typeof ticketId!=='string'||!ticketId)throw failure('INVALID_PROGRESS');
   return enqueueWrite({kind:'clear',ticketId,waiters:[]});
  }),
  // Call only after the caller confirms settlement or explicitly chooses the
  // cloud copy. Keep the transport slot until any old call really finishes;
  // its result must neither resurrect the ticket nor advance our CAS baseline.
  discardPending:ticketId=>guarded(()=>{
   checkScope();
   if(typeof ticketId!=='string'||!ticketId)throw failure('INVALID_PROGRESS');
   const error=failure('PROGRESS_DISCARDED');
   if(current&&(current.ticketId===ticketId||current.kind==='load')){
    current.discarded=true;settleTask(current,error);
   }
   if(blocked?.ticketId===ticketId){settleTask(blocked,error);blocked=null;lastError=null;reloadedConflict=false;}
   queue=queue.filter(task=>{if(task.ticketId!==ticketId)return true;settleTask(task,error);return false;});
   if(confirmed?.ticket.id===ticketId)confirmed=null;
   needsReload=true;notify();pump();return Promise.resolve(getStatus());
  }),
  flush,
  retry:()=>guarded(()=>{
   checkScope();
   if(blocked){queue.unshift(blocked);blocked=null;lastError=null;reloadedConflict=false;notify();pump();}
   return flush();
  }),
  getStatus,
  destroy(){
   if(destroyed)return;
   destroyed=true;
   const error=failure('PROGRESS_SYNC_DESTROYED');
   for(const task of [current,blocked,...queue])settleTask(task,error);
   settleFlush(error);
  }
 };
}
module.exports={createProgressSync};
