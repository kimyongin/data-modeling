/* Compile the single authoring contract for offline use; development dependencies only. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '../..');
const devRequire = createRequire(path.join(root, 'dev/viewer/package.json'));
const Ajv = devRequire('ajv/dist/2020').default;
const standalone = devRequire('ajv/dist/standalone').default;
const esbuild = devRequire('esbuild');
const schemaPath = path.join(root, 'skills/data-modeling/references/schemas/model-2.0.0.schema.json');
const schemaBytes = fs.readFileSync(schemaPath);
const schema = JSON.parse(schemaBytes);
const ajv = new Ajv({strict: false, ownProperties: true, code: {source: true, esm: true}});
ajv.addSchema(schema);
const source = path.join(__dirname, '.schema-source.mjs');
const output = path.join(root, 'dev/viewer/vendor/schema.js');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
try {
  fs.writeFileSync(source, standalone(ajv, {validateModel: schema.$id}));
  esbuild.buildSync({entryPoints: [source], bundle: true, platform: 'browser', format: 'esm',
    nodePaths: [path.dirname(path.dirname(devRequire.resolve('ajv/package.json')))],
    minify: true, legalComments: 'inline', outfile: output});
  fs.writeFileSync(path.join(root, 'dev/viewer/vendor/schema-build.json'), JSON.stringify({
    schema_sha256: hash(schemaBytes), output_sha256: hash(fs.readFileSync(output)),
    ajv: devRequire('ajv/package.json').version, esbuild: esbuild.version
  }, null, 2)+'\n');
} finally {
  if (fs.existsSync(source)) fs.unlinkSync(source);
}
