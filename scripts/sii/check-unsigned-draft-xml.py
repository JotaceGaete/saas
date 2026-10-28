#!/usr/bin/env python3
"""Parse a non-fiscal boleta XML draft offline; never claim SII validity."""
import argparse
import pathlib
import sys
from lxml import etree

NS = {"sii": "http://www.sii.cl/SiiDte"}

def inspect(path):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    data = pathlib.Path(path).read_bytes()
    if len(data) > 2_000_000 or b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("Unsafe XML input")
    root = etree.fromstring(data, parser=parser)
    if root.tag != "{http://www.sii.cl/SiiDte}DTE":
        raise ValueError("Unexpected XML root")
    docs = root.xpath("./sii:Documento", namespaces=NS)
    if len(docs) != 1 or docs[0].get("ID") != "BORRADOR_NO_FISCAL":
        raise ValueError("Not an explicitly non-fiscal draft")
    if root.xpath(".//*[local-name()='Folio' or local-name()='TED' or local-name()='Signature' or local-name()='CAF']"):
        raise ValueError("Fiscal authorization/signature element forbidden in draft")
    types = root.xpath("./sii:Documento/sii:Encabezado/sii:IdDoc/sii:TipoDTE/text()", namespaces=NS)
    if types != ["39"]:
        raise ValueError("Not boleta type 39")
    lines = root.xpath("./sii:Documento/sii:Detalle/sii:MontoItem/text()", namespaces=NS)
    totals = root.xpath("./sii:Documento/sii:Encabezado/sii:Totales/sii:MntTotal/text()", namespaces=NS)
    if len(totals) != 1 or not lines or not all(x.isascii() and x.isdecimal() for x in lines + totals):
        raise ValueError("Missing or invalid integer amounts")
    if sum(map(int, lines)) != int(totals[0]) or int(totals[0]) <= 0:
        raise ValueError("Draft totals mismatch")
    print("PASS: well-formed non-fiscal draft structure; NOT XSD-validated, signed or SII-approved")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xml", type=pathlib.Path)
    args = ap.parse_args()
    try:
        inspect(args.xml)
    except (ValueError, OSError, etree.XMLSyntaxError) as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        sys.exit(1)
