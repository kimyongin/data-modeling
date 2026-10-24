#!/usr/bin/env node
/* Actual file download/upload roundtrips and transactional error behavior. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),output=process.argv[3]||'transfer-check.json',checks=[];
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const seal=x=>{x.checksum=crypto.createHash('sha256').update(canonical(x.payload)).digest('hex');return x;};
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'review-transfer-')),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:768}}),p=await context.newPage(),errors=[],network=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
 async function check(name,fn){try{await fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});console.error(name+': '+e.message);}}
 async function loaded(){await p.locator('.graph-stage svg .node').first().waitFor();}
 async function data(){return p.locator('#review-data').evaluate(n=>JSON.parse(n.textContent));}
 async function dismiss(){if(await p.locator('.transfer-notice').isVisible())await p.locator('.transfer-notice-close').click();}
 async function download(name){const pending=p.waitForEvent('download');await p.locator('#review-export').click();const item=await pending,target=path.join(tmp,name+'.json');assert(item.suggestedFilename().endsWith('.model.json'));await item.saveAs(target);return {target,file:JSON.parse(fs.readFileSync(target,'utf8'))};}
 const exports=new Map();
 for(const entry of manifest)await check(entry.name+' downloads complete display data, no execution payload',async()=>{
  await p.goto(pathToFileURL(entry.html).href);await loaded();const initial=await data();
  if(initial.review.domains?.length){await p.locator('.domain-choice:not([data-domain=all])').first().click();await p.waitForFunction(()=>document.querySelector('.graph-canvas').dataset.scopeType==='domain');}
  const item=await download(entry.name);assert.deepEqual(item.file.payload,{review:initial.review,verification:initial.verification,build_metadata:initial.build_metadata});assert.equal(item.file.checksum,seal(structuredClone(item.file)).checksum);assert(!('sqlite' in item.file.payload.review));for(const scenario of item.file.payload.review.scenarios)for(const key of ['query','setup_sql','expected','params','expect_error','result_columns'])assert(!(key in scenario));assert(!('third_party_notices' in item.file.payload));exports.set(entry.name,item);
 });
 for(const size of [[1366,768],[1440,900],[1920,1080]])for(const [i,entry] of manifest.entries())await check(entry.name+' cross-case import / re-export at '+size.join('x'),async()=>{
  await p.setViewportSize({width:size[0],height:size[1]});await p.goto(pathToFileURL(manifest[(i+1)%manifest.length].html).href);await loaded();
  const item=exports.get(entry.name);assert(item);await p.locator('input[type=file]').setInputFiles(item.target);await p.waitForFunction(title=>document.title===title,item.file.payload.review.title);await loaded();await dismiss();
  assert.deepEqual((await data()).review,item.file.payload.review);assert.deepEqual((await data()).verification,item.file.payload.verification);assert.equal(await p.locator('.graph-stage svg .node').count(),item.file.payload.review.entities.length);assert((await p.locator('.app-footer').textContent()).includes('공유받은 확인 결과'));assert.equal(await p.locator('.head-actions .badge').textContent(),'공유 파일');
  for(const tab of ['overview','requirements','sources','model']){await p.locator('#tab-'+tab).click();assert.equal(await p.locator('#tab-'+tab).getAttribute('aria-selected'),'true');}
  await p.locator('.sample-drawer-toggle').click();const first=item.file.payload.review.entities.find(e=>e.id===item.file.payload.review.initial_entity)||item.file.payload.review.entities[0];assert.equal(await p.locator('.sample-grid tbody tr').count(),Math.max(1,first.rows?.length||0));await p.locator('.sample-drawer-close').click();
  const next=await download('roundtrip-'+entry.name+'-'+size[0]);assert.deepEqual(next.file,item.file);await dismiss();
  assert(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1));
  const boxes=await p.locator('.app-brand,.app-header .tabs,.head-actions').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};}));assert(boxes[0].right<=boxes[1].x+1&&boxes[1].right<=boxes[2].x+1);assert(boxes[2].right<=size[0]);
  await p.locator('#tab-sources').click();await p.locator('.record-row').nth((item.file.payload.review.sources||[]).length).click();assert((await p.locator('.record-detail').textContent()).includes('새로 실행하지 않았습니다'));
 });
 const base=exports.get(manifest[0].name);await p.setViewportSize({width:1366,height:768});await p.goto(pathToFileURL(manifest[0].html).href);await loaded();await p.locator('.sample-drawer-toggle').click();await p.locator('.minimap-toggle').click();
 await p.evaluate(()=>{window.__beforeTransferSvg=document.querySelector('.graph-stage svg');window.__beforeTransferData=document.querySelector('#review-data').textContent;window.__beforeTransferCamera=document.querySelector('.graph-stage').style.transform;});
 const mutations=[
  ['broken JSON',()=>'{oops'],['duplicate JSON key',()=>'{"format":"data-modeling-share","format":"oops"}'],['non-finite number',()=>'{"n":NaN}'],['unsafe integer',()=>'{"n":9007199254740993}'],['excessive nesting',()=>'['.repeat(82)+'0'+']'.repeat(82)],
  ['authoring input',()=>fs.readFileSync(manifest[0].input,'utf8')],['unsupported share version',x=>{x.format_version='99.0.0';return x;}],['renderer mismatch',x=>{x.renderer_version='99.0.0';return x;}],['release hash mismatch',x=>{x.payload.build_metadata.renderer_release_sha256='a'.repeat(64);return x;}],['checksum mismatch',x=>{x.payload.review.title+=' changed';return x;}],
  ['wrong type',x=>{x.payload.review.entities={};return seal(x);}],['unknown field',x=>{x.payload.review.javascript='alert(1)';return seal(x);}],['missing standard explanation',x=>{delete x.payload.review.entities[0].short_description;return seal(x);}],
  ['duplicate entity ID',x=>{x.payload.review.entities[1].id=x.payload.review.entities[0].id;return seal(x);}],['unknown relation target',x=>{x.payload.review.relationships[0].to.entity='MISSING';return seal(x);}],['unknown relation column',x=>{x.payload.review.relationships[0].to.columns=['missing'];return seal(x);}],['unknown domain member',x=>{x.payload.review.domains[0].entities=['MISSING'];return seal(x);}],['unknown sample column',x=>{x.payload.review.entities[0].rows[0].missing=1;return seal(x);}],['invalid result status',x=>{x.payload.verification.results[0].status='approved';return seal(x);}],['incomplete result list',x=>{x.payload.verification.results.pop();return seal(x);}],['profile mismatch',x=>{x.payload.build_metadata.review_profile='compatibility';return seal(x);}],['oversized file',()=> ' '.repeat(20*1024*1024+1)]
 ];
 for(const [name,mutate] of mutations)await check('invalid '+name+' preserves data, SVG and camera',async()=>{
  const result=mutate(structuredClone(base.file)),buffer=Buffer.from(typeof result==='string'?result:JSON.stringify(result));await p.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer});await p.waitForFunction(()=>document.querySelector('.transfer-notice')?.dataset.error==='true'&&!document.querySelector('.transfer-notice').hidden);assert((await p.locator('.transfer-notice').textContent()).includes('현재 보고서는 유지됩니다'));assert(await p.evaluate(()=>window.__beforeTransferSvg===document.querySelector('.graph-stage svg')&&window.__beforeTransferData===document.querySelector('#review-data').textContent&&window.__beforeTransferCamera===document.querySelector('.graph-stage').style.transform));assert(await p.locator('.sample-drawer').isVisible());assert.equal(await p.locator('.minimap-toggle').getAttribute('aria-expanded'),'true');await dismiss();
 });
 await check('same file repeated imports reset cleanly and reload restores original',async()=>{
  const other=exports.get('mixed-status');for(let i=0;i<4;i++){await p.locator('input[type=file]').setInputFiles(other.target);await p.waitForFunction(title=>document.title===title,other.file.payload.review.title);await loaded();await dismiss();assert.deepEqual((await data()).verification,other.file.payload.verification);assert(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return new Set(ids).size===ids.length;}));}await p.reload();await loaded();assert.equal((await data()).review.title,base.file.payload.review.title);assert.notEqual(await p.locator('.head-actions .badge').textContent(),'공유 파일');
 });
 await check('offline / no script errors across all transfers',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(network,[]);});
 await browser.close();fs.rmSync(tmp,{recursive:true,force:true});const report={passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,checks};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
