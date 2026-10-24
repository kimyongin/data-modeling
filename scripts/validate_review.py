#!/usr/bin/env python3
"""Validate a review against its pinned schema, renderer and cross-reference rules."""
import argparse
import sys
from pathlib import Path
from review_contract import load_json
from render_review import validate_review


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--allow-compatibility', action='store_true')
    args = p.parse_args()
    try:
        data = load_json(args.input)
        if isinstance(data,dict) and data.get('format') == 'data-modeling-model':
            from build_model import validate_model
            validate_model(data, allow_compatibility=args.allow_compatibility)
            from modeling_review import assess_review
            for warning in assess_review(data['review'])['warnings']:
                print('Review warning: '+warning['code']+': '+warning['message'],file=sys.stderr)
            print('Valid: directly importable model JSON 1.0.0 (format and review links; not business approval)')
            return
        validate_review(data, allow_compatibility=args.allow_compatibility)
        print('Valid: schema ' + data['schema_version'] + ', renderer ' + data['renderer_version'] + ', ' + data['review_profile'])
    except (ValueError, KeyError, TypeError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    main()
