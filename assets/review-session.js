// Portable offline edits. Imports are fully validated before any state changes.
const originalImages = new Map(data.shots.map(s => [s.key, {image:s.exportImage, name:s.exportSourceName}]));
const sessionTools = el('div', undefined, 'toolbar');
document.querySelector('header nav').after(sessionTools);
const importFile = el('input');
importFile.type='file'; importFile.accept='.json,application/json'; importFile.id='review-import';
sessionTools.append(field('恢复会话 / 合并笔记', importFile));
function reviewEntries() {
  return data.shots.filter(s=>notes.get(s.key)?.trim()).map(s=>({key:s.key,shotId:s.id,episode:s.episode,segment:s.segment,note:notes.get(s.key)}));
}
function sessionState() {
  return {entries:reviewEntries(),images:data.shots.filter(s=>s.exportImage!==originalImages.get(s.key).image).map(s=>({key:s.key,image:s.exportImage,name:s.exportSourceName||''}))};
}
let savedState=JSON.stringify(sessionState());
function hasUnsavedReview(){return savedState!==JSON.stringify(sessionState());}
button('review-save','保存编辑会话',()=>{
  try {
    const state=sessionState();
    if(!data.shots.length)throw Error('当前没有镜头，无需保存编辑会话。');
    if(state.entries.some(entry=>entry.note.length>100000))throw Error('单条笔记不能超过 100000 字符，请拆分或缩短后保存。');
    if(state.images.reduce((sum,item)=>sum+item.image.length*0.75,0)>96*1024*1024)throw Error('替换图片总计超过 96 MB，请按片段生成报告。');
    const payload={schemaVersion:'1.0',type:'storyboard-review-session',reviewIdentity:data.reviewIdentity,title:data.title,...state,view:{segment:segmentSelect.value,shot:singleSelect.value,columns:layoutSelect.value}};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    if(blob.size>140*1024*1024)throw Error('会话超过 140 MB，请按片段生成报告后保存。');
    downloadBlob(blob,'storyboard-review-session.json');
    savedState=JSON.stringify(state);localImageChanges=false;
    $('message').textContent='已下载编辑会话，包含笔记与替换图片。重新打开这份报告后可恢复；验收勾选不会保存。';
  } catch(e){$('message').textContent=e.message;}
},sessionTools);
$('export').onclick=()=>{
  const entries=reviewEntries();
  downloadBlob(new Blob([JSON.stringify({schemaVersion:'1.0',type:'storyboard-review-notes',reviewIdentity:data.reviewIdentity,title:data.title,createdAt:new Date().toISOString(),entries},null,2)],{type:'application/json'}),'storyboard-review-notes.json');
  $('message').textContent=`已导出 ${entries.length} 条笔记。要保存替换图片，请保存编辑会话。`;
};
let importPending=false;
importFile.onchange=async()=>{
  const file=importFile.files?.[0];importFile.value='';if(!file||importPending)return;
  importPending=true;importFile.disabled=true;
  const before=JSON.stringify(sessionState()), revision=sheetRevision;
  try {
    if(file.size>140*1024*1024)throw Error('文件超过 140 MB。');
    const value=JSON.parse(await file.text());
    const full=value?.type==='storyboard-review-session';
    if(!value||value.schemaVersion!=='1.0'||(!full&&value.type!=='storyboard-review-notes'))throw Error('不支持的会话或笔记格式。');
    if(value.reviewIdentity ? value.reviewIdentity!==data.reviewIdentity : full||value.title!==data.title)throw Error('文件与当前分镜快照不匹配，请打开原报告后恢复。');
    const shots=new Map(data.shots.map(s=>[s.key,s]));
    const incoming=new Map();
    if(!Array.isArray(value.entries)||value.entries.length>shots.size)throw Error('笔记列表无效。');
    for(const entry of value.entries){
      const shot=shots.get(entry?.key);
      if(!shot||incoming.has(entry.key)||entry.shotId!==shot.id||entry.episode!==shot.episode||entry.segment!==shot.segment||typeof entry.note!=='string'||entry.note.length>100000)throw Error('笔记包含未知镜头、重复项或无效内容。');
      if(!full&&notes.get(entry.key)?.trim()&&notes.get(entry.key)!==entry.note)throw Error(`镜头 ${shot.id} 的笔记有冲突，请先保存当前会话；未导入任何笔记。`);
      incoming.set(entry.key,entry.note);
    }
    const replacements=new Map();
    if(full){
      if(hasUnsavedReview())throw Error('当前有未保存编辑，请先保存编辑会话再恢复。');
      if(!Array.isArray(value.images)||value.images.length>shots.size)throw Error('替换图片列表无效。');
      let total=0;
      for(const item of value.images){
        if(!shots.has(item?.key)||replacements.has(item.key)||typeof item.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.image)||typeof item.name!=='string'||item.name.length>1024)throw Error('替换图片格式或镜头无效。');
        const bytes=item.image.length*0.75;total+=bytes;
        if(bytes>30*1024*1024+100||total>96*1024*1024)throw Error('替换图片超过单张 30 MB 或总计 96 MB 的限制。');
        if(!await loadPanel({exportImage:item.image}))throw Error('替换图片无法解码；未恢复任何编辑。');
        replacements.set(item.key,item);
      }
      if(!value.view||!groups.has(value.view.segment)||!['0','1','2','3','4'].includes(value.view.columns)||!/^\d+$/.test(value.view.shot)||Number(value.view.shot)>=groups.get(value.view.segment).length)throw Error('会话的片段或布局无效。');
    }
    if(before!==JSON.stringify(sessionState())||revision!==sheetRevision)throw Error('读取期间页面发生编辑，请重新导入。');
    if(full){
      notes.clear();
      for(const shot of data.shots){const item=replacements.get(shot.key),original=originalImages.get(shot.key);shot.exportImage=item?item.image:original.image;shot.exportSourceName=item?item.name:original.name;}
      segmentSelect.value=value.view.segment;layoutSelect.value=value.view.columns;
    }
    for(const [key,note] of incoming)notes.set(key,note);
    changeSheet();if(full)singleSelect.value=value.view.shot;
    updateEditor();render();
    if(full){savedState=JSON.stringify(sessionState());localImageChanges=false;}
    $('message').textContent=full?'已恢复会话、笔记和替换图片，请重新逐格验收。':`已合并 ${incoming.size} 条笔记${value.reviewIdentity?'':'（旧版文件，仅核对标题和镜头标识）'}。`;
  } catch(e){$('message').textContent=`导入失败：${e.message}`;}
  finally{importPending=false;importFile.disabled=false;}
};
window.addEventListener('beforeunload',e=>{if(hasUnsavedReview()){e.preventDefault();e.returnValue='';}});
