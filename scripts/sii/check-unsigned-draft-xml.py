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
    # Fail closed on unexpected document content; never accept hidden nested elements.
    allowed = {
        "DTE": {"Documento"},
        "Documento": {"Encabezado", "Detalle"},
        "Encabezado": {"IdDoc", "Totales"},
        "IdDoc": {"TipoDTE", "FchEmis"},
        "Totales": {"MntTotal"},
        "Detalle": {"NroLinDet", "NmbItem", "MontoItem"},
    }
    leaf = {"TipoDTE", "FchEmis", "MntTotal", "NroLinDet", "NmbItem", "MontoItem"}
    namespace = "{http://www.sii.cl/SiiDte}"
    for element in root.iter():
        if not isinstance(element.tag, str) or not element.tag.startswith(namespace):
            raise ValueError("Foreign namespace or processing element forbidden")
        local = element.tag[len(namespace):]
        if local not in allowed and local not in leaf:
            raise ValueError("Unexpected draft element")
        expected = allowed.get(local, set())
        if any(child.tag != namespace + child.tag[len(namespace):] or
               child.tag[len(namespace):] not in expected for child in element):
            raise ValueError("Unexpected nested draft element")
        if local in leaf and len(element):
            raise ValueError("Nested content in scalar field")
    for element in root.iter():
        local = element.tag[len(namespace):]
        permitted_attrs = {"DTE": {"version"}, "Documento": {"ID"}}
        if set(element.attrib) - permitted_attrs.get(local, set()):
            raise ValueError("Unexpected XML attribute")
        if local in leaf and not (element.text or "").strip():
            raise ValueError("Empty scalar draft field")
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
    details = root.xpath("./sii:Documento/sii:Detalle", namespaces=NS)
    if len(details) != len(lines) or len(details) > 1000:
        raise ValueError("Invalid detail count")
    for number, detail in enumerate(details, 1):
        names = detail.xpath("./sii:NmbItem/text()", namespaces=NS)
        indices = detail.xpath("./sii:NroLinDet/text()", namespaces=NS)
        amounts = detail.xpath("./sii:MontoItem/text()", namespaces=NS)
        if (len(names) != 1 or not names[0].strip() or
            indices != [str(number)] or len(amounts) != 1):
            raise ValueError("Incomplete or repeated detail fields")
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
