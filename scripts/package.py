#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a reproducible extension ZIP containing only runtime files."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    'LICENSE',
    'common.js',
    'extension.js',
    'metadata.json',
    'panel-visibility.js',
    'prefs.js',
    'schemas/org.gnome.shell.extensions.layout-stripe.gschema.xml',
)

metadata = json.loads((ROOT / 'metadata.json').read_text())
output = ROOT / 'dist' / f"{metadata['uuid']}.shell-extension.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in FILES:
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (ROOT / name).read_bytes())
print(output)
