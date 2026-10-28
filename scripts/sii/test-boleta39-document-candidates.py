import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from lxml import etree
from importlib.util import spec_from_file_location, module_from_spec

MODULE_PATH=Path(__file__).with_name("audit-boleta39-document-candidates.py")
spec=spec_from_file_location("audit_boleta39_document_candidates",MODULE_PATH)
module=module_from_spec(spec)
spec.loader.exec_module(module)
NS="http://www.sii.cl/SiiDte"
def tag(name): return "{"+NS+"}"+name
def candidate():
 root=etree.Element(tag("DTE"),nsmap={None:NS},version="1.0")
 doc=etree.SubElement(root,tag("Documento"),ID="BORRADOR_NO_FISCAL")
 head=etree.SubElement(doc,tag("Encabezado"))
 iddoc=etree.SubElement(head,tag("IdDoc"))
 etree.SubElement(iddoc,tag("TipoDTE")).text="39"
 totals=etree.SubElement(head,tag("Totales"))
 etree.SubElement(totals,tag("MntTotal")).text="3500"
 detail=etree.SubElement(doc,tag("Detalle"))
 for key,value in [("NroLinDet","1"),("NmbItem","Arroz"),("QtyItem","5"),("UnmdItem","Kg"),("PrcItem","700"),("MontoItem","3500")]:
  etree.SubElement(detail,tag(key)).text=value
 ref=etree.SubElement(doc,tag("Referencia"))
 etree.SubElement(ref,tag("NroLinRef")).text="1"
 etree.SubElement(ref,tag("CodRef")).text="SET"
 etree.SubElement(ref,tag("RazonRef")).text="CASO-5"
 return root

class CandidateAuditTests(unittest.TestCase):
 def assert_audit(self,mutate=None,expected_error=None):
  root=candidate()
  if mutate: mutate(root)
  with TemporaryDirectory() as directory:
   path=Path(directory)/"draft.xml"
   path.write_bytes(etree.tostring(root,xml_declaration=True,encoding="UTF-8"))
   if expected_error:
    with self.assertRaisesRegex(ValueError,expected_error):
     module.audit(path)
   else:
    self.assertEqual(module.audit(path),("CASO-5",3500))
 def test_valid_draft(self): self.assert_audit()
 def test_reject_total_mismatch(self):
  self.assert_audit(lambda root:root.find(".//"+tag("MontoItem")).__setattr__("text","3499"),"CASE_DETAIL_MISMATCH")
 def test_reject_changed_price(self):
  self.assert_audit(lambda root:root.find(".//"+tag("PrcItem")).__setattr__("text","701"),"CASE_DETAIL_MISMATCH")
 def test_reject_changed_name(self):
  self.assert_audit(lambda root:root.find(".//"+tag("NmbItem")).__setattr__("text","Arroz premium"),"CASE_DETAIL_MISMATCH")
 def test_reject_changed_unit(self):
  self.assert_audit(lambda root:root.find(".//"+tag("UnmdItem")).__setattr__("text","Unidad"),"CASE_DETAIL_MISMATCH")
 def test_reject_folio(self):
  self.assert_audit(lambda root:etree.SubElement(root.find(".//"+tag("IdDoc")),tag("Folio")).__setattr__("text","1"),"UNSAFE_FISCAL_FIELD")
 def test_reject_bad_reference(self):
  self.assert_audit(lambda root:root.find(".//"+tag("CodRef")).__setattr__("text","OTHER"),"MISSING_SET_REFERENCE")
 def test_reject_unknown_case(self):
  self.assert_audit(lambda root:root.find(".//"+tag("RazonRef")).__setattr__("text","CASO-9"),"UNKNOWN_CASE")
 def test_reject_bad_sequence(self):
  self.assert_audit(lambda root:root.find(".//"+tag("NroLinDet")).__setattr__("text","2"),"LINE_SEQUENCE")
 def test_reject_wrong_type(self):
  self.assert_audit(lambda root:root.find(".//"+tag("TipoDTE")).__setattr__("text","33"),"WRONG_DOCUMENT_TYPE")
 def test_reject_external_entity(self):
  with TemporaryDirectory() as directory:
   path=Path(directory)/"malicious.xml"
   path.write_text('<?xml version="1.0"?><!DOCTYPE DTE [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><DTE xmlns="'+NS+'">&xxe;</DTE>',encoding="utf-8")
   with self.assertRaises((ValueError,etree.XMLSyntaxError)):
    module.audit(path)

if __name__=="__main__":
 unittest.main()
