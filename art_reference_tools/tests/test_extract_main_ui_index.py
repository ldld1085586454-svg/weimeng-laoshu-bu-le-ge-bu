import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "extract_main_ui_index.py"


def run_test():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        native = root / "native"
        native.mkdir()
        # Minimal Cocos packed JSON matching the production parser contract.
        dep = "14280553b"
        pack = [1, [dep], [], [], [], [
            [[{"name": "Skill_Random1", "rect": [485, 780, 114, 135], "offset": [0, 0], "originalSize": [114, 135], "rotated": 1}], [0], 0, [0], [3], [0]]
        ]]
        config = {"uuids": [dep], "versions": {"native": [0, "cc313"]}}
        (root / "pack.json").write_text(json.dumps(pack), encoding="utf-8")
        (root / "config.json").write_text(json.dumps(config), encoding="utf-8")
        # compact dep name is valid as-is because it is not a 22-char UUID.
        (native / "14280553b.cc313.png").write_bytes(b"fake")
        out = root / "out"
        cp = subprocess.run([
            sys.executable, str(TOOL),
            "--pack-json", str(root / "pack.json"),
            "--config-json", str(root / "config.json"),
            "--native-root", str(native),
            "--output-dir", str(out),
        ], capture_output=True, text=True)
        assert cp.returncode == 0, cp.stderr
        with (out / "main_ui_spriteframes.csv").open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        row = rows[0]
        assert row["resource_name"] == "Skill_Random1"
        assert [int(row[k]) for k in ("x", "y", "w", "h")] == [485, 780, 114, 135]
        assert row["rotated"] == "1"
        assert row["native_path"].endswith("14280553b.cc313.png")
        symbols = (out / "main_ui_symbols.txt").read_text(encoding="utf-8").splitlines()
        assert symbols == ["Skill_Random1"]
    print("PASS test_extract_main_ui_index")


if __name__ == "__main__":
    run_test()
