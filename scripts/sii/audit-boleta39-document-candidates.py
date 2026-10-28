#!/usr/bin/env python3
"""Offline DTE39 candidate XML structural audit. NOT an SII XSD validation."""
import argparse
from pathlib import Path
from lxml import etree

NS = {"s": "http://www.sii.cl/SiiDte"}
REQUIRED_CASES = {f"CASO-{i}" for i in range(1, 6)}

def audit(xml_path):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             huge_tree=False, remove_comments=False)
    root = etree.parse(str(xml_path), parser).getroot()
    if root.tag != "{http://www.sii.cl/SiiDte}DTE":
        raise ValueError("ROOT_NOT_DTE")
    docs = root.xpath("./s:Documento", namespaces=NS)
    if len(docs) != 1 or docs[0].get("ID") != "BORRADOR_NO_FISCAL":
        raise ValueError("NOT_AN_ISOLATED_DRAFT")
    doc = docs[0]
    if doc.xpath("string(./s:Encabezado/s:IdDoc/s:TipoDTE)", namespaces=NS) != "39":
        raise ValueError("WRONG_DOCUMENT_TYPE")
    refs = doc.xpath("./s:Referencia", namespaces=NS)
    if len(refs) != 1 or refs[0].xpath("string(./s:CodRef)", namespaces=NS) != "SET":
        raise ValueError("MISSING_SET_REFERENCE")
    case = refs[0].xpath("string(./s:RazonRef)", namespaces=NS)
    if case not in REQUIRED_CASES:
        raise ValueError("UNKNOWN_CASE")
    lines = doc.xpath("./s:Detalle", namespaces=NS)
    if not lines:
        raise ValueError("MISSING_DETAILS")
    totals = doc.xpath("./s:Encabezado/s:Totales/s:MntTotal", namespaces=NS)
    if len(totals) != 1:
        raise ValueError("MISSING_TOTAL")
    total = int(totals[0].text)
    line_sum = 0
    for index, line in enumerate(lines, 1):
        if line.xpath("string(./s:NroLinDet)", namespaces=NS) != str(index):
            raise ValueError("LINE_SEQUENCE")
        if not line.xpath("string(./s:NmbItem)", namespaces=NS):
            raise ValueError("EMPTY_ITEM")
        line_sum += int(line.xpath("string(./s:MontoItem)", namespaces=NS))
    if line_sum != total or total <= 0:
        raise ValueError("TOTAL_MISMATCH")
    for forbidden in ("TED", "CAF", "Signature", "Folio", "RUTEmisor"):
        if any(etree.QName(e).localname == forbidden for e in root.iter()):
            raise ValueError("UNSAFE_FISCAL_FIELD_" + forbidden)
    return case, total

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    if len(args.files) != 5:
        raise SystemExit("REQUIRE_FIVE_CASES")
    seen = set()
    for path in args.files:
        case, total = audit(path)
        if case in seen:
            raise SystemExit("DUPLICATE_CASE")
        seen.add(case)
        print(f"{case}: structural draft OK, total={total}, SII schema NOT validated")
    if seen != REQUIRED_CASES:
        raise SystemExit("INCOMPLETE_SET")

if __name__ == "__main__":
    main()
