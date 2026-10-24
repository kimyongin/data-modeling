#!/usr/bin/env node
/* Maintainer parity probe: execute the SAME offline validators embedded in the viewer. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ctx=vm.createContext({crypto:webcrypto,TextEncoder,Blob,console});
for(const file of ['dev/viewer/vendor/share-validator.js','dev/viewer/model-integrity.js','dev/viewer/review-transfer.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.probes=input;
(async()=>{const results=await vm.runInContext(`(async()=>{const out=[];for(const probe of probes){try{const payload=await ReviewTransfer.unpack(JSON.stringify(probe.document),{});const exported=JSON.parse(await ReviewTransfer.pack(payload));out.push({name:probe.name,accepted:true,fingerprint:await ModelIntegrity.fingerprint(payload.review),exported});}catch(e){out.push({name:probe.name,accepted:false,error:e.message});}}return out;})()`,ctx);fs.writeFileSync(process.argv[3],JSON.stringify(results,null,2)+'\n');})().catch(e=>{console.error(e);process.exitCode=1;});
