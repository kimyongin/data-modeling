/* Maintainer-only: compile both authoritative JSON data schemas and bundle offline. */
const fs=require('node:fs'),path=require('node:path');
const Ajv=require('ajv/dist/2020').default,standalone=require('ajv/dist/standalone').default,esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),ajv=new Ajv({strict:false,allErrors:false,ownProperties:true,code:{source:true}}),schemas={};
for(const name of ['share','model']){const schema=JSON.parse(fs.readFileSync(path.join(root,`schemas/${name}-1.0.0.schema.json`),'utf8'));ajv.addSchema(schema);schemas[name]=schema.$id;}
const temp=path.join(__dirname,'.transfer-validator.cjs');
try{fs.writeFileSync(temp,standalone(ajv,schemas));esbuild.buildSync({entryPoints:[temp],nodePaths:[path.dirname(path.dirname(require.resolve('ajv/package.json')))],bundle:true,platform:'browser',format:'iife',globalName:'ReviewDataSchemas',minify:true,legalComments:'inline',outfile:path.join(root,'assets/vendor/share-validator.js')});fs.appendFileSync(path.join(root,'assets/vendor/share-validator.js'),'\nvar ReviewShareSchema=ReviewDataSchemas.share,ReviewModelSchema=ReviewDataSchemas.model;\n');}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
