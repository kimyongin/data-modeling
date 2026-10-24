"""Write validated JSON documents and receipts, independently of viewer code."""
import json
import tempfile
from pathlib import Path


def write_outputs(destination, output, receipt):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staged = []
    try:
        for target, content in [(destination, output), (destination.with_suffix('.build.json'), json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')]:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as handle:
                handle.write(content)
                staged.append((Path(handle.name), target))
        for temporary, target in staged:
            temporary.replace(target)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
