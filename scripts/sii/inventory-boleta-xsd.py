#!/usr/bin/env python3
"""Inspect SII boleta XSD structure without altering it or issuing documents.

Reads an extracted official XSD or ZIP. No third-party packages required.
Output is a field inventory, NOT proof of fiscal validity.
"""
import argparse
import json
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

XS = "{http://www.w3.org/2001/XMLSchema}"
INTERESTING = ("EnvioBOLETA", "Documento")
REQUIRED = ("Encabezado", "IdDoc", "Emisor", "Receptor", "Totales", "Detalle", "TED", "TmstFirma")


def inventory(raw):
    root = ET.fromstring(raw)
    results = []

    def walk(node, path):
        if node.tag == XS + "element":
            name = node.get("name") or node.get("ref")
            if not name:
                return
            path = path + [name]
            if path[0] in INTERESTING:
                results.append({
                    "path": "/".join(path),
                    "minOccurs": int(node.get("minOccurs", "1")),
                    "maxOccurs": node.get("maxOccurs", "1"),
                    "type": node.get("type"),
                })
        for child in node:
            walk(child, path)

    walk(root, [])
    return results


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=pathlib.Path, help="Original ZIP or extracted root XSD")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    try:
        if args.source.suffix.lower() == ".zip":
            with zipfile.ZipFile(args.source) as archive:
                raw = archive.read("EnvioBOLETA_v11.xsd")
        else:
            raw = args.source.read_bytes()
        fields = inventory(raw)
        if not any(f["path"] == "EnvioBOLETA" for f in fields):
            raise ValueError("Unexpected XSD: EnvioBOLETA root missing")
        if not any(f["path"] == "Documento" for f in fields):
            raise ValueError("Unexpected XSD: Documento declaration missing")
        if args.json:
            print(json.dumps(fields, ensure_ascii=False, indent=2))
        else:
            for f in fields:
                print(f'{f["path"]}: {f["minOccurs"]}..{f["maxOccurs"]}')
            print(f"\n{len(fields)} declarations. Inventory only; no XML validation.")
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
