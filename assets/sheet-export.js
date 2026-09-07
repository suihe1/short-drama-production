// Offline PNG export. Source pixels are embedded so file:// never taints canvas.
const sheetBox = el('section', undefined, 'card');
sheetBox.id = 'sheet-export';
sheetBox.append(el('h2', '按段导出多格故事板'));
sheetBox.append(el('p', '审阅版包含镜号、时长、动作与运镜；模型参考版仅保留画面。单格保留源图比例与分辨率。'));
const sheetControls = el('div', undefined, 'toolbar');
const segmentSelect = el('select'); segmentSelect.id = 'sheet-segment'; segmentSelect.setAttribute('aria-label', '故事板片段');
const groups = new Map();
for (const s of data.shots) { const key = `${s.episode}/${s.segment}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
for (const [key, group] of groups) { const o = el('option', `E${group[0].episode} / ${group[0].segment} · ${group.length} 格`); o.value = key; segmentSelect.append(o); }
const layoutSelect = el('select'); layoutSelect.id = 'sheet-columns'; layoutSelect.setAttribute('aria-label','每行格数');
for (const value of [0, 1, 2, 3, 4]) { const o = el('option', value ? `${value} 列` : '自动布局'); o.value = value; layoutSelect.append(o); }
const singleSelect = el('select'); singleSelect.id = 'sheet-single'; singleSelect.setAttribute('aria-label', '单格镜号');
sheetControls.append(segmentSelect, layoutSelect, singleSelect);
const uploadLabel=el('label','替换选中单格：');
const upload=el('input');upload.type='file';upload.id='sheet-upload';upload.accept='image/png,image/jpeg,image/webp';uploadLabel.append(upload);sheetControls.append(uploadLabel);
const checkLabel = el('label'); const reviewCheck = el('input'); reviewCheck.type = 'checkbox'; reviewCheck.id = 'sheet-reviewed';
checkLabel.append(reviewCheck, document.createTextNode(' 我已检查各格姿态、手别、轴线及信息可读性'));
const sheetStatus = el('p'); sheetStatus.id = 'sheet-status'; sheetStatus.setAttribute('role','status');
const sheetPreview = el('div'); sheetPreview.id = 'sheet-preview';
const previewStyle = el('style'); previewStyle.textContent = '#sheet-preview{max-height:600px;overflow:auto;background:#dce5ec}#sheet-preview canvas{display:block;width:100%;height:auto}#sheet-export label{display:block}';
sheetBox.append(sheetControls, checkLabel, sheetStatus, sheetPreview, previewStyle);
document.querySelector('header').append(sheetBox);
let sheetRevision = 0;
function selectedShots() { return groups.get(segmentSelect.value) || []; }
upload.onchange=()=>{
  const file=upload.files?.[0],shot=selectedShots()[Number(singleSelect.value)];if(!file||!shot)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>30*1024*1024){sheetStatus.textContent='请选择不超过 30 MB 的 PNG、JPEG 或 WebP';return;}
  const revision=sheetRevision,reader=new FileReader();
  reader.onload=()=>{if(revision!==sheetRevision)return;shot.exportImage=reader.result;shot.exportSourceName=file.name;sheetRevision++;reviewCheck.checked=false;sheetPreview.replaceChildren();sheetStatus.textContent=`已替换 ${shot.id} 的导出图片；仅影响本页导出，源文件未修改。请重新预览并验收。`;};
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
async function executeSheet(mode,download=true){stop();const revision=sheetRevision;sheetStatus.textContent='正在本地排版…';try{const result=await makeSheet(mode);if(revision!==sheetRevision)return;sheetPreview.replaceChildren(result.canvas);if(download)downloadBlob(await canvasBlob(result.canvas),`${fileStem()}-${mode}.png`);sheetStatus.textContent=`${mode==='review'?'审阅版':'模型参考版'}：${result.canvas.width} × ${result.canvas.height}，缺图 ${result.missing} 格。${download?'已导出 PNG。':''}`;}catch(e){sheetStatus.textContent=e.message;}}
function button(id,label,fn){const b=el('button',label);b.id=id;b.onclick=fn;sheetControls.append(b);return b;}
button('sheet-preview-button','预览多格图',()=>executeSheet('review',false));
button('sheet-review','审阅版 PNG',()=>executeSheet('review'));
button('sheet-model','模型参考版 PNG',()=>executeSheet('model'));
button('sheet-single-export','单格 PNG',async()=>{try{const shot=selectedShots()[Number(singleSelect.value)];if(!shot)throw Error('请选择单格');const img=await loadPanel(shot);if(!img)throw Error('该镜头缺少可读取的规划图');if(img.naturalWidth*img.naturalHeight>32000000)throw Error('单格源图过大');const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);downloadBlob(await canvasBlob(c),`${fileStem()}-panel-${Number(singleSelect.value)+1}.png`);sheetStatus.textContent='已导出源图分辨率的单格 PNG。';}catch(e){sheetStatus.textContent=e.message;}});
button('sheet-map','参考映射 JSON',async()=>{const revision=sheetRevision;try{const {canvas,mapping}=await makeSheet('model');if(revision!==sheetRevision)return;downloadBlob(new Blob([JSON.stringify({schemaVersion:'1.0',kind:'storyboard-sheet-reference',episode:selectedShots()[0].episode,segment:selectedShots()[0].segment,image:`${fileStem()}-model.png`,width:canvas.width,height:canvas.height,readingOrder:'left-to-right, top-to-bottom',panels:mapping,usage:'Ref2VA shot-planning reference; each panel maps to a shot. Render one full-frame image at a time; exclude grid, borders and labels. Not an I2VA first frame.',review:'manually-confirmed-in-export-page'},null,2)],{type:'application/json'}),`${fileStem()}-mapping.json`);sheetStatus.textContent='已导出格子与镜头/时刻的映射。请同时导出模型参考版 PNG；未修改视频任务。';}catch(e){sheetStatus.textContent=e.message;}});
function changeSheet(){sheetRevision++;reviewCheck.checked=false;singleSelect.replaceChildren();selectedShots().forEach((s,i)=>{const o=el('option',`${i+1} / ${s.id}`);o.value=i;singleSelect.append(o)});sheetPreview.replaceChildren();sheetStatus.textContent=`${selectedShots().length} 格；规划图 ${selectedShots().filter(s=>s.exportImage).length} 张。点击预览检查。`;}
segmentSelect.onchange=changeSheet;layoutSelect.onchange=()=>{sheetRevision++;sheetPreview.replaceChildren();};changeSheet();
