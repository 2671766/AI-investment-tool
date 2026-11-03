"""Every compared workbook cell must match the web engine (see parity.py for the cell map)."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from aidsm.compute import evaluate          # noqa: E402
from parity import actual_from_engine, compare  # noqa: E402

FIXTURES = sorted((HERE / "fixtures").glob("*.json"))


@pytest.mark.parametrize("path", FIXTURES, ids=[p.stem for p in FIXTURES])
def test_workbook_parity(path):
    fx = json.loads(path.read_text())
    bad = compare(fx["expected"], actual_from_engine(evaluate(fx["case"])))
    assert not bad, "%d cells differ, first: %s" % (len(bad), bad[:5])
