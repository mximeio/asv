(function(){
'use strict';
const NCOLS=24;
const MAJOR={0:"8h",2:"10h",4:"12h",6:"14h",8:"16h",10:"18h",12:"20h",14:"22h",16:"00h",18:"2h",20:"4h",22:"6h"};
function bLabel(k){const h=(8+k)%24;return h===0?"00h":h+"h";}
function bLabelDay(k){const h=(8+k)%24;const hh=h===0?"00h":h+"h";return hh+(k<=15?" (dim.)":" (lun.)");}

const PALETTE=[
  {name:'Vert',        bg:'#2E7D5B', fg:'#ffffff'},
  {name:'Violet',      bg:'#6B4E8E', fg:'#ffffff'},
  {name:'Ambre',       bg:'#E5A547', fg:'#4a3206'},
  {name:'Bleu',        bg:'#064969', fg:'#ffffff'},
  {name:'Rouge',       bg:'#c90c0f', fg:'#ffffff'},
  {name:'Ardoise',     bg:'#4A5568', fg:'#ffffff'},
  {name:'Nuit',        bg:'#2D2D3E', fg:'#ffffff'},
  {name:'Bleu clair',  bg:'#2F6E9E', fg:'#ffffff'},
  {name:'Lavande',     bg:'#7E63A6', fg:'#ffffff'},
  {name:'Vert clair',  bg:'#3E8E6A', fg:'#ffffff'},
  {name:'Gris',        bg:'#8A8F99', fg:'#ffffff'},
];
// Ordre d'affichage des pastilles, regroupé par famille de couleur
// (les index restent inchangés : les couleurs déjà attribuées ne bougent pas)
const SWATCH_ORDER=[3,7, 0,9, 1,8, 2, 4, 5,6,10];
function norm(s){return (s||"").trim().toUpperCase();}
const KNOWN_DEFAULT={'HOSPIT':0,'ACCUEIL':1,'ACC':1,'AIDE VETO':2,'AIDE':2,'POLYVALENT':3,'POLY':3};
// Postes configurables (nom + couleur). Synchronisés avec le planning partagé.
const DEFAULT_POSTS=[
  {name:'HOSPIT',              color:0},
  {name:'ACCUEIL + AIDE VETO', color:8},
  {name:'ACCUEIL',             color:1},
  {name:'AIDE VETO',           color:2},
  {name:'POLYVALENT',          color:3},
];
function getPosts(){
  if(!state.posts || !Array.isArray(state.posts)) state.posts=structuredClone(DEFAULT_POSTS);
  return state.posts;
}
function hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function postColor(name){
  const k=norm(name); if(!k) return null;
  const list=(state.posts&&Array.isArray(state.posts))?state.posts:DEFAULT_POSTS;
  for(const p of list){ if(norm(p.name)===k && Number.isInteger(p.color)) return p.color; }
  return null;
}
function colorIdx(seg){
  const pc=postColor(seg.post);
  if(pc!==null) return pc;
  if(Number.isInteger(seg.color)&&seg.color>=0&&seg.color<PALETTE.length) return seg.color;
  const k=norm(seg.post);
  if(k in KNOWN_DEFAULT) return KNOWN_DEFAULT[k];
  return k?hashStr(k)%PALETTE.length:10;
}
const KORDER={'HOSPIT':0,'ACCUEIL':1,'ACC':1,'AIDE VETO':2,'AIDE':2,'POLYVALENT':3,'POLY':3};
function orderIndex(post){const k=norm(post);return (k in KORDER)?KORDER[k]:100;}

const DEFAULT={
  date:"",
  asvs:[
    {name:"",segs:[{post:"HOSPIT",s:0,e:8,note:"",color:0}]},
    {name:"",segs:[{post:"ACCUEIL",s:0,e:2,note:"",color:1},{post:"AIDE VETO",s:0,e:2,note:"",color:2},{post:"ACCUEIL",s:2,e:4,note:"",color:1},{post:"AIDE VETO",s:4,e:8,note:"",color:2}]},
    {name:"",segs:[{post:"POLYVALENT",s:2,e:8,note:"AIDE → HOSPIT → ACCUEIL",color:3}]},
    {name:"",segs:[{post:"AIDE VETO",s:4,e:8,note:"",color:2},{post:"ACCUEIL",s:8,e:12,note:"",color:1},{post:"AIDE VETO",s:8,e:12,note:"",color:2}]},
    {name:"",segs:[{post:"POLYVALENT",s:8,e:14,note:"AIDE → HOSPIT → ACCUEIL",color:3}]},
    {name:"",segs:[{post:"HOSPIT",s:12,e:14,note:"",color:0},{post:"HOSPIT",s:14,e:16,note:"si ASVS / POLY si ∅ ASVS",color:0},{post:"POLYVALENT",s:16,e:20,note:"",color:3}]},
  ]
};

const EMPTY={
  date:"",
  asvs:[
    {name:"",segs:[]},{name:"",segs:[]},{name:"",segs:[]},
    {name:"",segs:[]},{name:"",segs:[]},{name:"",segs:[]},
  ]
};

const KEY="asv_weekend_v1";
const SEED={"date": "", "posts": [{"color": 3, "name": "HOSPIT"}, {"color": 7, "name": "ACCUEIL + AIDE VETO"}, {"color": 4, "name": "ACCUEIL"}, {"name": "AIDE VETO", "color": 5}, {"name": "POLYVALENT", "color": 10}], "asvs": [{"name": "", "segs": [{"s": 0, "color": 3, "post": "HOSPIT", "note": "", "e": 12}]}, {"name": "", "segs": [{"s": 0, "post": "ACCUEIL + AIDE VETO", "color": 7, "note": "", "e": 4}, {"e": 8, "note": "", "post": "ACCUEIL", "color": 4, "s": 4}, {"s": 8, "color": 5, "post": "AIDE VETO", "e": 12, "note": ""}]}, {"name": "", "segs": [{"s": 2, "color": 10, "post": "POLYVALENT", "note": "AIDE → HOSPIT → ACCUEIL", "e": 14}]}, {"segs": [{"s": 4, "color": 5, "post": "AIDE VETO", "e": 8, "note": ""}, {"color": 4, "post": "ACCUEIL", "e": 12, "note": "", "s": 8}, {"s": 12, "note": "", "e": 16, "post": "ACCUEIL + AIDE VETO", "color": 7}], "name": ""}, {"segs": [{"s": 8, "note": "AIDE → HOSPIT → ACCUEIL", "e": 20, "post": "POLYVALENT", "color": 10}], "name": ""}, {"name": "", "segs": [{"note": "", "e": 16, "post": "HOSPIT", "color": 3, "s": 12}, {"note": "si ASV5", "e": 20, "color": 3, "post": "HOSPIT", "s": 16}, {"e": 20, "note": "si pas d'ASV5", "color": 10, "post": "POLYVALENT", "s": 16}, {"s": 20, "color": 10, "post": "POLYVALENT", "e": 24, "note": ""}]}]};
let state, editMode=false;

const _SA='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICONS={
  print:`<svg ${_SA}><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`,
  edit:`<svg ${_SA}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  check:`<svg ${_SA}><path d="M20 6 9 17l-5-5"/></svg>`,
  download:`<svg ${_SA}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  upload:`<svg ${_SA}><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>`,
  reset:`<svg ${_SA}><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`,
  plus:`<svg ${_SA}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  trash:`<svg ${_SA}><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  x:`<svg ${_SA}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  grip:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
};
function btnHTML(ic,label){return ICONS[ic]+'<span>'+label+'</span>';}

function load(){try{const r=localStorage.getItem(KEY);state=r?JSON.parse(r):structuredClone(EMPTY);}catch(e){state=structuredClone(EMPTY);}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
function save(){
  persist();
  pushCloud(false);
}
function esc(t){return (t||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

function activeAt(asv,h){
  return asv.segs.filter(s=>h>=s.s && h<s.e);
}
function sig(segs){return segs.map(s=>norm(s.post)+'|'+(s.note||'')+'|'+colorIdx(s)).join('##');}

function renderGrid(){
  const g=document.getElementById('planning');
  let html='';
  html+=`<div class="g-head" style="grid-row:1;grid-column:1">ASV</div>`;
  html+=`<div class="g-head" style="grid-row:1;grid-column:2">Prénom</div>`;
  html+=`<div class="g-axis" style="grid-row:1;grid-column:3 / span ${NCOLS}"></div>`;
  Object.keys(MAJOR).forEach(k=>{
    k=+k;
    html+=`<div class="g-tick" style="grid-row:1;grid-column:${3+k}"><span class="hh">${MAJOR[k]}</span></div>`;
  });
  html+=`<div class="g-tick end" style="grid-row:1;grid-column:${2+NCOLS}"><span class="hh">8h</span></div>`;
  state.asvs.forEach((asv,idx)=>{
    const row=idx+2;
    html+=`<div class="g-num" style="grid-row:${row};grid-column:1">${idx+1}</div>`;
    html+=`<div class="g-name" style="grid-row:${row};grid-column:2"><input value="${esc(asv.name||'')}" data-asv="${idx}" class="nameInput"></div>`;
    let band=0;
    while(band<NCOLS){
      const segs=activeAt(asv,band);
      const s=sig(segs);
      let span=1;
      while(band+span<NCOLS && sig(activeAt(asv,band+span))===s) span++;
      const gc=`grid-row:${row};grid-column:${3+band} / span ${span}`;
      if(segs.length===0){
        html+=`<div class="g-empty" style="${gc}"></div>`;
      } else if(segs.length===1){
        const seg=segs[0];const c=PALETTE[colorIdx(seg)];
        const noteHtml=seg.note?`<span class="note">${esc(seg.note)}</span>`:'';
        html+=`<div class="g-seg" style="${gc};background:${c.bg};color:${c.fg}">${esc(seg.post)}${noteHtml}</div>`;
      } else {
        const inner=segs.map(seg=>{
          const c=PALETTE[colorIdx(seg)];
          const note=seg.note?`<span class="hn">${esc(seg.note)}</span>`:'';
          return `<div class="half" style="background:${c.bg};color:${c.fg}">${esc(seg.post)}${note}</div>`;
        }).join('');
        html+=`<div class="g-split" style="${gc}">${inner}</div>`;
      }
      band+=span;
    }
  });
  g.innerHTML=html;
  g.querySelectorAll('.nameInput').forEach(inp=>{
    inp.addEventListener('input',e=>{state.asvs[+e.target.dataset.asv].name=e.target.value;save();});
  });
}

function optList(sel,opts){return opts.map(o=>`<option value="${o.v}" ${o.v==sel?'selected':''}>${o.t}</option>`).join('');}
function startOpts(sel){let a=[];for(let k=0;k<NCOLS;k++)a.push({v:k,t:bLabelDay(k)});return optList(sel,a);}
function endOpts(sel){let a=[];for(let k=1;k<=NCOLS;k++)a.push({v:k,t:bLabelDay(k)});return optList(sel,a);}
function swatchesHTML(cur){return SWATCH_ORDER.map(i=>{const p=PALETTE[i];return `<button type="button" class="sw${i===cur?' active':''}" data-ci="${i}" style="background:${p.bg}" title="${p.name}"></button>`;}).join('');}

function renderEditor(){
  const list=document.getElementById('editorList');
  list.innerHTML='';
  state.asvs.forEach((asv,idx)=>{
    const box=document.createElement('div');
    box.className='asv-edit';
    box.dataset.ai=idx;
    box.innerHTML=`
      <div class="asv-edit-head">
        <span class="tag">${idx+1}</span>
        <input class="nm" placeholder="Prénom" value="${esc(asv.name||'')}" data-asv="${idx}">
        <button class="btn danger mini" data-del-asv="${idx}">${ICONS.trash}<span>Supprimer cet ASV</span></button>
      </div>
      ${asv.segs.map((s,si)=>segRow(idx,si,s)).join('')}
      <div class="row-actions"><button class="btn mini" data-add-seg="${idx}">${ICONS.plus}<span>Ajouter un créneau / poste</span></button></div>`;
    list.appendChild(box);
  });
  bindEditor();
}

function postSelectHTML(cur){
  const curN=norm(cur);
  let found=false;
  let opts='<option value="">— Choisir un poste —</option>';
  getPosts().forEach(p=>{
    if(!p.name) return;
    const sel=(norm(p.name)===curN)?'selected':'';
    if(sel) found=true;
    opts+=`<option value="${esc(p.name)}" ${sel}>${esc(p.name)}</option>`;
  });
  if(cur && !found){ opts+=`<option value="${esc(cur)}" selected>${esc(cur)} (hors liste)</option>`; }
  return opts;
}
function segRow(ai,si,s){
  return `<div class="seg-row" data-ai="${ai}" data-si="${si}">
    <span class="drag" draggable="true" title="Glisser pour déplacer ce poste vers un autre ASV">${ICONS.grip}</span>
    <span class="lbl">Poste</span><select class="post-sel" data-f="post">${postSelectHTML(s.post)}</select>
    <span class="lbl">De</span><select data-f="s">${startOpts(s.s)}</select>
    <span class="lbl">À</span><select data-f="e">${endOpts(s.e)}</select>
    <input class="note-in" data-f="note" placeholder="Précision (ex. rotation, si ASV5…)" value="${esc(s.note||'')}">
    <button class="btn danger mini" data-del-seg="1" title="Supprimer ce créneau">${ICONS.x}</button>
  </div>`;
}

function bindEditor(){
  document.querySelectorAll('.asv-edit-head input.nm').forEach(inp=>{
    inp.addEventListener('input',e=>{state.asvs[+e.target.dataset.asv].name=e.target.value;save();renderGrid();});
  });
  document.querySelectorAll('[data-del-asv]').forEach(b=>{
    b.addEventListener('click',e=>{const i=+e.currentTarget.dataset.delAsv;
      if(confirm("Supprimer l'ASV "+(i+1)+" ?")){state.asvs.splice(i,1);save();renderAll();}});
  });
  document.querySelectorAll('[data-add-seg]').forEach(b=>{
    b.addEventListener('click',e=>{const i=+e.currentTarget.dataset.addSeg;
      state.asvs[i].segs.push({post:'',s:0,e:2,note:'',color:0});save();renderAll();});
  });
  document.querySelectorAll('.seg-row').forEach(row=>{
    const ai=+row.dataset.ai, si=+row.dataset.si;
    row.querySelectorAll('[data-f]').forEach(ctrl=>{
      ctrl.addEventListener('change',()=>updateSeg(ai,si,row));
      if(ctrl.dataset.f==='note') ctrl.addEventListener('input',()=>updateSeg(ai,si,row));
    });
    row.querySelector('[data-del-seg]').addEventListener('click',()=>{state.asvs[ai].segs.splice(si,1);save();renderAll();});
  });
  // Glisser-déposer : réordonner dans un ASV, ou déplacer vers un autre ASV
  let dragSrc=null;
  function clearMarks(){
    document.querySelectorAll('.asv-edit.drop-target').forEach(x=>x.classList.remove('drop-target'));
    document.querySelectorAll('.seg-row.drop-before,.seg-row.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
  }
  function srcFrom(e){
    if(dragSrc) return dragSrc;
    const d=(e.dataTransfer.getData('text/plain')||'').split(':');
    return {ai:+d[0],si:+d[1]};
  }
  function moveSeg(srcAi,srcSi,tgtAi,tgtIndex){
    if(isNaN(srcAi)||isNaN(srcSi))return;
    const seg=state.asvs[srcAi].segs[srcSi];
    if(!seg)return;
    state.asvs[srcAi].segs.splice(srcSi,1);
    let idx=tgtIndex;
    if(srcAi===tgtAi && srcSi<tgtIndex) idx--;
    idx=Math.max(0,Math.min(idx,state.asvs[tgtAi].segs.length));
    state.asvs[tgtAi].segs.splice(idx,0,seg);
    save();renderAll();
  }
  document.querySelectorAll('.seg-row .drag').forEach(h=>{
    h.addEventListener('dragstart',e=>{
      const row=h.closest('.seg-row');
      dragSrc={ai:+row.dataset.ai,si:+row.dataset.si};
      try{e.dataTransfer.setData('text/plain',dragSrc.ai+':'+dragSrc.si);}catch(_){}
      e.dataTransfer.effectAllowed='move';
      setTimeout(()=>row.classList.add('dragging'),0);
    });
    h.addEventListener('dragend',()=>{
      document.querySelectorAll('.seg-row.dragging').forEach(r=>r.classList.remove('dragging'));
      clearMarks();dragSrc=null;
    });
  });
  document.querySelectorAll('.seg-row').forEach(row=>{
    row.addEventListener('dragover',e=>{
      if(!dragSrc)return;
      e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
      clearMarks();
      const r=row.getBoundingClientRect();
      const after=(e.clientY-r.top)>r.height/2;
      row.classList.add(after?'drop-after':'drop-before');
    });
    row.addEventListener('drop',e=>{
      e.preventDefault();e.stopPropagation();
      const r=row.getBoundingClientRect();
      const after=(e.clientY-r.top)>r.height/2;
      const src=srcFrom(e);
      clearMarks();
      moveSeg(src.ai,src.si,+row.dataset.ai,+row.dataset.si+(after?1:0));
    });
  });
  document.querySelectorAll('.asv-edit').forEach(box=>{
    box.addEventListener('dragover',e=>{
      if(!dragSrc)return;
      e.preventDefault();e.dataTransfer.dropEffect='move';box.classList.add('drop-target');
    });
    box.addEventListener('dragleave',e=>{ if(!box.contains(e.relatedTarget)) box.classList.remove('drop-target'); });
    box.addEventListener('drop',e=>{
      e.preventDefault();box.classList.remove('drop-target');
      const src=srcFrom(e);const tgtAi=+box.dataset.ai;
      moveSeg(src.ai,src.si,tgtAi,state.asvs[tgtAi].segs.length);
    });
  });
}

function updateSeg(ai,si,row){
  const seg=state.asvs[ai].segs[si];
  seg.post=row.querySelector('[data-f="post"]').value;
  const pc=postColor(seg.post); if(pc!==null) seg.color=pc; // couleur issue de la configuration du poste
  let s=+row.querySelector('[data-f="s"]').value;
  let e=+row.querySelector('[data-f="e"]').value;
  if(e<=s){e=s+1;row.querySelector('[data-f="e"]').value=e;}
  seg.s=s;seg.e=e;
  seg.note=row.querySelector('[data-f="note"]').value;
  save();renderGrid();
}

function renderAll(){renderGrid();if(editMode)renderEditor();}

function exportJSON(){
  const payload={version:5,type:"planning-asv",exportedAt:new Date().toISOString(),data:state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10);
  a.href=url;a.download='planning-asv-'+stamp+'.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  setSync('synced');
}
function isValidState(d){return d && Array.isArray(d.asvs) && d.asvs.every(a=>a && typeof a.name==='string' && Array.isArray(a.segs));}
function importJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(reader.result);
      const d=parsed && parsed.data ? parsed.data : parsed;
      if(!isValidState(d)){alert("Fichier JSON non reconnu : il ne contient pas un planning valide.");return;}
      state=d;persist();renderAll();
      pushCloud(true);
      alert("Planning importé avec succès.");
    }catch(err){alert("Impossible de lire ce fichier JSON.");}
  };
  reader.readAsText(file);
}

load();
renderAll();

/* ---- Synchronisation Firestore (compat, projet partagé) ---- */
/* ---- Menu kebab du module weekend ---- */
const wkMenuBtn=document.getElementById('wkMenuBtn');
const wkMenu=document.getElementById('wkMenu');
function openActionsMenu(){ if(wkMenu){wkMenu.hidden=false;} if(wkMenuBtn){wkMenuBtn.setAttribute('aria-expanded','true');} }
function closeActionsMenu(){ if(wkMenu){wkMenu.hidden=true;} if(wkMenuBtn){wkMenuBtn.setAttribute('aria-expanded','false');} }
if(wkMenuBtn && wkMenu){
  wkMenuBtn.addEventListener('click',e=>{ e.stopPropagation(); if(wkMenu.hidden)openActionsMenu(); else closeActionsMenu(); });
  document.addEventListener('click',e=>{ if(!wkMenu.hidden && !e.target.closest('#wkMenuWrap')) closeActionsMenu(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !wkMenu.hidden){ closeActionsMenu(); wkMenuBtn.focus(); } });
  // tout clic sur un élément du menu referme le menu
  wkMenu.addEventListener('click',e=>{ if(e.target.closest('.actions-item')) closeActionsMenu(); });
}
const wkLogout=document.getElementById('wkLogout');
if(wkLogout) wkLogout.addEventListener('click',()=>{ if(!confirm('Se déconnecter ?'))return; try{ firebase.auth().signOut(); }catch(_){} });
function wkSetUser(){ const u=firebase.auth().currentUser; const el=document.getElementById('wkMenuUser'); if(u && el){ el.textContent=u.email||'—'; el.title=u.email||''; } }
let cloud={active:false,db:null,ref:null,unsub:null,subscribed:false,writeTimer:null,pendingRemote:null};
function setSync(kind){
  const el=document.getElementById('saveState'); if(!el)return;
  if(kind==='offline'){el.className='save-state dirty no-print';el.innerHTML='<span class="dot"></span>Hors ligne — reconnexion…';el.style.display='';}
  else {el.innerHTML='';el.style.display='none';}
}
function isEditingField(){
  const a=document.activeElement;
  return !!(a&&(a.tagName==='INPUT'||a.tagName==='SELECT')&&a.closest&&a.closest('#module-weekend'));
}
function applyRemote(remote){ if(isEditingField()){cloud.pendingRemote=remote;return;} state=remote;persist();renderAll(); }
document.addEventListener('focusout',()=>{ setTimeout(()=>{
  if(cloud.pendingRemote&&!isEditingField()){const r=cloud.pendingRemote;cloud.pendingRemote=null;state=r;persist();renderAll();setSync('synced');}
},60); });
function pushCloud(immediate){
  if(!cloud.active||!cloud.ref)return;
  const doWrite=()=>{ setSync('saving');
    cloud.ref.set({data:state,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
      .then(()=>setSync('synced')).catch(err=>{console.error('Écriture cloud échouée',err);setSync('offline');}); };
  clearTimeout(cloud.writeTimer);
  if(immediate){doWrite();} else {cloud.writeTimer=setTimeout(doWrite,600);}
}
function subscribeCloud(){
  cloud.unsub=cloud.ref.onSnapshot(snap=>{
    if(snap.metadata.hasPendingWrites)return;
    if(!snap.exists){ state=structuredClone(SEED); persist(); renderAll(); pushCloud(true); setSync('synced'); return; }
    const remote=snap.data()&&snap.data().data;
    if(!isValidState(remote)){ setSync('synced'); return; }
    if(JSON.stringify(remote)===JSON.stringify(state)){ setSync('synced'); return; }
    applyRemote(remote); setSync('synced');
  },err=>{ console.error('Abonnement cloud',err); setSync('offline'); });
}
function startCloud(){
  try{
    cloud.db=firebase.firestore();
    cloud.ref=cloud.db.collection('plannings').doc('dimanche');
    cloud.active=true;
    wkSetUser();
    if(!cloud.subscribed){ cloud.subscribed=true; subscribeCloud(); }
  }catch(err){ console.error('Init weekend cloud échouée',err); cloud.active=false; setSync('offline'); }
}
window.__ASV_startWeekend=startCloud;

/* ---- Configuration des postes ---- */
function postRowHTML(p,i){
  return `<div class="post-cfg-row" data-pi="${i}">
    <input class="pname" data-pi="${i}" placeholder="Nom du poste" autocomplete="off" value="${esc(p.name||'')}">
    <span class="swatches">${swatchesHTML(Number.isInteger(p.color)?p.color:0)}</span>
    <button class="btn danger mini" data-del-post="${i}" title="Supprimer ce poste">${ICONS.x}</button>
  </div>`;
}
function renderPostsList(){
  const list=document.getElementById('postsList');
  list.innerHTML=getPosts().map((p,i)=>postRowHTML(p,i)).join('');
  list.querySelectorAll('.post-cfg-row').forEach(row=>{
    const i=+row.dataset.pi;
    const nameInput=row.querySelector('.pname');
    nameInput.addEventListener('focus',()=>{ nameInput._old=getPosts()[i].name||''; });
    nameInput.addEventListener('input',()=>{ getPosts()[i].name=nameInput.value; save(); });
    nameInput.addEventListener('change',()=>{
      const oldName=nameInput._old||'', newName=nameInput.value;
      if(norm(oldName) && norm(oldName)!==norm(newName)){
        state.asvs.forEach(a=>a.segs.forEach(s=>{ if(norm(s.post)===norm(oldName)) s.post=newName; }));
        save();
      }
      nameInput._old=newName;
      renderAll();
    });
    row.querySelectorAll('.sw').forEach(sw=>{
      sw.addEventListener('click',()=>{
        const ci=+sw.dataset.ci; getPosts()[i].color=ci; save(); renderAll();
        row.querySelectorAll('.sw').forEach(x=>x.classList.toggle('active',+x.dataset.ci===ci));
      });
    });
    row.querySelector('[data-del-post]').addEventListener('click',()=>{ const nom=(getPosts()[i].name||'').trim(); if(!confirm(`Supprimer le poste${nom?' « '+nom+' »':''} ?`))return; getPosts().splice(i,1); save(); renderPostsList(); renderAll(); });
  });
}
function openPostsModal(){ renderPostsList(); document.getElementById('postsModal').style.display='flex'; }
function closePostsModal(){ document.getElementById('postsModal').style.display='none'; }

document.getElementById('btnPosts').addEventListener('click',()=>{ closeActionsMenu(); openPostsModal(); });
document.getElementById('postsAdd').addEventListener('click',()=>{ getPosts().push({name:'',color:0}); save(); renderPostsList(); });
document.getElementById('postsCloseX').addEventListener('click',closePostsModal);
document.getElementById('postsModal').addEventListener('click',e=>{ if(e.target.id==='postsModal') closePostsModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && document.getElementById('postsModal').style.display==='flex') closePostsModal(); });
function setEditMode(on){
  editMode=on;
  document.getElementById('editor').style.display=on?'block':'none';
  const tg=document.getElementById('editToggle');
  tg.classList.toggle('primary',on);
  tg.innerHTML=on?btnHTML('check',"Terminer"):btnHTML('edit','Éditer');
  if(on)renderEditor();
}
document.getElementById('editToggle').addEventListener('click',()=>setEditMode(!editMode));
document.getElementById('addAsvBtn').addEventListener('click',()=>{
  state.asvs.push({name:'',segs:[{post:'',s:0,e:2,note:'',color:0}]});save();renderAll();
});
document.getElementById('importFile').addEventListener('change',e=>{
  if(e.target.files&&e.target.files[0]) importJSON(e.target.files[0]);
  e.target.value='';
});

document.getElementById('printBtn').innerHTML=btnHTML('print','Imprimer / PDF');
document.getElementById('editToggle').innerHTML=btnHTML('edit','Éditer');
document.getElementById('addAsvBtn').innerHTML=btnHTML('plus','Ajouter un ASV');
document.getElementById('editDoneBottom').innerHTML=btnHTML('check',"Terminer");
document.getElementById('editDoneBottom').addEventListener('click',()=>{ setEditMode(false); window.scrollTo({top:0,behavior:'smooth'}); });
document.getElementById('postsAdd').innerHTML=btnHTML('plus','Ajouter un poste');

/* ---- Boutons du module weekend ---- */
document.getElementById('wkExport').innerHTML=btnHTML('download','Exporter en JSON');
document.getElementById('wkImport').innerHTML=btnHTML('upload','Importer en JSON');
document.getElementById('btnPosts').innerHTML=btnHTML('edit','Configurer les postes');
document.getElementById('wkExport').addEventListener('click',exportJSON);
document.getElementById('wkImport').addEventListener('click',()=>document.getElementById('importFile').click());

})();

/* ============ Contrôleur de modules ASV + routage URL (onglets par classe) ============ */
(function(){
  const modD=document.getElementById('module-decompte');
  const modW=document.getElementById('module-weekend');
  let weekendStarted=false;
  let access={decompte:true,weekend:false};
  let suppressHash=false; // évite la boucle quand on écrit nous-mêmes l'URL

  function navBtns(target){
    const sel='.asv-nav button[data-target'+(target?'="'+target+'"':'')+']';
    return document.querySelectorAll(sel);
  }
  function setActiveTabs(mod){
    navBtns().forEach(b=>b.classList.toggle('active', b.getAttribute('data-target')===mod));
  }
  function setHash(h){
    if(location.hash===h) return;
    suppressHash=true; location.hash=h; setTimeout(()=>{ suppressHash=false; },0);
  }

  // Le décompte conserve sa propre logique d'ouverture (année/mois par défaut).
  function activate(mod, skipHash){
    const wk=(mod==='weekend');
    modW.hidden=!wk; modD.hidden=wk;
    setActiveTabs(mod);
    // Retirer l'infobulle du graphique (sinon elle « fond » un instant ou étire la page au changement d'onglet ; le graphique la recrée au prochain survol)
    const tt=document.body.querySelector('div.chart-tooltip');
    if(tt) tt.remove();
    if(wk && !weekendStarted && window.__ASV_startWeekend){ weekendStarted=true; window.__ASV_startWeekend(); }
    if(!skipHash) setHash(wk ? '#/planning' : '#/decompte');
  }

  // Clic sur un onglet (dans n'importe quel en-tête de module)
  document.addEventListener('click',(e)=>{
    const b=e.target.closest('.asv-nav button[data-target]');
    if(b) activate(b.getAttribute('data-target'));
  });

  function moduleFromHash(){
    return (location.hash||'').replace(/^#\/?/,'').split('/')[0];
  }
  function applyHash(){
    if(suppressHash) return;
    const m=moduleFromHash();
    if(m==='planning' && access.weekend) activate('weekend', true);
    else if(m==='decompte' && access.decompte) activate('decompte', true);
  }
  window.addEventListener('hashchange', applyHash);

  function applyAccess(){
    navBtns('weekend').forEach(b=>{ b.style.display=access.weekend?'':'none'; });
    navBtns('decompte').forEach(b=>{ b.style.display=access.decompte?'':'none'; });
    const count=(access.weekend?1:0)+(access.decompte?1:0);
    document.querySelectorAll('.asv-nav').forEach(n=>{ n.hidden = count<2; }); // une seule appli → pas d'onglets
  }

  auth.onAuthStateChanged(async (user)=>{
    if(!user) return;
    access={decompte:true,weekend:false}; // weekend cloisonné : fermé par défaut
    try{
      const snap=await db.collection('access').doc(user.uid).get();
      const d=snap.exists?snap.data():null;
      if(d){ access={decompte:d.decompte!==false, weekend:d.weekend===true}; }
    }catch(e){ /* défaut : décompte seul */ }
    applyAccess();

    // Si l'URL pointe vers un module autorisé, on l'honore ; sinon module par défaut
    const m=moduleFromHash();
    if(m==='planning' && access.weekend) activate('weekend');
    else if(m==='decompte' && access.decompte) activate('decompte');
    else activate(access.decompte ? 'decompte' : 'weekend');
  });
})();
