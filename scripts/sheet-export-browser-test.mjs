// Optional development test: npm install --no-save playwright && npx playwright install chromium
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderView } from './storyboard-view.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-sheet-test-'));
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
try {
  const page = await browser.newPage({viewport:{width:1360,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const colors = ['#cc3344','#33aa66','#3377cc','#ddaa22'];
  const pictures=await page.evaluate(colors=>colors.map(color=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,640,360);return c.toDataURL('image/png')}),colors);
  const shots=colors.map((_,i)=>({key:`1/E01-01/${i+1}`,episode:1,segment:'E01-01',id:`SH${i+1}`,scene:'room',start:i*3,duration:3,size:'MS',camera:'横移。'.repeat(20),action:'人物向左移动。'.repeat(20),continuity:{},exportImage:pictures[i],variants:[],plannedRefs:[]}));
  shots.push({...shots[0],key:'1/E01-02/1',segment:'E01-02',id:'missing',exportImage:null});
  const report=path.join(temp,'report.html');fs.writeFileSync(report,renderView({title:'Offline export fixture',aspect:'16:9',shots}));
  await page.goto(pathToFileURL(report).href);
  assert.equal(await page.locator('#review-guide').getAttribute('open'),'');
  assert.equal(await page.locator('#review-guide ol li').count(),3);
  assert.equal(await page.locator('#cards').isVisible(),false);
  assert.equal(await page.locator('#sheet-grid .sheet-panel').count(),4);
  await page.locator('#sheet-grid .sheet-panel').nth(1).click();
  assert.equal(await page.locator('#sheet-single').inputValue(),'1');
  await page.locator('#sheet-note').fill('第二格需要调整视线');
  await page.locator('#view-details').click();
  assert.equal(await page.locator('#cards').isVisible(),true);
  assert.equal(await page.locator('#sheet-export').isVisible(),false);
  assert.equal(await page.locator('[aria-label="SH2 返工笔记"]').inputValue(),'第二格需要调整视线');
  await page.locator('[aria-label="SH2 返工笔记"]').fill('第二格已复核，仍需换图');
  await page.locator('#view-board').click();
  assert.equal(await page.locator('#sheet-note').inputValue(),'第二格已复核，仍需换图');
  await page.locator('#sheet-single').selectOption('0');
  await page.locator('#sheet-model').click();
  await page.waitForFunction(()=>document.getElementById('sheet-status').textContent.includes('勾选'));
  await page.locator('#sheet-reviewed').check();
  async function download(button,name){const event=page.waitForEvent('download');await page.locator(button).click();const d=await event;const file=path.join(temp,name);await d.saveAs(file);return file;}
  const model=await download('#sheet-model','model.png');
  const raw=fs.readFileSync(model);assert.equal(raw.readUInt32BE(16),1288);assert.equal(raw.readUInt32BE(20),728);
  const samples=await page.evaluate(()=>{const c=document.querySelector('#sheet-preview canvas'),x=c.getContext('2d');return [[100,100],[750,100],[100,470],[750,470]].map(([a,b])=>Array.from(x.getImageData(a,b,1,1).data))});
  assert.deepEqual(samples,[[204,51,68,255],[51,170,102,255],[51,119,204,255],[221,170,34,255]]);
  const review=fs.readFileSync(await download('#sheet-review','review.png'));assert.ok(review.readUInt32BE(20)>728);
  const single=fs.readFileSync(await download('#sheet-single-export','single.png'));assert.equal(single.readUInt32BE(16),640);assert.equal(single.readUInt32BE(20),360);
  await page.locator('#sheet-advanced > summary').click();
  const mapping=JSON.parse(fs.readFileSync(await download('#sheet-map','map.json'),'utf8'));assert.equal(mapping.panels.length,4);assert.equal(mapping.panels[3].start,9);assert.equal(mapping.panels[3].row,2);
  await page.locator('#sheet-segment').selectOption('1/E01-02');assert.equal(await page.locator('#sheet-reviewed').isChecked(),false);
  await page.locator('#sheet-reviewed').check();await page.locator('#sheet-model').click();await page.waitForFunction(()=>document.getElementById('sheet-status').textContent.includes('缺少'));
  await download('#sheet-review','missing-review.png');
  await page.locator('#sheet-upload').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
  await page.waitForFunction(()=>document.getElementById('sheet-status').textContent.includes('原图未替换'));
  await page.locator('#sheet-upload').setInputFiles(model);
  await page.waitForFunction(()=>document.getElementById('sheet-status').textContent.includes('已替换'));
  assert.equal(await page.locator('#sheet-reviewed').isChecked(),false);
  assert.equal(await page.locator('#sheet-grid img').count(),1);
  await page.locator('#sheet-reviewed').check();await download('#sheet-model','replacement-model.png');
  await page.locator('#sheet-segment').selectOption('1/E01-01');await page.locator('#sheet-columns').selectOption('3');await page.locator('#sheet-reviewed').check();
  const uneven=JSON.parse(fs.readFileSync(await download('#sheet-map','uneven.json'),'utf8'));assert.equal(uneven.panels[3].column,1);assert.equal(uneven.panels[3].row,2);
  for(const mutation of ['segment','approval']){
    const downloads=await page.evaluate(async mutation=>{
      const encode=canvasBlob,save=downloadBlob,segment=segmentSelect.value;let release,started,downloads=0;
      const encoding=new Promise(resolve=>started=resolve);
      canvasBlob=async canvas=>{started();await new Promise(resolve=>release=resolve);return encode(canvas);};
      downloadBlob=()=>downloads++;
      try{
        reviewCheck.checked=true;
        const pending=executeSheet('model');await encoding;
        if(mutation==='segment'){segmentSelect.value='1/E01-02';changeSheet();}
        else{reviewCheck.checked=false;reviewCheck.dispatchEvent(new Event('change'));}
        release();await pending;return downloads;
      }finally{canvasBlob=encode;downloadBlob=save;segmentSelect.value=segment;changeSheet();}
    },mutation);
    assert.equal(downloads,0,`stale PNG cancelled after ${mutation}`);
  }
  const sessionFile=await download('#review-save','session.json');
  const saved=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
  assert.equal(saved.images.length,1);assert.equal(saved.entries.length,1);
  const notesFile=await download('#export','notes.json');
  await page.reload();
  await page.locator('#review-import').setInputFiles(sessionFile);
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已恢复'));
  assert.equal(await page.locator('#sheet-columns').inputValue(),'3');
  assert.equal(await page.locator('#sheet-reviewed').isChecked(),false);
  await page.locator('#sheet-single').selectOption('1');
  assert.equal(await page.locator('#sheet-note').inputValue(),'第二格已复核，仍需换图');
  await page.locator('#sheet-segment').selectOption('1/E01-02');
  assert.equal(await page.locator('#sheet-grid img').getAttribute('src'),saved.images[0].image);
  await page.locator('#sheet-note').fill('保留当前编辑');
  await page.locator('#review-import').setInputFiles(sessionFile);
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('未保存编辑'));
  assert.equal(await page.locator('#sheet-note').inputValue(),'保留当前编辑');
  await download('#review-save','updated-session.json');
  async function importJSON(value){await page.locator('#review-import').setInputFiles({name:'import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}
  await importJSON({...saved,reviewIdentity:'wrong'});
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('不匹配'));
  await importJSON({...saved,images:[{...saved.images[0],image:'data:image/png;base64,YmFk'}]});
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('无法解码'));
  assert.equal(await page.locator('#sheet-note').inputValue(),'保留当前编辑');
  await page.reload();
  await page.locator('#review-import').setInputFiles(notesFile);
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('已合并'));
  await page.locator('#sheet-single').selectOption('1');
  assert.equal(await page.locator('#sheet-note').inputValue(),'第二格已复核，仍需换图');
  await page.locator('#sheet-note').fill('本地不同意见');
  await page.locator('#review-import').setInputFiles(notesFile);
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('冲突'));
  assert.equal(await page.locator('#sheet-note').inputValue(),'本地不同意见');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS guided review and PNG exports; session download/reload restores notes, images and layout; review reset; dirty edits, wrong snapshot, corrupt image and note conflicts protected; mobile layout');
} finally {await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
