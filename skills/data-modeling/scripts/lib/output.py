"""Stage outputs, serialize concurrent writers, and restore both files on commit failure.
Two filesystem renames are not crash-atomic; receipt hashes detect interrupted pairs.
"""
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

def verify_receipt(document, receipt):
    metadata = json.loads(Path(receipt).read_text())
    if metadata.get('output_sha256') != hashlib.sha256(Path(document).read_bytes()).hexdigest():
        raise ValueError('receipt_mismatch: JSON and build receipt do not match')
    return metadata

def write_outputs(destination, output, receipt):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    targets = [destination, destination.with_suffix('.build.json')]
    if any(p.exists() and not p.is_file() for p in targets):
        raise ValueError('output_path: outputs must be files')
    lock = destination.with_name(destination.name+'.lock')
    try:
        fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise ValueError('output_locked: another build owns '+str(lock)+'. Remove an abandoned lock only after checking the writer stopped.') from exc
    os.close(fd)
    staged, backups, committed = [], {}, []
    preserve_backups = False
    try:
        for target, content in zip(targets, [output, json.dumps(receipt, ensure_ascii=False, indent=2)+'\n']):
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as handle:
                staged.append((Path(handle.name), target))
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            if target.exists():
                with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                    backup = Path(handle.name)
                backups[target] = backup
                shutil.copy2(target, backup)
        try:
            for temporary, target in staged:
                temporary.replace(target)
                committed.append(target)
        except OSError:
            for target in reversed(committed):
                try:
                    if target in backups:
                        os.replace(backups[target], target)
                    else:
                        target.unlink(missing_ok=True)
                except OSError:
                    preserve_backups = True
                    raise RuntimeError('output_recovery: preserve backups '+str(backups))
            raise
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
        if not preserve_backups:
            for backup in backups.values():
                backup.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)
