#!/usr/bin/env python3
"""Create model JSON and receipt. No viewer, HTML generation or previous formats."""
import argparse
from pathlib import Path
from lib.model_document import build_to_file

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--clear-observations', action='store_true')
    args = parser.parse_args()
    try:
        path, report = build_to_file(args.input, args.output, args.clear_observations)
        for warning in report['warnings']:
            print('Warning: '+warning['code']+': '+warning['message'])
        print(path)
    except (ValueError, KeyError, TypeError, OSError, RuntimeError) as exc:
        parser.error(str(exc))

if __name__ == '__main__':
    main()
