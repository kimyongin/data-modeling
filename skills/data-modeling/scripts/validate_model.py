#!/usr/bin/env python3
"""Check model JSON, samples, review links and content-bound results without viewer files."""
import argparse
import sys
from pathlib import Path
from lib.contract import load_json
from lib.model_document import validate_model
from lib.modeling_review import assess_review


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--allow-compatibility', action='store_true')
    a = p.parse_args()
    try:
        data = load_json(a.input)
        if not isinstance(data, dict) or data.get('format') != 'data-modeling-model':
            raise ValueError('Use model JSON; convert an old authoring input with build_model.py')
        validate_model(data, allow_compatibility=a.allow_compatibility)
        for warning in assess_review(data['review'])['warnings']:
            print('Review warning: '+warning['code']+': '+warning['message'], file=sys.stderr)
        if data['format_version'] == '1.0.0' and data.get('verification'):
            print('Review warning: legacy_verification_unbound: 이전 결과와 현재 입력의 대응은 확인할 수 없습니다.', file=sys.stderr)
        print('Valid model JSON '+data['format_version']+' (schema, samples, references and result binding; not business approval)')
    except (ValueError, KeyError, TypeError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    main()
