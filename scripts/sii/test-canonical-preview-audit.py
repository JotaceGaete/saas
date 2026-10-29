#!/usr/bin/env python3
"""Negative regression tests for independent canonical preview XML audit."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("canonical_audit",Path(__file__).with_name("audit-canonical-preview.py"))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BASE="""<?xml version="1.0" encoding="UTF-8"?>
<WalinkaNonFiscalCanonicalPreview>
<Encabezado><IdDoc><TipoDTE>39</TipoDTE><Folio>12</Folio><FchEmis>2026-10-28</FchEmis></IdDoc>
<Emisor/><Receptor/><Totales><MntExe>100</MntExe><MntTotal>300</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><IndExe>1</IndExe><MontoItem>100</MontoItem></Detalle>
<Detalle><NroLinDet>2</NroLinDet><MontoItem>200</MontoItem></Detalle>
<Referencia/>
</WalinkaNonFiscalCanonicalPreview>"""

class AuditTests(unittest.TestCase):
 def check(self,xml):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory)/"case.xml"
   p.write_text(xml,encoding="utf-8")
   return module.audit(p)
 def test_valid(self):
  self.assertEqual(self.check(BASE),2)
 def test_wrong_total(self):
  with self.assertRaisesRegex(ValueError,"TOTAL_MISMATCH"):
   self.check(BASE.replace("<MntTotal>300</MntTotal>","<MntTotal>301</MntTotal>"))
 def test_wrong_exempt_total(self):
  with self.assertRaisesRegex(ValueError,"EXEMPT_TOTAL_MISMATCH"):
   self.check(BASE.replace("<MntExe>100</MntExe>","<MntExe>101</MntExe>"))
 def test_wrong_line_number(self):
  with self.assertRaisesRegex(ValueError,"INVALID_LINE_NUMBER"):
   self.check(BASE.replace("<NroLinDet>2</NroLinDet>","<NroLinDet>3</NroLinDet>"))
 def test_wrong_document_type(self):
  with self.assertRaisesRegex(ValueError,"INVALID_DOCUMENT_TYPE"):
   self.check(BASE.replace("<TipoDTE>39</TipoDTE>","<TipoDTE>33</TipoDTE>"))
 def test_unexpected_timbre(self):
  with self.assertRaisesRegex(ValueError,"UNEXPECTED_FISCAL_ARTIFACT"):
   self.check(BASE.replace("<Referencia/>","<Referencia/><TED/>"))
 def test_unexpected_root(self):
  with self.assertRaisesRegex(ValueError,"UNEXPECTED_ROOT"):
   self.check(BASE.replace("WalinkaNonFiscalCanonicalPreview","DTE"))
 def test_malformed_xml(self):
  with self.assertRaises(Exception):
   self.check(BASE.replace("</Referencia>","")[:-15])

if __name__=="__main__":unittest.main()
