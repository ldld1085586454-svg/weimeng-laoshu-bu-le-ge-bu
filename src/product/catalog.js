'use strict';
const POLICY=Object.freeze({version:'development-reconstruction-012',target:'2022-09-wechat',productionEnabled:false,
 cycleOffsetMinutes:480,tutorial:'first-local-launch',dailyDedupe:'user-cycle-mode',revive:'research-revive-append-three-v011',
 art:'new-development-vector-art',rewardRoute:'video',shareEvidence:'return-only-not-send-confirmation'});
const REGIONS=['广东','浙江','江苏','山东','四川','河南','河北','湖南','湖北','福建','安徽','上海','北京','重庆','江西','广西','云南','辽宁','山西','陕西','贵州','黑龙江','吉林','内蒙古','甘肃','新疆','天津','海南','宁夏','青海','西藏','台湾','香港','澳门'];
const SKINS=[{id:'plain',name:'小白羊',requirement:'初始形象'},{id:'cap',name:'小草帽',requirement:'完成一次每日挑战'},{id:'scarf',name:'围巾羊',requirement:'昨日话题阵营获胜'}];
const BULLETS=[{id:'cheer',text:'加油！'},{id:'again',text:'再试一次'},{id:'hard',text:'今天太难了'},{id:'done',text:'终于过关了'},{id:'team',text:'为羊队加油'},{id:'easy',text:'今天太简单'}];
function cycle(ms,offset=POLICY.cycleOffsetMinutes){return new Date(ms+offset*60000).toISOString().slice(0,10);}
function nextReset(ms){const d=cycle(ms);return Date.parse(d+'T00:00:00Z')+86400000-POLICY.cycleOffsetMinutes*60000;}
function tutorial(){return {schema:'astra-deal-1',dealId:'tutorial-reconstruction-012',layoutId:'tutorial-flat',origin:'SYNTHETIC_NOT_HISTORICAL',slotCapacity:7,
 cells:['T00','T00','T00','T01','T01','T01','T02','T02','T02','T03','T03','T03'].map((type,i)=>({id:'teach-'+i,type,zone:'board',z:0,rect:{x:i%3*110,y:Math.floor(i/3)*110,w:96,h:96}}))};}
module.exports={POLICY,REGIONS,SKINS,BULLETS,cycle,nextReset,tutorial};
