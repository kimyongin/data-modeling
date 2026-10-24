#!/usr/bin/env python3
"""Test release gates, reproducible package and runtime/version independence."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'dev/tools'))
import package_skill


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default='node')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    class PackageTests(unittest.TestCase):
        def test_reproducible_self_contained_package(self):
            first,manifest=package_skill.package_bytes(args.node);second,_=package_skill.package_bytes(args.node)
            self.assertEqual(first,second);self.assertEqual(hashlib.sha256(first).hexdigest(),manifest['zip_sha256'])
            with tempfile.TemporaryDirectory() as tmp:
                file=Path(tmp)/'skill.zip';file.write_bytes(first)
                with zipfile.ZipFile(file) as archive:
                    for name in archive.namelist():
                        self.assertTrue(name.startswith('data-modeling/'));self.assertNotIn('dev',Path(name).parts);self.assertNotIn('__pycache__',Path(name).parts)
                        rel=Path(name).relative_to('data-modeling').as_posix();self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(),manifest['files'][rel])
                    archive.extractall(Path(tmp)/'installed')
                installed=Path(tmp)/'installed/data-modeling'
                self.assertTrue((installed/'assets/model-viewer.html').is_file())
                for name in ['openmarket','booking-change','inventory']:
                    result=subprocess.run([sys.executable,str(installed/'scripts/validate_model.py'),str(REPO/'examples'/f'{name}.model.json')],capture_output=True,text=True)
                    self.assertEqual(result.returncode,0,result.stderr)

        def test_damaged_viewer_and_development_files_rejected(self):
            with tempfile.TemporaryDirectory() as tmp:
                skill=Path(tmp)/'skill';shutil.copytree(package_skill.SKILL,skill,ignore=shutil.ignore_patterns('__pycache__'))
                original=package_skill.SKILL
                try:
                    package_skill.SKILL=skill
                    viewer=skill/'assets/model-viewer.html';raw=viewer.read_bytes();viewer.write_text('<script type="application/json" id="viewer-data">{}</script>')
                    with self.assertRaisesRegex(ValueError,'package_viewer'):package_skill.package_bytes(args.node)
                    viewer.write_bytes(raw);(skill/'dev').mkdir()
                    with self.assertRaisesRegex(ValueError,'package_files'):package_skill.package_bytes(args.node)
                finally:package_skill.SKILL=original

        def test_changed_sources_cannot_be_packaged_with_old_release(self):
            with tempfile.TemporaryDirectory() as tmp:
                project=Path(tmp)/'project';shutil.copytree(REPO,project,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
                with (project/'dev/viewer/styles/base.css').open('a') as stream:stream.write('\n.changed {color:red}\n')
                result=subprocess.run([sys.executable,str(project/'dev/tools/package_skill.py'),'--node',args.node,'--output',str(Path(tmp)/'bad.zip')],capture_output=True,text=True)
                self.assertNotEqual(result.returncode,0);self.assertIn('viewer_sources',result.stderr);self.assertFalse((Path(tmp)/'bad.zip').exists())

        def test_viewer_build_is_independent_of_working_directory(self):
            with tempfile.TemporaryDirectory() as tmp:
                result=subprocess.run([sys.executable,str(REPO/'dev/tools/build_viewer.py'),'--node',args.node,'--check'],cwd=tmp,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)

        def test_package_is_independent_of_working_directory(self):
            with tempfile.TemporaryDirectory() as tmp:
                output=Path(tmp)/'skill.zip'
                result=subprocess.run([sys.executable,str(REPO/'dev/tools/package_skill.py'),'--node',args.node,'--output',str(output)],cwd=tmp,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertTrue(zipfile.is_zipfile(output))

        def test_skill_version_does_not_change_json_receipt(self):
            with tempfile.TemporaryDirectory() as tmp:
                folder=Path(tmp);skill=folder/'skill';shutil.copytree(package_skill.SKILL,skill,ignore=shutil.ignore_patterns('__pycache__'));shutil.rmtree(skill/'assets')
                source=REPO/'examples/inventory.model.json';out=folder/'out.json'
                command=[sys.executable,str(skill/'scripts/build_model.py'),str(source),'--output',str(out)]
                subprocess.run(command,check=True,capture_output=True);before=(out.read_bytes(),out.with_suffix('.build.json').read_bytes())
                version=skill/'version.json';data=json.loads(version.read_text());data['skill']='99.0.0';version.write_text(json.dumps(data))
                subprocess.run(command,check=True,capture_output=True);self.assertEqual(before,(out.read_bytes(),out.with_suffix('.build.json').read_bytes()))

    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PackageTests))
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(dict(run=result.testsRun,failed=len(result.failures)+len(result.errors)),indent=2)+'\n')
    if not result.wasSuccessful():raise SystemExit(1)


if __name__=='__main__':main()
