"""Synthetic regression tests for the offline SII XSD element-order inspector."""
import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("order",Path(__file__).with_name("check-boleta-xsd-order.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
def fixture():
 parts=[]
 for name,fields in mod.EXPECTED.items():
  fields=fields+(["IndMntNeto"] if name=="IdDoc" else [])
  inner="".join(f'<xs:element name="{field}"/>' for field in fields)
  parts.append(f'<xs:element name="{name}"><xs:complexType><xs:sequence>{inner}</xs:sequence></xs:complexType></xs:element>')
 return ('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">'+"".join(parts)+'</xs:schema>').encode()
class OrderTests(unittest.TestCase):
 def test_expected_sequence(self):
  result=mod.inspect(fixture())
  self.assertEqual(result["Detalle"].index("QtyItem")+1,result["Detalle"].index("UnmdItem"))
 def test_changed_detail_order_fails(self):
  raw=fixture().replace(b'<xs:element name="QtyItem"/><xs:element name="UnmdItem"/>',b'<xs:element name="UnmdItem"/><xs:element name="QtyItem"/>')
  with self.assertRaisesRegex(ValueError,"SEQUENCE_CHANGED: Detalle"):mod.inspect(raw)
 def test_missing_field_fails(self):
  raw=fixture().replace(b'<xs:element name="Folio"/>',b'')
  with self.assertRaisesRegex(ValueError,"SEQUENCE_CHANGED: IdDoc"):mod.inspect(raw)
if __name__=="__main__":unittest.main()
