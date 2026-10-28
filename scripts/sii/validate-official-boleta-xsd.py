#!/usr/bin/env python3
"""Offline SII boleta XSD validation. No signing, issuance, network or secrets.

Requires: python -m pip install lxml
Usage:
  python scripts/sii/validate-official-boleta-xsd.py \
    --schema-dir /secure/sii/schema_envio_bol \
    --schema EnvioBOLETA_v11.xsd \
    --xml /secure/fixtures/boleta.xml

The schema name must be taken from the extracted official archive, not guessed.
All XSD imports/includes resolve only within --schema-dir.
"""
import argparse
import pathlib
import sys
from urllib.parse import urlparse
try:
    from lxml import etree
except ImportError:
    sys.exit("ERROR: lxml is required for offline XSD validation (pip install lxml)")


class OfflineResolver(etree.Resolver):
    def __init__(self, root):
        self.root = root.resolve()

    def resolve(self, url, pubid, context):
        parsed = urlparse(url)
        if parsed.scheme or parsed.netloc:
            raise ValueError(f"External schema reference denied: {url}")
        # lxml may invoke the resolver for the absolute entry-point filename.
        # Permit absolute paths ONLY when they resolve inside the trusted root.
        candidate = (pathlib.Path(url) if pathlib.Path(url).is_absolute()
                     else self.root / url).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError(f"Schema reference escapes trusted directory: {url}")
        if not candidate.is_file():
            raise ValueError(f"Missing included schema: {url}")
        return self.resolve_filename(str(candidate), context)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--schema-dir", required=True, type=pathlib.Path)
    ap.add_argument("--schema", required=True, help="Official entry-point XSD filename")
    ap.add_argument("--xml", required=True, type=pathlib.Path)
    args = ap.parse_args()
    root = args.schema_dir.resolve()
    schema_file = (root / args.schema).resolve()
    if not schema_file.is_relative_to(root) or not schema_file.is_file():
        sys.exit("ERROR: schema must be an existing file inside --schema-dir")
    if not args.xml.is_file():
        sys.exit("ERROR: XML fixture not found")
    parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True,
                             huge_tree=False)
    parser.resolvers.add(OfflineResolver(root))
    try:
        schema_doc = etree.parse(str(schema_file), parser)
        try:
            schema = etree.XMLSchema(schema_doc)
        except etree.XMLSchemaParseError as exc:
            print(f"SCHEMA_COMPILE_ERROR: {exc}", file=sys.stderr)
            return 2
        xml_parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True,
                                     huge_tree=False)
        xml_doc = etree.parse(str(args.xml), xml_parser)
        if not schema.validate(xml_doc):
            for error in schema.error_log:
                print(f"XML_SCHEMA_MISMATCH line {error.line}: {error.message}", file=sys.stderr)
            return 1
    except (etree.XMLSyntaxError, ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print("PASS: XML validates against supplied official SII XSD (syntax only; not certification)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
