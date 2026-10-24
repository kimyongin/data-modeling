#!/usr/bin/env python3
"""Explicitly stamp unversioned data. Never invent missing business explanations."""
import argparse
import json
from pathlib import Path
from review_contract import load_json, renderer_release


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--profile', choices=['standard', 'compatibility'], default='standard')
    args = p.parse_args()
    try:
        if args.output.exists():
            raise ValueError('Migration output must be a new file; preserve the original')
        data = load_json(args.input)
        if 'schema_version' in data or 'renderer_version' in data:
            raise ValueError('This migration accepts unversioned inputs only; do not silently upgrade a pinned renderer')
        release = renderer_release()
        data.update(schema_version=release['schema_version'], renderer_version=release['renderer_version'], review_profile=args.profile)
        from render_review import validate_review
        validate_review(data, allow_compatibility=args.profile == 'compatibility')
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(str(args.output.resolve()) + '\nInput changed: rerun any execution verification before rendering.')
    except (ValueError, KeyError, TypeError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    main()
