"""Development test imports; never installed with the skill."""
import sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / 'skills' / 'data-modeling'
sys.path.insert(0,str(SKILL/'scripts'))
from lib.contract import ROOT, load_json, BUILDER_VERSION
from lib.model_document import validate_model, build_to_file
from lib.model_integrity import review_fingerprint
from lib.modeling_review import assess_review
from migrate_model import migrate_document
