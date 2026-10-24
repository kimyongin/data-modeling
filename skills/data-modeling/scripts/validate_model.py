#!/usr/bin/env python3
"""Validate the current JSON contract, references, datasets and scoped observations."""
import argparse
import json
from pathlib import Path
from lib.contract import load_json
from lib.validation import validate_document
from lib.output import verify_receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    try:
        report = validate_document(load_json(args.input))
        if args.receipt:
            verify_receipt(args.input, args.receipt)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, TypeError, OSError) as exc:
        parser.error(str(exc))

if __name__ == '__main__':
    main()
