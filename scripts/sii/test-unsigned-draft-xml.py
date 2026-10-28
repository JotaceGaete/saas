#!/usr/bin/env python3
"""Offline tests of non-fiscal XML draft parser, using synthetic XML only."""
import pathlib
import tempfile
import unittest
import importlib.util

module_path = pathlib.Path(__file__).with_name('check-unsigned-draft-xml.py')
spec = importlib.util.spec_from_file_location('check_unsigned_draft_xml', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
inspect = module.inspect

BASE = '''<?xml version="1.0" encoding="UTF-8"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
 <Documento ID="BORRADOR_NO_FISCAL">
 <Encabezado><IdDoc><TipoDTE>39</TipoDTE></IdDoc><Totales><MntTotal>1190</MntTotal></Totales></Encabezado>
 <Detalle><NroLinDet>1</NroLinDet><NmbItem>Prueba</NmbItem><MontoItem>1190</MontoItem></Detalle>
 </Documento>
</DTE>'''

class DraftParserTests(unittest.TestCase):
    def check(self, xml, valid):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / 'draft.xml'
            p.write_text(xml, encoding='utf-8')
            if valid:
                inspect(p)
            else:
                with self.assertRaises(Exception):
                    inspect(p)

    def test_valid_synthetic_draft(self):
        self.check(BASE, True)

    def test_rejects_wrong_total(self):
        self.check(BASE.replace('<MntTotal>1190</MntTotal>', '<MntTotal>1191</MntTotal>'), False)

    def test_rejects_folio(self):
        self.check(BASE.replace('<TipoDTE>39</TipoDTE>', '<TipoDTE>39</TipoDTE><Folio>1</Folio>'), False)

    def test_rejects_signature(self):
        self.check(BASE.replace('</Documento>', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></Documento>'), False)

    def test_rejects_wrong_document_type(self):
        self.check(BASE.replace('<TipoDTE>39</TipoDTE>', '<TipoDTE>33</TipoDTE>'), False)

    def test_rejects_doctype(self):
        self.check('<!DOCTYPE DTE>' + BASE, False)

    def test_rejects_broken_xml(self):
        self.check(BASE.replace('</DTE>', ''), False)

if __name__ == '__main__':
    unittest.main()
