#!/usr/bin/env node
/* Load exported case data into one data-free viewer and preserve the original envelope. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [manifestPath,viewerPath,outputPath,legacyPath]=process.argv.slice(2),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),checks=[];
const folder=path.resolve(path.dirname(outputPath),'shared-models');fs.mkdirSync(folder,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({acceptDownloads:true}),p=await context.newPage(),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
 const data=()=>p.locator('#review-data').evaluate(n=>JSON.parse(n.textContent));
 const loaded=()=>p.locator('.graph-stage svg .node').first().waitFor();
 const dismiss=async()=>{if(await p.locator('.transfer-notice').isVisible())await p.locator('.transfer-notice-close').click();};
 async function check(name,fn){try{await fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});console.error(name+': '+e.message);}}
 async function download(filename){const pending=p.waitForEvent('download');await p.locator('#review-export').click();const dl=await pending,target=path.join(folder,filename);await dl.saveAs(target);await dismiss();return {target,file:JSON.parse(fs.readFileSync(target,'utf8'))};}
 const exports=[];
 for(const entry of manifest)await check(entry.name+' exported from common report renderer',async()=>{await p.goto(pathToFileURL(entry.html).href);await loaded();exports.push({...await download(entry.name+'.model.json'),name:entry.name});});
 if(legacyPath)await check('existing 1.0.1 report export remains available',async()=>{await p.goto(pathToFileURL(path.resolve(legacyPath)).href);await loaded();const old=await download('room-booking-1.0.1.model.json');assert.equal(old.file.renderer_version,'1.0.1');exports.push({...old,name:'legacy-1.0.1'});});
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]){
  await p.setViewportSize({width,height});await p.goto(pathToFileURL(path.resolve(viewerPath)).href);
  await check('data-free usable start at '+width+'x'+height,async()=>{await p.locator('.viewer-empty').waitFor();const d=await data();assert.equal(d.review,null);assert.equal(d.verification,null);assert.equal(d.build_metadata,null);assert.equal(await p.locator('.graph-stage,.tabs,.sample-drawer').count(),0);assert(await p.locator('#review-export').isDisabled());assert(await p.locator('#review-import').isEnabled());assert(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1));assert(await p.locator('.viewer-empty').evaluate(n=>n.scrollHeight<=n.clientHeight+1));});
  await check('bad file leaves empty start intact at '+width,async()=>{await p.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{oops')});await p.waitForFunction(()=>document.querySelector('.transfer-notice').dataset.error==='true');assert.equal((await data()).review,null);assert(await p.locator('#review-export').isDisabled());assert(await p.locator('.viewer-empty').isVisible());await dismiss();});
  for(const item of exports)await check(item.name+' loads / switches / re-exports in same viewer at '+width,async()=>{
   await p.locator('input[type=file]').setInputFiles(item.target);await p.waitForFunction(t=>document.title===t,item.file.payload.review.title);await loaded();await dismiss();
   const d=await data();assert.deepEqual(d.review,item.file.payload.review);assert.deepEqual(d.verification,item.file.payload.verification);assert.deepEqual(d.build_metadata,item.file.payload.build_metadata);assert.equal(await p.locator('.viewer-empty').count(),0);assert.equal(await p.locator('.graph-stage svg .node').count(),d.review.entities.length);assert(await p.locator('#review-export').isEnabled());
   for(const tab of ['overview','requirements','sources','model']){await p.locator('#tab-'+tab).click();assert.equal(await p.locator('#tab-'+tab).getAttribute('aria-selected'),'true');}
   await p.locator('.sample-drawer-toggle').click();assert(await p.locator('.sample-drawer').isVisible());assert(await p.locator('.sample-grid').isVisible());await p.locator('.sample-drawer-resizer').focus();await p.keyboard.press('ArrowUp');await p.locator('.sample-drawer-close').click();
   await p.locator('[data-view=insights]').click();assert(await p.locator('.entity-detail-scroll').isVisible());
   await p.locator('#tab-sources').click();await p.locator('.record-row').nth((d.review.sources||[]).length).click();assert((await p.locator('.record-detail').textContent()).includes('빈 뷰어'));if(d.review.review_profile==='compatibility')assert((await p.locator('.record-detail').textContent()).includes('호환 모드'));
   const result=await download('roundtrip-'+item.name+'.model.json');assert.deepEqual(result.file,item.file);fs.unlinkSync(result.target);
   assert(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size&&document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&localStorage.length===0;}));
  });
  await check('reload forgets loaded data at '+width,async()=>{await p.reload();await p.locator('.viewer-empty').waitFor();assert.equal((await data()).review,null);assert(await p.locator('#review-export').isDisabled());});
 }
 await check('viewer loads same file repeatedly and preserves current view on invalid file',async()=>{
  const item=exports.find(e=>e.name==='room-booking');for(let i=0;i<3;i++){await p.locator('input[type=file]').setInputFiles(item.target);await loaded();await dismiss();assert.deepEqual((await data()).review,item.file.payload.review);}
  await p.evaluate(()=>{window.__viewerSvg=document.querySelector('.graph-stage svg');window.__viewerPayload=document.querySelector('#review-data').textContent;});await p.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"data-modeling-share","format_version":"99.0.0"}')});await p.waitForFunction(()=>document.querySelector('.transfer-notice').dataset.error==='true');assert(await p.evaluate(()=>window.__viewerSvg===document.querySelector('.graph-stage svg')&&window.__viewerPayload===document.querySelector('#review-data').textContent));await dismiss();
 });
 await check('no remote requests, execution errors or browser persistence',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.equal(await p.evaluate(()=>localStorage.length),0);});
 await p.goto(pathToFileURL(path.resolve(viewerPath)).href);await p.setViewportSize({width:1366,height:768});await p.locator('.viewer-empty').waitFor();await p.screenshot({path:path.join(path.dirname(outputPath),'empty-viewer.png')});
 await browser.close();const report={passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,checks,shared_models:exports.map(e=>e.target)};fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
