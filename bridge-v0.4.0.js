import './index.js';
import {
  getCtx, getState, save, normalizeArray, uniqueStrings, simpleHash,
  ensureRelevantCharacterBases, buildCharacterMemoryContext, applyCharacterUpdates,
  rebuildCurrentCharacter, currentMemoryStatus, exposeMemoryApi,
} from './memory-v0.4.0.js';

const PROMPT_KEY = 'lingyu_jade_story_bridge';
const BRIDGE_VER = '0.4.0';
const MAX_RECENT_MESSAGES = 8;
const MAX_INJECTION_CHARS = 1800;

const BRIDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scene: { type:'object', additionalProperties:false, properties:{ location:{type:'string'}, time:{type:'string'} }, required:['location','time'] },
    facts: { type:'array', maxItems:8, items:{
      type:'object', additionalProperties:false,
      properties:{ text:{type:'string'}, known_by:{type:'array',items:{type:'string'},maxItems:8}, visibility:{type:'string',enum:['public','shared','user_private']}, importance:{type:'integer',minimum:1,maximum:3} },
      required:['text','known_by','visibility','importance'],
    } },
    character_updates: { type:'array', maxItems:6, items:{
      type:'object', additionalProperties:false,
      properties:{
        name:{type:'string'}, current_state:{type:'string'}, current_goal:{type:'string'}, location:{type:'string'},
        known_facts:{type:'array',items:{type:'string'},maxItems:6}, relationship_deltas:{type:'array',items:{type:'string'},maxItems:4}, recent_events:{type:'array',items:{type:'string'},maxItems:5},
      },
      required:['name','current_state','current_goal','location','known_facts','relationship_deltas','recent_events'],
    } },
    side_effects: { type:'array', maxItems:2, items:{
      type:'object', additionalProperties:true,
      properties:{ type:{type:'string',enum:['notice','message','feed']}, text:{type:'string'}, from:{type:'string'}, author:{type:'string'}, image:{type:'string'}, known_by:{type:'array',items:{type:'string'},maxItems:8} },
      required:['type','text','known_by'],
    } },
  },
  required:['scene','facts','character_updates','side_effects'],
};

if (!window.__LINGYU_STORY_BRIDGE_V040__) {
  window.__LINGYU_STORY_BRIDGE_V040__ = true;
  boot();
}

function notify(text, type='info') {
  const t=globalThis.toastr; if(t&&typeof t[type]==='function')t[type](text); else console.log(`[lingyu_bridge] ${text}`);
}
function normalizeKnownBy(v){ return normalizeArray(v).map(x=>String(x||'').trim()).filter(Boolean).slice(0,8); }
function parseJsonLike(v){
  if(v&&typeof v==='object')return v;
  const raw=String(v||'').replace(/^\uFEFF/,'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```(?:json)?/gi,'').replace(/```/g,'').trim();
  const a=raw.indexOf('{'),b=raw.lastIndexOf('}'); const s=a>=0&&b>a?raw.slice(a,b+1):raw;
  return JSON.parse(s.replace(/[“”]/g,'"').replace(/,\s*([}\]])/g,'$1'));
}
function ensureBridgeState(){
  const s=getState(); if(!s)return null;
  s.bridge??={}; Object.assign(s.bridge,{ auto:Boolean(s.bridge.auto), busy:Boolean(s.bridge.busy), lastSignature:String(s.bridge.lastSignature||''), lastSyncAt:Number(s.bridge.lastSyncAt||0), lastError:String(s.bridge.lastError||''), facts:Array.isArray(s.bridge.facts)?s.bridge.facts:[], history:Array.isArray(s.bridge.history)?s.bridge.history:[] });
  return s;
}
function recentStory(){
  const c=getCtx(),chat=Array.isArray(c?.chat)?c.chat:[];
  return chat.filter(m=>!m?.is_system&&typeof m?.mes==='string'&&m.mes.trim()).slice(-MAX_RECENT_MESSAGES).map((m,i)=>`${i+1}. ${m.is_user?(c?.name1||'USER'):(m.name||c?.name2||'CHAR')}: ${m.mes.trim()}`).join('\n\n');
}
function storySignature(){
  const c=getCtx(),chat=Array.isArray(c?.chat)?c.chat.filter(m=>!m?.is_system&&m?.mes):[]; const last=chat.at(-1);
  return `${chat.length}:${simpleHash(String(last?.mes||'').slice(-240))}`;
}
function systemPrompt(){
  return `你是世界状态数据提取器，不是正文作者，也不是角色扮演者。你会收到【人物记忆】与【最近剧情】。人物记忆用于防止 OOC；最近剧情决定本轮真正发生的事。\n\n规则：\n1. 长期人物基底不能被单轮表现覆盖；character_updates 只写本轮明确支持的临时状态、目标、位置、已知事实、关系变化、最近事件。\n2. 禁止读取 USER 未外显心理，禁止把旁白知道的信息自动赋予角色。\n3. 手动设定/角色卡基底优先于你的推断；不得把一次性行为反写成永久性格。\n4. 若某人物没有人物基底，且最近剧情不足以支持其口吻，不要擅自让他发强人格化私信或动态；宁可不生成 side_effect。\n5. 私密事实必须标注可知者，没有合理渠道的人不得知道。\n6. side_effects 最多 2 个，必须能由最近剧情自然推出；没有就返回空数组。\n7. location/time 仅在剧情明确变化时填写，否则空字符串。\n8. character_updates 只更新最近剧情中实际出现或被明确影响的人物。\n9. 不续写正文，不解释，不评价。输出必须符合给定 JSON Schema。`;
}
async function requestBridge(story){
  const c=getCtx(); if(typeof c?.generateRaw!=='function')throw new Error('当前酒馆版本没有可用的后台生成接口');
  const mem=buildCharacterMemoryContext();
  const prompt=`${mem?`【人物记忆】\n${mem}\n\n`:''}【最近剧情】\n${story}`;
  return await c.generateRaw({ prompt, systemPrompt:systemPrompt(), responseLength:900, jsonSchema:BRIDGE_SCHEMA });
}

async function syncFromStory({silent=false}={}){
  const s=ensureBridgeState(); if(!s){if(!silent)notify('当前聊天还没有可用的玉简状态。','warning');return;}
  if(s.bridge.busy)return;
  const story=recentStory(); if(!story){if(!silent)notify('还没有正文可以同步。','warning');return;}
  s.bridge.busy=true; s.bridge.lastError=''; refreshUi();
  try{
    await ensureRelevantCharacterBases({silent:true});
    const sig=storySignature();
    if(sig&&sig===s.bridge.lastSignature){if(!silent)notify('剧情桥已经是最新；人物卡缓存也已检查。');return;}
    const parsed=parseJsonLike(await requestBridge(story));
    const result=applyResult(parsed,sig); applyInjection(); save(); refreshUi(true);
    if(!silent){
      notify(`同步完成：${result.factCount} 条事实，${result.characterCount} 个人物状态更新，${result.effectCount} 个世界反应`,'success');
      if(!result.effectCount)setTimeout(()=>notify('本轮没有自然的外部反应，所以没有硬凑新消息。'),120);
    }
  }catch(e){console.error('[lingyu_bridge] sync failed',e);s.bridge.lastError=String(e?.message||e||'unknown error');if(!silent)notify(`剧情同步失败：${s.bridge.lastError}`,'error');}
  finally{s.bridge.busy=false;save();refreshUi();}
}

function applyResult(data,sig){
  const s=ensureBridgeState(); if(!s)return{factCount:0,characterCount:0,effectCount:0};
  const scene=data?.scene||{}; if(scene.location&&s.profile)s.profile.location=String(scene.location).trim(); if(scene.time&&s.profile)s.profile.time=String(scene.time).trim();
  const facts=normalizeArray(data?.facts).map(f=>({ text:String(f?.text||'').trim(), known_by:normalizeKnownBy(f?.known_by), visibility:String(f?.visibility||'shared'), importance:Math.max(1,Math.min(3,Number(f?.importance||1))), source:'story', signature:sig, at:Date.now() })).filter(f=>f.text).slice(0,8);
  const chars=applyCharacterUpdates(data?.character_updates,sig);
  const effects=[]; for(const e of normalizeArray(data?.side_effects).slice(0,2)){const x=applySideEffect(e,s);if(x)effects.push(x);}
  s.bridge.facts=[...normalizeArray(s.bridge.facts),...facts].slice(-24);
  s.bridge.history=[...normalizeArray(s.bridge.history),{at:Date.now(),signature:sig,facts,character_updates:chars,effects}].slice(-6);
  s.bridge.lastSignature=sig;s.bridge.lastSyncAt=Date.now();s.bridge.lastError='';
  return{factCount:facts.length,characterCount:chars.length,effectCount:effects.length};
}
function applySideEffect(e,s){
  const type=String(e?.type||'').trim(),known=normalizeKnownBy(e?.known_by);
  if(type==='notice'){
    const text=String(e?.text||'').trim();if(!text)return null;s.notices??=[];if(!s.notices.includes(text))s.notices.unshift(text);s.notices=s.notices.slice(0,8);return{type,text,known_by:known};
  }
  if(type==='message'){
    const from=String(e?.from||'').trim(),text=String(e?.text||'').trim();if(!from||!text)return null;s.threads??=[];let t=s.threads.find(x=>x.name===from);if(!t){t={id:`bridge_${simpleHash(from)}`,name:from,preview:'',unread:0,messages:[]};s.threads.unshift(t);}t.messages??=[];const last=t.messages.at(-1);if(!(last?.from==='them'&&last?.text===text)){t.messages.push({from:'them',text,time:'刚刚'});t.preview=text;t.unread=Number(t.unread||0)+1;}return{type,from,text,known_by:known.length?known:['USER',from]};
  }
  if(type==='feed'){
    const author=String(e?.author||'').trim(),text=String(e?.text||'').trim(),image=String(e?.image||'').trim();if(!author||(!text&&!image))return null;s.feed??=[];const exists=s.feed.some(x=>x.author===author&&x.text===text&&x.image===image);if(!exists)s.feed.unshift({id:`bridge_feed_${Date.now()}_${simpleHash(author+text)}`,author,role:'世界动态',time:'刚刚',text,image,likes:[],comments:[]});return{type,author,text,image,known_by:known.length?known:['USER','公开']};
  }
  return null;
}

function collectDeviceActions(s){
  const out=[];
  for(const t of normalizeArray(s?.threads)){const m=normalizeArray(t?.messages).filter(x=>x?.from==='me'&&String(x?.text||'').trim()).at(-1);if(m)out.push({text:`USER 已通过设备向“${t.name}”发送：“${String(m.text).trim()}”`,known_by:['USER',String(t.name||'').trim()].filter(Boolean)});}
  const posts=normalizeArray(s?.feed).filter(p=>p?.role==='我的留影'&&String(p?.text||'').trim()).slice(0,2).map(p=>({text:`USER 已发布设备动态：“${String(p.text).trim()}”`,known_by:['USER','动态可见者']}));
  return[...out.slice(-3),...posts];
}
function buildInjectionText(){
  const s=ensureBridgeState();if(!s)return'';const lines=[];
  for(const f of normalizeArray(s.bridge.facts).filter(f=>Number(f?.importance||1)>=2).slice(-8)){const k=normalizeKnownBy(f.known_by);lines.push(`- ${f.text}${k.length?`（可知者：${k.join('、')}）`:''}`);}
  for(const b of normalizeArray(s.bridge.history).slice(-3))for(const e of normalizeArray(b?.effects)){
    if(e.type==='message')lines.push(`- ${e.from} 已通过设备向 USER 发送：“${e.text}”（可知者：${normalizeKnownBy(e.known_by).join('、')||`USER、${e.from}`}）`);
    if(e.type==='notice')lines.push(`- 世界侧变化：${e.text}`);
    if(e.type==='feed')lines.push(`- ${e.author} 已发布动态：“${e.text||e.image}”（可见范围按设备状态处理）`);
  }
  for(const a of collectDeviceActions(s))lines.push(`- ${a.text}（可知者：${a.known_by.join('、')}）`);
  const uniq=[...new Set(lines)].slice(-12);if(!uniq.length)return'';
  return `【世界侧连续性 / 设备状态】\n这些内容是已发生的连续性事实，不要逐条复述，只在自然相关时体现。\n${uniq.join('\n')}\n信息边界：括号中“可知者”之外的角色不得自动获知；USER 的私密设备内容除非被展示、转述、窥见或通过合理渠道获取，否则不能被其他角色知道。`.slice(0,MAX_INJECTION_CHARS);
}
function applyInjection(){const c=getCtx();if(typeof c?.setExtensionPrompt!=='function')return;try{c.setExtensionPrompt(PROMPT_KEY,buildInjectionText(),1,1,false,0);}catch(e){console.warn('[lingyu_bridge] injection',e);}}

function toggleAuto(){const s=ensureBridgeState();if(!s)return;s.bridge.auto=!s.bridge.auto;save();refreshUi();notify(s.bridge.auto?'自动剧情联动已开启：每轮正文后更新世界状态和人物动态。':'自动剧情联动已关闭。',s.bridge.auto?'success':'info');if(s.bridge.auto)void syncFromStory({silent:true});}
async function rebuildMemory(){const b=document.querySelector('#lingyu-jade-app .lingyu-memory-rebuild');b?.classList.add('busy');try{const r=await rebuildCurrentCharacter();if(!r)notify('当前没有可读取的角色卡。','warning');}finally{b?.classList.remove('busy');refreshUi();}}

function injectStyle(){if(document.getElementById('lingyu-bridge-style'))return;const x=document.createElement('style');x.id='lingyu-bridge-style';x.textContent='#lingyu-jade-app .lingyu-bridge-auto.active{color:var(--lingyu-jade)!important;background:rgba(72,104,88,.12)!important}#lingyu-jade-app .lingyu-bridge-sync.busy i,#lingyu-jade-app .lingyu-memory-rebuild.busy i{animation:lingyuBridgeSpin .8s linear infinite}#lingyu-jade-app .lingyu-memory-rebuild.ready{color:var(--lingyu-jade)!important}@keyframes lingyuBridgeSpin{to{transform:rotate(360deg)}}';document.head.appendChild(x);}
function decoratePanel(){
  const a=document.querySelector('#lingyu-jade-app .lingyu-head-actions');if(!a)return;injectStyle();
  if(!a.querySelector('.lingyu-bridge-sync')){const b=document.createElement('button');b.type='button';b.className='lingyu-bridge-sync';b.title='从最近正文同步世界状态';b.innerHTML='<i class="fa-solid fa-link"></i>';b.onclick=e=>{e.preventDefault();e.stopPropagation();void syncFromStory();};a.prepend(b);}
  if(!a.querySelector('.lingyu-bridge-auto')){const b=document.createElement('button');b.type='button';b.className='lingyu-bridge-auto';b.innerHTML='<i class="fa-solid fa-bolt"></i>';b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleAuto();};a.prepend(b);}
  if(!a.querySelector('.lingyu-memory-rebuild')){const b=document.createElement('button');b.type='button';b.className='lingyu-memory-rebuild';b.innerHTML='<i class="fa-solid fa-brain"></i>';b.onclick=e=>{e.preventDefault();e.stopPropagation();void rebuildMemory();};a.prepend(b);}
  refreshUi();
}
function refreshUi(rerender=false){
  const s=ensureBridgeState(),sync=document.querySelector('#lingyu-jade-app .lingyu-bridge-sync'),auto=document.querySelector('#lingyu-jade-app .lingyu-bridge-auto'),mem=document.querySelector('#lingyu-jade-app .lingyu-memory-rebuild');
  sync?.classList.toggle('busy',!!s?.bridge?.busy);sync?.toggleAttribute('disabled',!!s?.bridge?.busy);auto?.classList.toggle('active',!!s?.bridge?.auto);if(auto)auto.title=s?.bridge?.auto?'自动剧情联动：已开启':'自动剧情联动：已关闭';
  if(mem){const status=currentMemoryStatus();mem.title=`${status}；点击重新读取当前角色卡`;mem.classList.toggle('ready',/已建档|手动设定/.test(status));}
  if(rerender){const active=document.querySelector('#lingyu-jade-app [data-tab].active');if(active instanceof HTMLElement)active.click();setTimeout(decoratePanel,0);}
}
function bindDevice(){document.addEventListener('submit',e=>{const x=e.target;if(!(x instanceof HTMLElement))return;if(x.id!=='lingyu-message-form'&&x.id!=='lingyu-feed-form')return;setTimeout(()=>{applyInjection();save();},0);});}
function bindEvents(){
  const c=getCtx(),es=c?.eventSource,et=c?.eventTypes||c?.event_types||{};if(!es)return;
  const rendered=()=>{const s=ensureBridgeState();if(s?.bridge?.auto)setTimeout(()=>void syncFromStory({silent:true}),80);};
  const changed=()=>setTimeout(()=>{applyInjection();refreshUi();void ensureRelevantCharacterBases({silent:true});},250);
  if(et.CHARACTER_MESSAGE_RENDERED){if(typeof es.makeLast==='function')es.makeLast(et.CHARACTER_MESSAGE_RENDERED,rendered);else es.on(et.CHARACTER_MESSAGE_RENDERED,rendered);}if(et.CHAT_CHANGED)es.on(et.CHAT_CHANGED,changed);
}
function watchPanel(){const o=new MutationObserver(()=>decoratePanel());o.observe(document.body,{childList:true,subtree:true});decoratePanel();}
function prime(n=0){if(getState()){void ensureRelevantCharacterBases({silent:true}).finally(refreshUi);return;}if(n<40)setTimeout(()=>prime(n+1),250);}
function boot(){
  const start=()=>{ensureBridgeState();bindDevice();bindEvents();watchPanel();exposeMemoryApi();setTimeout(applyInjection,300);setTimeout(()=>prime(),450);console.log(`[lingyu_bridge] v${BRIDGE_VER} ready`);};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
}
