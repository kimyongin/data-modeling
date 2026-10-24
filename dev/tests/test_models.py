#!/usr/bin/env python3
"""Behavioral regressions, output fault injection and isolated installed JSON tools."""
import argparse
import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from corpus import REPO,cases
from lib.validation import validate_document
from lib.model_document import build_to_file
from lib.output import write_outputs,verify_receipt
from lib.contract import load_json


class ModelTests(unittest.TestCase):
    def test_shared_contract_corpus(self):
        for case in cases():
            with self.subTest(case=case['name']):
                if case['code']:
                    with self.assertRaisesRegex(ValueError,'^'+case['code']+'(?::|$)'):
                        validate_document(case['document'])
                else:
                    self.assertTrue(validate_document(case['document'])['valid'])

    def test_model_and_receipt_rollback(self):
        for existing in [True,False]:
            with self.subTest(existing=existing),tempfile.TemporaryDirectory() as tmp:
                target=Path(tmp)/'case.model.json';receipt=target.with_suffix('.build.json')
                if existing:
                    target.write_text('OLD');receipt.write_text('OLD RECEIPT')
                original=Path.replace;calls=0
                def replace(path,destination):
                    nonlocal calls
                    calls+=1
                    if calls==2:raise OSError('injected receipt commit failure')
                    return original(path,destination)
                with patch.object(Path,'replace',replace),self.assertRaises(OSError):
                    write_outputs(target,'NEW',{'new':True})
                self.assertEqual(target.read_text() if target.exists() else None,'OLD' if existing else None)
                self.assertEqual(receipt.read_text() if receipt.exists() else None,'OLD RECEIPT' if existing else None)
                self.assertFalse(list(Path(tmp).glob('*.lock')))

    def test_writer_lock_and_receipt_integrity(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'case.json';target.write_text('OLD');lock=target.with_name(target.name+'.lock');lock.write_text('writer')
            with self.assertRaisesRegex(ValueError,'output_locked'):
                write_outputs(target,'NEW',{})
            self.assertEqual(target.read_text(),'OLD');lock.unlink()
            write_outputs(target,'NEW',{'output_sha256':hashlib.sha256(b'NEW').hexdigest()})
            verify_receipt(target,target.with_suffix('.build.json'))
            target.write_text('interrupted or modified')
            with self.assertRaisesRegex(ValueError,'receipt_mismatch'):
                verify_receipt(target,target.with_suffix('.build.json'))

    def test_failed_validation_never_changes_existing_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'bad.json';source.write_text(json.dumps({'version':'1.0.0'}));target=Path(tmp)/'out.json';target.write_text('KEEP');target.with_suffix('.build.json').write_text('RECEIPT')
            with self.assertRaises(ValueError):build_to_file(source,target)
            self.assertEqual(target.read_text(),'KEEP');self.assertEqual(target.with_suffix('.build.json').read_text(),'RECEIPT')

    def test_json_only_isolated_install_without_viewer(self):
        with tempfile.TemporaryDirectory(prefix='model-json isolated ') as tmp:
            folder=Path(tmp);skill=folder/'skill';shutil.copytree(REPO/'skills/data-modeling',skill,ignore=shutil.ignore_patterns('__pycache__'));shutil.rmtree(skill/'assets')
            for name in ['inventory','booking-change','openmarket']:
                source=REPO/'examples'/f'{name}.model.json';out=folder/f'{name}.model.json'
                result=subprocess.run([sys.executable,str(skill/'scripts/build_model.py'),str(source),'--output',str(out)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(load_json(source),load_json(out));verify_receipt(out,out.with_suffix('.build.json'))
                receipt=load_json(out.with_suffix('.build.json'));self.assertNotIn('viewer_version',receipt);self.assertNotIn('skill_version',receipt)
            self.assertFalse(list(folder.rglob('*.html')))

    def test_all_examples_deterministic_with_independent_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ['inventory','booking-change','openmarket']:
                source=REPO/'examples'/f'{name}.model.json';target=Path(tmp)/f'{name}.json'
                build_to_file(source,target);first=(target.read_bytes(),target.with_suffix('.build.json').read_bytes());build_to_file(source,target)
                self.assertEqual(first,(target.read_bytes(),target.with_suffix('.build.json').read_bytes()))

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'bad.json';source.write_text('{"version":"2.0.0","version":"1.0.0"}')
            with self.assertRaisesRegex(ValueError,'duplicate_key'):
                load_json(source)

    def test_explicit_observation_removal_does_not_claim_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            document=next(c['document'] for c in cases() if c['name']=='scoped result accepted');document['samples']['scenarios'][0]['expected_behavior']='변경된 기대'
            source=Path(tmp)/'edited.json';source.write_text(json.dumps(document));out=Path(tmp)/'new.json'
            build_to_file(source,out,clear_observations=True)
            self.assertEqual(load_json(out)['observations'],[])
            self.assertNotEqual(load_json(source)['observations'],[])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--corpus',type=Path,required=True)
    args=parser.parse_args()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ModelTests))
    probes=[]
    for case in cases():
        probe=copy.deepcopy(case)
        try:
            probe['python_report']=validate_document(case['document']);probe['fingerprints']={}
            from lib.fingerprint import observation_fingerprint
            for scenario in case['document']['samples']['scenarios']:
                probe['fingerprints'][scenario['id']]=observation_fingerprint(case['document'],scenario['id'],'sample')
        except ValueError as exc:probe['python_error']=str(exc).split(':',1)[0]
        probes.append(probe)
    for file,data in [(args.output,dict(run=result.testsRun,failed=len(result.failures)+len(result.errors),scope='CLI, shared corpus, rollback and isolated JSON runtime')),(args.corpus,probes)]:
        file.parent.mkdir(parents=True,exist_ok=True);file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    if not result.wasSuccessful():raise SystemExit(1)


if __name__=='__main__':main()
