/* Developer-only module bundling. The installed viewer needs no Node runtime. */
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),devRequire=createRequire(path.join(root,'dev/viewer/package.json'));
const esbuild=devRequire('esbuild');
const output=process.argv[2];
if(!output)throw new Error('Pass output JavaScript path');
esbuild.buildSync({absWorkingDir:root,entryPoints:[path.join(root,'dev/viewer/app.js')],bundle:true,platform:'browser',format:'iife',globalName:'ModelViewer',minify:false,legalComments:'inline',outfile:path.resolve(output)});
