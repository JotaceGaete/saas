#!/usr/bin/env python3
"""Read-only diagnostic of the inspected SII boleta XSD archive.

Exit 0: unchanged schema compiled; exit 2: invalid schema; exit 1: untrusted ZIP.
Requires lxml. Does not issue, sign, repair or validate any tax document.
"""
import argparse
import hashlib
import io
import pathlib
import zipfile
from lxml import etree

EXPECTED = {
    "EnvioBOLETA_v11.xsd": "ffd30d054e7736c88eff090993a1470b91c940d99c7371c0795a366bd858c12a",
    "xmldsignature_v10.xsd": "427e3225cd379ae92bae464b892dbf964665af92d453ac61774cffab38b95edb",
}


class ZipResolver(etree.Resolver):
    def __init__(self, contents):
        self.contents = contents

    def resolve(self, url, pubid, context):
        if url not in self.contents:
            raise ValueError("Blocked non-local XSD import: " + url)
        return self.resolve_file(io.BytesIO(self.contents[url]), context)


def audit(zip_path):
    with zipfile.ZipFile(zip_path) as archive:
        contents = {name: archive.read(name) for name in archive.namelist()}
    if set(contents) != set(EXPECTED):
        raise ValueError("Unexpected ZIP members; not the inspected package")
    for name, expected in EXPECTED.items():
        digest = hashlib.sha256(contents[name]).hexdigest()
        if digest != expected:
            raise ValueError(f"Unexpected SHA-256 for {name}: {digest}")
        print(f"PASS checksum {name}: {digest}")
    parser = etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False)
    parser.resolvers.add(ZipResolver(contents))
    try:
        doc = etree.parse(io.BytesIO(contents["EnvioBOLETA_v11.xsd"]), parser)
        etree.XMLSchema(doc)
    except etree.XMLSchemaParseError as exc:
        for err in exc.error_log:
            print(f"SCHEMA ERROR line {err.line}: {err.message}")
        print("BLOCKED: original schema cannot compile; no document validated")
        return 2
    print("PASS: unchanged schema compiles; no document validated")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("zip_file", type=pathlib.Path)
    args = ap.parse_args()
    try:
        raise SystemExit(audit(args.zip_file))
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
