#!/usr/bin/env python3
"""Execute isolated relational sample scenarios; no external dependencies."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from render_review import validate_review
from review_contract import load_json, renderer_release


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify(review):
    results = []
    for case in review.get('scenarios', []):
        if not case.get('query'):
            results.append({'id': case['id'], 'status': 'not_run', 'reason': 'No executable SQL'})
            continue
        conn = sqlite3.connect(':memory:')
        conn.execute('PRAGMA foreign_keys = ON')
        blocked = {sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH}
        def authorize(action, arg1, arg2, database, trigger):
            if action in blocked or (action == sqlite3.SQLITE_PRAGMA and (arg1 != 'foreign_key_check' or arg2 is not None)):
                return sqlite3.SQLITE_DENY
            return sqlite3.SQLITE_OK
        conn.set_authorizer(authorize)
        budget = [0]
        def progress():
            budget[0] += 1
            return budget[0] > 10000
        conn.set_progress_handler(progress, 1000)
        phase = 'setup'
        try:
            conn.executescript(review['sqlite']['ddl'])
            for entity in review['entities']:
                table = entity.get('table', entity['id'])
                for row in entity.get('rows', []):
                    names = list(row)
                    quote = lambda s: '"' + s.replace('"', '""') + '"'
                    sql = 'INSERT INTO ' + quote(table) + ' (' + ','.join(map(quote, names)) + ') VALUES (' + ','.join('?' for _ in names) + ')'
                    conn.execute(sql, [row[k] for k in names])
            conn.commit()
            if conn.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Foreign key violations in base fixtures')
            conn.executescript(case.get('setup_sql', ''))
            if 'expected' not in case and not case.get('expect_error'):
                raise ValueError('Expected rows or expected constraint error must be defined before execution')
            phase = 'scenario'
            cur = conn.execute(case['query'], case.get('params', []))
            actual = [list(row) for row in cur.fetchall()] if cur.description else []
            expected = case.get('expected', [])
            if case.get('unordered'):
                order = lambda x: sorted(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in x)
                equal = order(actual) == order(expected)
            else:
                equal = actual == expected
            passed = equal and not case.get('expect_error')
            results.append({'id': case['id'], 'status': 'pass' if passed else 'fail', 'actual': actual, 'expected': expected, 'reason': 'Expected constraint error did not occur' if case.get('expect_error') else ''})
        except sqlite3.IntegrityError as exc:
            wanted = case.get('expect_error')
            code = getattr(exc, 'sqlite_errorname', '')
            if not code:  # Python 3.9/3.10 do not expose sqlite_errorname.
                for prefix, suffix in (('FOREIGN KEY constraint failed', 'FOREIGNKEY'), ('UNIQUE constraint failed', 'UNIQUE'), ('NOT NULL constraint failed', 'NOTNULL'), ('CHECK constraint failed', 'CHECK')):
                    if str(exc).startswith(prefix):
                        code = 'SQLITE_CONSTRAINT_' + suffix
                        break
            # SQLite's native RESTRICT implementation can report TRIGGER for a
            # foreign-key rejection. Preserve that raw code, compare the precise
            # standard FK failure category across Python/SQLite versions.
            category = code
            if code == 'SQLITE_CONSTRAINT_TRIGGER' and str(exc) == 'FOREIGN KEY constraint failed':
                category = 'SQLITE_CONSTRAINT_FOREIGNKEY'
            elif code == 'SQLITE_CONSTRAINT_PRIMARYKEY':
                category = 'SQLITE_CONSTRAINT_UNIQUE'
            passed = phase == 'scenario' and wanted in (code, category) and (not case.get('expect_error_message') or str(exc) == case['expect_error_message'])
            results.append({'id': case['id'], 'status': 'pass' if passed else 'fail', 'error': str(exc), 'error_code': code, 'error_category': category, 'phase': phase, 'expected_error': wanted})
        except Exception as exc:
            results.append({'id': case['id'], 'status': 'fail', 'error': str(exc), 'phase': phase})
        finally:
            conn.close()
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--allow-compatibility', action='store_true')
    args = parser.parse_args()
    review = load_json(args.input)
    validate_review(review, allow_compatibility=args.allow_compatibility)
    ddl = review.get('sqlite', {}).get('ddl', '')
    if not ddl:
        parser.error('sqlite.ddl is required')
    results = verify(review)
    report = {'engine': 'SQLite ' + sqlite3.sqlite_version, 'scope': 'Isolated SQLite sample validation; not target-database or production performance validation', 'input_sha256': digest(args.input), 'executed_at': datetime.now(timezone.utc).isoformat(), 'results': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'report': str(args.output.resolve()), 'pass': sum(r['status'] == 'pass' for r in results), 'fail': sum(r['status'] == 'fail' for r in results), 'not_run': sum(r['status'] == 'not_run' for r in results)}, ensure_ascii=False))
    return 1 if not results or any(r['status'] != 'pass' for r in results) else 0


if __name__ == '__main__':
    raise SystemExit(main())
