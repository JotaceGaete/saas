"""Synthetic structural tests; no claim of SII XSD conformance."""
import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("audit",Path(__file__).with_name("audit-boleta-xml-order.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
SCHEMA=b"""<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
<xs:element name="IdDoc"><xs:complexType><xs:sequence>
<xs:element name="TipoDTE"/><xs:element name="Folio"/><xs:element name="FchEmis"/>
</xs:sequence></xs:complexType></xs:element>
"""
SCHEMA+=b"".join((f'<xs:element name="{n}"><xs:complexType><xs:sequence><xs:element name="A" minOccurs="0"/></xs:sequence></xs:complexType></xs:element>').encode() for n in mod.NAMES if n!="IdDoc")
SCHEMA+=b"</xs:schema>"
class Tests(unittest.TestCase):
 def test_correct_order(self):
  self.assertEqual(mod.audit(SCHEMA,b'<Root><IdDoc><TipoDTE>39</TipoDTE><Folio>1</Folio><FchEmis>2026-10-28</FchEmis></IdDoc></Root>'),[])
 def test_wrong_order(self):
  issues=mod.audit(SCHEMA,b'<Root><IdDoc><Folio>1</Folio><TipoDTE>39</TipoDTE><FchEmis>2026-10-28</FchEmis></IdDoc></Root>')
  self.assertTrue(any("WRONG_ORDER" in issue for issue in issues))
 def test_missing_required(self):
  issues=mod.audit(SCHEMA,b'<Root><IdDoc><TipoDTE>39</TipoDTE></IdDoc></Root>')
  self.assertTrue(any("MISSING_REQUIRED" in issue for issue in issues))
 def test_unknown_field(self):
  issues=mod.audit(SCHEMA,b'<Root><IdDoc><TipoDTE>39</TipoDTE><Folio>1</Folio><FchEmis>2026-10-28</FchEmis><Unexpected/></IdDoc></Root>')
  self.assertTrue(any("UNKNOWN_FIELDS" in issue for issue in issues))
if __name__=="__main__":unittest.main()
