"""Regression tests for the offline SII XSD validator.

Synthetic schemas only: passing these tests does NOT validate SII documents.
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate-official-boleta-xsd.py")
NS = "urn:walinka:synthetic-xsd-test"

VALID_SCHEMA = """<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="urn:walinka:synthetic-xsd-test"
           xmlns:t="urn:walinka:synthetic-xsd-test" elementFormDefault="qualified">
  <xs:element name="Draft" type="xs:positiveInteger"/>
</xs:schema>
"""
INVALID_RESTRICTION = """<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
 <xs:simpleType name="PctType"><xs:restriction base="xs:decimal">
   <xs:minInclusive value="0.01"/>
 </xs:restriction></xs:simpleType>
 <xs:simpleType name="BadPct"><xs:restriction base="PctType">
   <xs:minInclusive value="0.00"/>
 </xs:restriction></xs:simpleType>
 <xs:element name="Draft" type="BadPct"/>
</xs:schema>
"""

class XsdValidationGateTests(unittest.TestCase):
    def invoke(self, schema, xml):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            (folder / "test.xsd").write_text(schema, encoding="utf-8")
            (folder / "draft.xml").write_text(xml, encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), "--schema-dir", d,
                 "--schema", "test.xsd", "--xml", str(folder / "draft.xml")],
                text=True, capture_output=True, timeout=15, check=False
            )

    def test_valid_synthetic_xml_passes(self):
        result = self.invoke(VALID_SCHEMA, f'<Draft xmlns="{NS}">42</Draft>')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("syntax only", result.stdout)

    def test_invalid_xml_fails_closed(self):
        result = self.invoke(VALID_SCHEMA, f'<Draft xmlns="{NS}">not-a-number</Draft>')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("XSD ERROR", result.stderr)

    def test_inconsistent_restriction_cannot_be_bypassed(self):
        result = self.invoke(INVALID_RESTRICTION, "<Draft>0.00</Draft>")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("ERROR:", result.stderr)
        self.assertNotIn("PASS:", result.stdout)

    def test_malformed_xml_fails(self):
        result = self.invoke(VALID_SCHEMA, f'<Draft xmlns="{NS}">42')
        self.assertNotEqual(result.returncode, 0)

    def test_external_entity_not_expanded(self):
        xml = f'<!DOCTYPE Draft [<!ENTITY secret SYSTEM "file:///etc/passwd">]><Draft xmlns="{NS}">&secret;</Draft>'
        result = self.invoke(VALID_SCHEMA, xml)
        self.assertNotEqual(result.returncode, 0)

if __name__ == "__main__":
    unittest.main()
