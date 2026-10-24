#!/usr/bin/env python3
"""Bundle development modules into the empty offline viewer. No model runtime imports."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from release_viewer import REPO, VIEWER, RELEASES, read_release
TARGET=REPO/'skills/data-modeling/assets/model-viewer.html'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_viewer(node='node',development=False):
    schema=REPO/'skills/data-modeling/references/schemas/model-2.0.0.schema.json'
    compiled=json.loads((VIEWER/'vendor/schema-build.json').read_text())
    if compiled['schema_sha256'] != digest(schema) or compiled['output_sha256'] != digest(VIEWER/'vendor/schema.js'):
        raise ValueError('schema_bundle: recompile the current JSON Schema')
    release=None if development else read_release()
    metadata=dict(version=json.loads((VIEWER/'version.json').read_text())['version'],document_version='2.0.0',development=development)
    with tempfile.TemporaryDirectory(prefix='model-viewer-bundle-') as tmp:
        bundle=Path(tmp)/'app.js'
        subprocess.run([node,str(REPO/'dev/tools/bundle_viewer.cjs'),str(bundle)],check=True,capture_output=True,text=True)
        script=bundle.read_text()
    styles='\n'.join((VIEWER/'styles'/name).read_text() for name in ['base.css','workspace.css','graph.css'])
    notices={p.name:p.read_text() for p in sorted((VIEWER/'vendor').glob('*.txt'))}
    payload=json.dumps(dict(**metadata,notices=notices),ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    scripts=[(VIEWER/'vendor/viz-global.js').read_text(),script]
    if any('</script' in s.lower() for s in scripts):
        raise ValueError('bundle_script: unescaped script terminator')
    html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>데이터 모델링 뷰어</title><style>'+styles+'</style></head><body><div id="app"></div><noscript>JavaScript를 활성화해 모델을 검토하세요.</noscript><script type="application/json" id="viewer-data">'+payload+'</script>'+''.join('<script>'+s+'</script>' for s in scripts)+'</body></html>'
    receipt=dict(kind='bundled-viewer',viewer_version=metadata['version'],document_version='2.0.0',development=development,source_sha256=hashlib.sha256(json.dumps(release,sort_keys=True).encode()).hexdigest() if release else None,output_sha256=hashlib.sha256(html.encode()).hexdigest(),empty_data=True)
    return html,receipt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default='node')
    parser.add_argument('--output',type=Path,default=TARGET)
    parser.add_argument('--development',action='store_true')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    try:
        if args.output.suffix.lower() != '.html':
            raise ValueError('output_type: viewer output must be HTML')
        html,receipt=build_viewer(args.node,args.development)
        if args.check:
            if not args.output.exists() or args.output.read_bytes()!=html.encode():
                raise ValueError('viewer_stale: bundled viewer does not match current sources')
            print('Bundled viewer matches sources')
            return
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(html,encoding='utf-8')
        target=RELEASES/'viewer-build.json' if args.output.resolve()==TARGET.resolve() else args.output.with_suffix('.build.json')
        target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(receipt,indent=2)+'\n')
        print(args.output.resolve())
    except (ValueError,OSError,subprocess.CalledProcessError) as exc:
        parser.error(str(exc))


if __name__=='__main__':
    main()
