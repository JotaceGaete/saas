#!/usr/bin/env python3
"""Offline structural audit of canonical previews; NOT SII XSD certification."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

def audit(path):
    root=ET.parse(path).getroot()
    if root.tag != "WalinkaNonFiscalCanonicalPreview":
        raise ValueError("UNEXPECTED_ROOT")
    header=root.find("Encabezado")
    if header is None: raise ValueError("MISSING_HEADER")
    iddoc=header.find("IdDoc")
    if iddoc is None or iddoc.findtext("TipoDTE")!="39":
        raise ValueError("INVALID_DOCUMENT_TYPE")
    if not iddoc.findtext("Folio") or not iddoc.findtext("FchEmis"):
        raise ValueError("MISSING_FISCAL_HEADER")
    if header.find("Emisor") is None or header.find("Receptor") is None:
        raise ValueError("MISSING_PARTIES")
    totals=header.find("Totales")
    if totals is None: raise ValueError("MISSING_TOTALS")
    lines=root.findall("Detalle")
    if not lines: raise ValueError("MISSING_DETAILS")
    line_sum=0
    exempt_sum=0
    for n,line in enumerate(lines,1):
        if line.findtext("NroLinDet")!=str(n):
            raise ValueError("INVALID_LINE_NUMBER")
        amount=int(line.findtext("MontoItem") or "-1")
        if amount<0: raise ValueError("INVALID_LINE_AMOUNT")
        line_sum+=amount
        if line.findtext("IndExe")=="1": exempt_sum+=amount
    if line_sum!=int(totals.findtext("MntTotal") or "-1"):
        raise ValueError("TOTAL_MISMATCH")
    if exempt_sum!=int(totals.findtext("MntExe") or "0"):
        raise ValueError("EXEMPT_TOTAL_MISMATCH")
    if root.find("Referencia") is None: raise ValueError("MISSING_SET_REFERENCE")
    if root.find(".//TED") is not None or root.find(".//CAF") is not None:
        raise ValueError("UNEXPECTED_FISCAL_ARTIFACT")
    return len(lines)

def main(argv):
    if len(argv)<2:
        print("Usage: audit-canonical-preview.py FILE.xml [FILE.xml ...]",file=sys.stderr)
        return 2
    try:
        for arg in argv[1:]:
            print(f"PASS {Path(arg).name}: {audit(arg)} lines (offline structural audit only)")
        return 0
    except (ET.ParseError,ValueError,OSError) as exc:
        print(f"FAIL: {exc}",file=sys.stderr)
        return 1

if __name__=="__main__":sys.exit(main(sys.argv))
