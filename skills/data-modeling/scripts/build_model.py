#!/usr/bin/env python3
"""Validate and write model JSON plus a receipt. Never build or inspect the viewer."""
import argparse
from pathlib import Path
from lib.model_document import build_to_file


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--output', type=Path)
    p.add_argument('--verification', type=Path, help='Only for existing legacy authoring inputs')
    p.add_argument('--allow-compatibility', action='store_true')
    p.add_argument('--clear-verification', action='store_true', help='Explicitly remove results without asserting new ones')
    a = p.parse_args()
    try:
        print(build_to_file(a.input, a.output or a.input.with_name(a.input.stem+'.model.json'), a.verification, a.allow_compatibility, a.clear_verification))
    except (ValueError, KeyError, TypeError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    main()
