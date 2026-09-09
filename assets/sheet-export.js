// Offline PNG export. Source pixels are embedded so file:// never taints canvas.
const sheetBox = el('section', undefined, 'card');
sheetBox.id = 'sheet-export';
sheetBox.append(el('h2', '01 / 选择片段，看画面顺序'));
sheetBox.append(el('p', '从左到右、从上到下阅读。点任意一格，在下方检查拍摄要求、记录问题或替换本地图片。图片存在不代表内容已验收。','muted'));
const sheetControls = el('div', undefined, 'toolbar');
const segmentSelect = el('select'); segmentSelect.id = 'sheet-segment'; segmentSelect.setAttribute('aria-label', '故事板片段');
const groups = new Map();
for (const s of data.shots) { const key = `${s.episode}/${s.segment}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
for (const [key, group] of groups) { const o = el('option', `E${group[0].episode} / ${group[0].segment} · ${group.length} 格`); o.value = key; segmentSelect.append(o); }
const layoutSelect = el('select'); layoutSelect.id = 'sheet-columns'; layoutSelect.setAttribute('aria-label','每行格数');
for (const value of [0, 1, 2, 3, 4]) { const o = el('option', value ? `${value} 列` : '自动布局'); o.value = value; layoutSelect.append(o); }
const singleSelect = el('select'); singleSelect.id = 'sheet-single'; singleSelect.setAttribute('aria-label', '单格镜号');
function field(label,control){const n=el('label',label+' ');n.append(control);return n;}
sheetControls.append(field('当前片段',segmentSelect), field('每行格数',layoutSelect));
const panelGrid=el('div');panelGrid.id='sheet-grid';
const editor=el('section');editor.id='sheet-editor';editor.append(el('h2','02 / 检查选中的这一格'));
const editorControls=el('div',undefined,'toolbar');editorControls.append(field('当前镜头',singleSelect));
const uploadLabel=el('label','换成已准备好的图片（PNG / JPEG / WebP）：');
const upload=el('input');upload.type='file';upload.id='sheet-upload';upload.accept='image/png,image/jpeg,image/webp';uploadLabel.append(upload);
const shotSpec=el('details');shotSpec.id='sheet-spec';shotSpec.append(el('summary','展开拍摄要求：动作、景别、运镜与连续性'));const specBody=el('div',undefined,'detail');shotSpec.append(specBody);
const shotNote=el('textarea',undefined,'note');shotNote.id='sheet-note';shotNote.setAttribute('aria-label','当前镜头返工笔记');shotNote.placeholder='例如：第 2 格应是手机内容插入镜头，现在却是人物正脸。';
editor.append(editorControls,el('p','对照图片检查：内容是否对上剧情？姿态、左右手和视线是否连续？手机等关键信息是否看得清？','muted'),shotSpec,field('有问题就记在这里（不会自动修图）',shotNote),uploadLabel,el('small','换图只影响本页故事板导出，不覆盖项目源图或任务参考。关闭前请在顶部保存编辑会话，以便恢复图片和返工笔记。'));
const exportArea=el('section');exportArea.id='sheet-downloads';exportArea.append(el('h2','03 / 按用途下载'));
const exportControls=el('div',undefined,'toolbar');
const checkLabel = el('label'); const reviewCheck = el('input'); reviewCheck.type = 'checkbox'; reviewCheck.id = 'sheet-reviewed';
checkLabel.append(reviewCheck, document.createTextNode(' 我已逐格检查内容、姿态、手别、轴线、文字和信息可读性，确认这段可作为视频参考'));
const sheetStatus = el('p'); sheetStatus.id = 'sheet-status'; sheetStatus.setAttribute('role','status');
const sheetPreview = el('div'); sheetPreview.id = 'sheet-preview';
const outputPreview=el('details');outputPreview.id='sheet-output-preview';outputPreview.append(el('summary','查看最近一次导出的实际排版'),sheetPreview);
const advanced=el('details');advanced.id='sheet-advanced';advanced.append(el('summary','高级：下载镜头映射（对接 H3 提示词时使用）'),el('p','映射 JSON 记录每格对应的镜号与时间，不是视频提示词，也不会自动绑定到任务。'));
const previewStyle = el('style'); previewStyle.textContent = '[hidden]{display:none!important}button[aria-pressed=true]{background:var(--blue);color:white}#sheet-export{margin:0}#sheet-grid{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:14px;margin:18px 0 28px}.sheet-panel{padding:0;text-align:left;overflow:hidden;border:2px solid var(--line);background:white}.sheet-panel[aria-pressed=true]{border-color:var(--blue);background:#e8f0f7;color:var(--ink)}.sheet-panel img{max-height:none;aspect-ratio:var(--aspect);object-fit:contain;background:#192633}.sheet-panel span{display:block;padding:8px 12px;overflow-wrap:anywhere}.sheet-panel small{display:block;font-weight:normal}#sheet-editor,#sheet-downloads{border-top:1px solid var(--line);padding-top:24px;margin-top:24px}#sheet-export label{display:block}#sheet-export input[type=file]{display:block;width:100%;max-width:650px;margin:8px 0}#sheet-spec{margin:12px 0}#sheet-status{padding:12px;background:#e8f0f7;overflow-wrap:anywhere}#sheet-preview{max-height:600px;overflow:auto;background:#dce5ec}#sheet-preview canvas{display:block;width:100%;height:auto}#sheet-export select{max-width:100%}#sheet-export details{margin-top:14px}#sheet-export summary{cursor:pointer}#sheet-export .primary{background:var(--blue);color:white}@media(max-width:600px){#sheet-grid{grid-template-columns:1fr}#sheet-export{padding:14px}.toolbar>*{max-width:100%}header input{max-width:100%}}';
exportArea.append(el('p','给自己或合作者检查，下载「审阅图」；准备给视频模型参考，检查完再下载「视频参考图」。下载不会提交生成任务。','muted'),checkLabel,exportControls,el('small','视频参考图不新增文字，但不会清除源图已有的文字。用于 Ref2VA 分镜参考，不要把整张多格图当作视频首帧；它也不能替代人物、场景身份参考。'),advanced,outputPreview);
sheetBox.append(sheetControls,panelGrid,editor,exportArea,sheetStatus,previewStyle);
document.querySelector('header').append(sheetBox);
let sheetRevision = 0;
let localImageChanges=false;

function switchView(details){stop();$('detail-tools').hidden=!details;$('cards').hidden=!details;sheetBox.hidden=details;$('view-board').setAttribute('aria-pressed',String(!details));$('view-details').setAttribute('aria-pressed',String(details));if(details)render();else updateEditor();}
$('view-board').onclick=()=>switchView(false);$('view-details').onclick=()=>switchView(true);
function selectedShots() { return groups.get(segmentSelect.value) || []; }
function updateEditor(){const s=selectedShots()[Number(singleSelect.value)];panelGrid.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===Number(singleSelect.value))));specBody.textContent=s?`镜号：${s.id} · ${s.start}–${s.start+s.duration}s\n景别：${text(s.size)}\n画面 / 动作：${text(s.action)}\n运镜：${text(s.camera)}\n连续性：${text(s.continuity)}`:'当前没有镜头';shotNote.value=s?notes.get(s.key)||'':'';}
shotNote.oninput=()=>{const s=selectedShots()[Number(singleSelect.value)];if(s)notes.set(s.key,shotNote.value);};
singleSelect.onchange=updateEditor;
function drawPanelGrid(){const shots=selectedShots();panelGrid.replaceChildren();panelGrid.style.setProperty('--cols',Math.min(Number(layoutSelect.value)||(shots.length<=4?2:3),shots.length)||1);panelGrid.style.setProperty('--aspect',data.aspect.replace(':',' / '));shots.forEach((s,i)=>{const b=el('button',undefined,'sheet-panel');b.setAttribute('aria-label',`检查第 ${i+1} 格 ${s.id}`);if(s.exportImage){const img=el('img');img.src=s.exportImage;img.alt=`第 ${i+1} 格 ${s.id} 规划图`;img.onerror=()=>img.replaceWith(el('div','图片无法解码，请替换','placeholder'));b.append(img);}else b.append(el('div','缺少图片 · 点此选择并替换','placeholder'));const label=el('span',`${String(i+1).padStart(2,'0')} / ${s.id}`);label.append(el('small',`${s.start.toFixed(1)}–${(s.start+s.duration).toFixed(1)} 秒 · ${s.size||'景别未填'} · 点击检查`));b.append(label);b.onclick=()=>{singleSelect.value=i;updateEditor();editor.scrollIntoView({block:'start',behavior:'auto'});singleSelect.focus({preventScroll:true});};panelGrid.append(b);});updateEditor();}
upload.onchange=()=>{
  const file=upload.files?.[0],shot=selectedShots()[Number(singleSelect.value)];if(!file||!shot)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>30*1024*1024){sheetStatus.textContent='请选择不超过 30 MB 的 PNG、JPEG 或 WebP';return;}
  const revision=sheetRevision,reader=new FileReader();
  reader.onload=async()=>{if(revision!==sheetRevision)return;const candidate={exportImage:reader.result};const img=await loadPanel(candidate);if(revision!==sheetRevision)return;if(!img){sheetStatus.textContent='图片无法解码，原图未替换。';return;}shot.exportImage=reader.result;shot.exportSourceName=file.name;localImageChanges=true;sheetRevision++;reviewCheck.checked=false;sheetPreview.replaceChildren();drawPanelGrid();sheetStatus.textContent=`已替换 ${shot.id}；上方多格图已更新。仅影响本页导出，源文件未修改，请重新检查。`;};
  reader.onerror=()=>{sheetStatus.textContent='图片读取失败';};reader.readAsDataURL(file);upload.value='';
};
function fileStem() { return ('E' + selectedShots()[0]?.episode + '-' + selectedShots()[0]?.segment).replace(/[^\w.-]/g,'_'); }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
function canvasBlob(canvas) { return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG 编码失败')),'image/png')); }
function loadPanel(s) { return new Promise(resolve=>{ if (!s.exportImage) return resolve(null); const img = new Image(); img.onload=()=>resolve(img); img.onerror=()=>resolve(null); img.src=s.exportImage; }); }
function wrap(ctx, value, width) {
  const lines=[]; let line='';
  for(const c of text(value)) { if(c==='\n'){lines.push(line);line='';continue;} if(line && ctx.measureText(line+c).width>width){lines.push(line);line=c;}else line+=c; }
  lines.push(line); return lines;
}
function drawContain(ctx,img,x,y,w,h) { ctx.fillStyle='#192633';ctx.fillRect(x,y,w,h); const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight); const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih); }
async function makeSheet(mode) {
  const shots=selectedShots(); if(!shots.length) throw Error('当前没有可导出的镜头');
  if(shots.length>24) throw Error('每张最多 24 格，请拆分分镜段');
  const images=await Promise.all(shots.map(loadPanel));
  const missing=shots.filter((s,i)=>!images[i]);
  if(mode==='model' && (missing.length || !reviewCheck.checked)) throw Error(missing.length ? `缺少或无法解码规划图：${missing.map(s=>s.id).join('、')}。模型参考版不允许缺图。` : '请先检查各格，并勾选验收确认');
  const columns=Number(layoutSelect.value)|| (shots.length===1?1:shots.length<=4?2:3);
  const cols=Math.min(columns,shots.length), rows=Math.ceil(shots.length/cols);
  const ratio=data.aspect.split(':').map(Number);if(ratio.length!==2||!ratio.every(v=>Number.isFinite(v)&&v>0))throw Error('画幅无效');
  const pw=640,ph=Math.round(pw*ratio[1]/ratio[0]),gap=mode==='review'?24:8,margin=mode==='review'?32:0,header=mode==='review'?104:0;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font='18px "Microsoft YaHei", sans-serif';
  const captions=shots.map(s=>[`${s.id}  |  ${s.start.toFixed(2)}–${(s.start+s.duration).toFixed(2)}s  |  ${s.size||'未填景别'}`,`动作：${text(s.action)}`,`运镜：${text(s.camera)}`].flatMap(v=>wrap(ctx,v,pw-24)));
  const rowHeights=Array.from({length:rows},(_,r)=>ph+(mode==='review'?Math.max(...captions.slice(r*cols,(r+1)*cols).map(c=>c.length))*26+28:0));
  const width=margin*2+cols*pw+(cols-1)*gap,height=header+margin+rowHeights.reduce((a,b)=>a+b,0)+(rows-1)*gap;
  if(width>8192||height>16384||width*height>32000000)throw Error('导出尺寸过大，请增加列数或拆分片段');
  canvas.width=width;canvas.height=height;
  ctx.fillStyle=mode==='review'?'#edf2f6':'#192633';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(mode==='review'){ctx.fillStyle='#203344';ctx.font='bold 28px "Microsoft YaHei", sans-serif';ctx.fillText(`${shots[0].segment} / ${shots.length} 镜 / ${shots.reduce((n,s)=>n+s.duration,0).toFixed(2)}s`,margin,42);ctx.font='18px "Microsoft YaHei", sans-serif';ctx.fillText('导演审阅版 · 阅读顺序：从左到右，从上到下 · 非整张首帧',margin,76);}
  let y=header;
  const mapping=[];
  for(let r=0;r<rows;r++){for(let c=0;c<cols;c++){const i=r*cols+c;if(i>=shots.length)break;const x=margin+c*(pw+gap),s=shots[i];
    if(images[i])drawContain(ctx,images[i],x,y,pw,ph);else {ctx.fillStyle='#d5dfe7';ctx.fillRect(x,y,pw,ph);ctx.fillStyle='#536a7b';ctx.font='22px sans-serif';ctx.fillText(`缺少规划图：${s.id}`,x+20,y+ph/2,pw-40);}
    if(mode==='review'){ctx.fillStyle='#fff';ctx.fillRect(x,y+ph,pw,rowHeights[r]-ph);ctx.fillStyle='#203344';ctx.font='18px "Microsoft YaHei", sans-serif';captions[i].forEach((line,k)=>ctx.fillText(line,x+12,y+ph+24+k*26));}
    mapping.push({panel:i+1,row:r+1,column:c+1,shotId:s.id,start:s.start,end:s.start+s.duration,sourceName:s.exportSourceName||null,rectangle:{x,y,width:pw,height:ph},missing:!images[i]});
  }y+=rowHeights[r]+gap;}
  return {canvas,mapping,missing:missing.length};
}
async function executeSheet(mode,download=true){stop();const revision=sheetRevision,name=`${fileStem()}-${mode}.png`;sheetStatus.textContent='正在本地排版…';try{const result=await makeSheet(mode);if(revision!==sheetRevision)return;const blob=download?await canvasBlob(result.canvas):null;if(revision!==sheetRevision)return;sheetPreview.replaceChildren(result.canvas);if(blob)downloadBlob(blob,name);sheetStatus.textContent=`${mode==='review'?'审阅版':'模型参考版'}：${result.canvas.width} × ${result.canvas.height}，缺图 ${result.missing} 格。${download?'已导出 PNG。':''}`;}catch(e){if(revision===sheetRevision)sheetStatus.textContent=e.message;}}
reviewCheck.onchange=()=>{sheetRevision++;};
function button(id,label,fn,parent=exportControls){const b=el('button',label);b.id=id;b.onclick=fn;parent.append(b);return b;}
button('sheet-preview-button','预览审阅图排版',()=>{outputPreview.open=true;executeSheet('review',false);},outputPreview);
button('sheet-review','下载审阅图 · 给人看',()=>executeSheet('review')).classList.add('primary');
button('sheet-model','下载视频参考图 · 给模型',()=>executeSheet('model'));
button('sheet-single-export','下载选中这一格',async()=>{try{const revision=sheetRevision,name=fileStem()+'-panel-'+(Number(singleSelect.value)+1)+'.png';const shot=selectedShots()[Number(singleSelect.value)];if(!shot)throw Error('请选择单格');const img=await loadPanel(shot);if(!img)throw Error('该镜头缺少可读取的规划图');if(img.naturalWidth*img.naturalHeight>32000000)throw Error('单格源图过大');const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);const blob=await canvasBlob(c);if(revision!==sheetRevision)return;downloadBlob(blob,name);sheetStatus.textContent='已导出源图分辨率的单格 PNG。';}catch(e){sheetStatus.textContent=e.message;}},editorControls);
button('sheet-map','下载参考映射 JSON',async()=>{const revision=sheetRevision;try{const {canvas,mapping}=await makeSheet('model');if(revision!==sheetRevision)return;downloadBlob(new Blob([JSON.stringify({schemaVersion:'1.0',kind:'storyboard-sheet-reference',episode:selectedShots()[0].episode,segment:selectedShots()[0].segment,image:`${fileStem()}-model.png`,width:canvas.width,height:canvas.height,readingOrder:'left-to-right, top-to-bottom',panels:mapping,usage:'Ref2VA shot-planning reference; each panel maps to a shot. Render one full-frame image at a time; exclude grid, borders and labels. Not an I2VA first frame.',review:'manually-confirmed-in-export-page'},null,2)],{type:'application/json'}),`${fileStem()}-mapping.json`);sheetStatus.textContent='已导出格子与镜头/时刻的映射。请同时导出模型参考版 PNG；未修改视频任务。';}catch(e){sheetStatus.textContent=e.message;}},advanced);
function changeSheet(){sheetRevision++;reviewCheck.checked=false;singleSelect.replaceChildren();selectedShots().forEach((s,i)=>{const o=el('option',`第 ${i+1} 格 / ${s.id}`);o.value=i;singleSelect.append(o)});sheetPreview.replaceChildren();drawPanelGrid();sheetStatus.textContent=`当前 ${selectedShots().length} 格，已载入 ${selectedShots().filter(s=>s.exportImage).length} 张图片；尚未验收。先点图检查，再选择下载用途。`;}
segmentSelect.onchange=changeSheet;layoutSelect.onchange=()=>{sheetRevision++;reviewCheck.checked=false;sheetPreview.replaceChildren();drawPanelGrid();sheetStatus.textContent='布局已更新，请按新顺序重新检查后导出。';};changeSheet();
