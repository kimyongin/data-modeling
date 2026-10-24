#!/usr/bin/env python3
"""One maintainer command for document, failure-path, workspace and actual bundle checks."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
REPO=Path(__file__).resolve().parents[2]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default='node')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--development',action='store_true',help='Use a temporary unsealed viewer; skip release/package checks')
    args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    (out/'summary.json').write_text(json.dumps(dict(status='running',failed=None))+'\n')
    def run(*command):
        try:
            subprocess.run([str(x) for x in command],cwd=REPO,check=True)
        except subprocess.CalledProcessError as exc:
            (out/'summary.json').write_text(json.dumps(dict(status='failed',failed=1,command=[str(x) for x in command]),ensure_ascii=False,indent=2)+'\n')
            raise SystemExit(exc.returncode)
    tests=REPO/'dev/tests'
    run(sys.executable,tests/'test_models.py','--output',out/'python.json','--corpus',out/'corpus.json')
    run(sys.executable,tests/'check_examples.py','--output',out/'business.json')
    with tempfile.TemporaryDirectory(prefix='viewer-check-') as tmp:
        viewer=REPO/'skills/data-modeling/assets/model-viewer.html'
        if args.development:
            viewer=Path(tmp)/'viewer.html'
            run(sys.executable,REPO/'dev/tools/build_viewer.py','--development','--node',args.node,'--output',viewer)
        else:
            run(sys.executable,REPO/'dev/tools/build_viewer.py','--check','--node',args.node)
        run(args.node,tests/'check_contract.mjs',out/'corpus.json',viewer,out/'contract.json')
        run(args.node,tests/'check_workspace.mjs','examples/test-manifest.json',out/'workspace.json')
        run(args.node,tests/'check_bundle.mjs',viewer,'examples/test-manifest.json',out/'bundle.json')
    if not args.development:
        run(sys.executable,tests/'test_package.py','--node',args.node,'--output',out/'package.json')
    files=['python','business','contract','workspace','bundle']+([] if args.development else ['package'])
    results={name:json.loads((out/(name+'.json')).read_text()) for name in files}
    summary=dict(status='complete',failed=sum(r.get('failed',0) for r in results.values()),reports={name:{k:r[k] for k in ['run','passed','failed'] if k in r} for name,r in results.items()},browser_visual_inspection='not_run; CLI, Node engine and minimal DOM only')
    (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))
    if summary['failed']:raise SystemExit(1)


if __name__=='__main__':main()
