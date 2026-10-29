#!/usr/bin/env python3
"""Compare boleta XML element order against a supplied SII XSD ZIP (offline).
Structural check only: does NOT compile XSD, validate types, or certify a DTE.
"""
import argparse
import sys
import zipfile
import xml.etree.ElementTree as ET

XS="{http://www.w3.org/2001/XMLSchema}"
NAMES=("IdDoc","Emisor","Receptor","Totales","Detalle","Referencia")

def audit(schema_bytes, xml_bytes):
 schema=ET.fromstring(schema_bytes)
 doc=ET.fromstring(xml_bytes)
 problems=[]
 for name in NAMES:
  declarations=schema.findall(f".//{XS}element[@name='{name}']")
  if len(declarations)!=1:
   raise ValueError(f"SCHEMA_DECLARATION_AMBIGUOUS: {name}")
  sequence=declarations[0].find(f".//{XS}sequence")
  if sequence is None:raise ValueError(f"SCHEMA_SEQUENCE_MISSING: {name}")
  fields=[e for e in sequence if e.tag==XS+"element"]
  allowed={e.get("name"):idx for idx,e in enumerate(fields)}
  required={e.get("name") for e in fields if e.get("minOccurs","1")!="0"}
  instances=[el for el in doc.iter() if el.tag.split("}")[-1]==name]
  for instance in instances:
   children=[c.tag.split("}")[-1] for c in instance]
   unknown=[c for c in children if c not in allowed]
   if unknown:problems.append(f"{name}: UNKNOWN_FIELDS {unknown}")
   positions=[allowed[c] for c in children if c in allowed]
   if positions!=sorted(positions):problems.append(f"{name}: WRONG_ORDER {children}")
   missing=required.difference(children)
   if missing:problems.append(f"{name}: MISSING_REQUIRED {sorted(missing)}")
 return problems

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument("--archive",required=True)
 p.add_argument("--xml",required=True)
 args=p.parse_args()
 try:
  with zipfile.ZipFile(args.archive) as z:
   schema=z.read("EnvioBOLETA_v11.xsd")
  with open(args.xml,"rb") as f: xml=f.read()
  problems=audit(schema,xml)
  if problems:
   for issue in problems:print("STRUCTURE_MISMATCH:",issue,file=sys.stderr)
   return 1
  print("PASS: inspected available element order/required children only; NOT full XSD validation")
  return 0
 except (ValueError,OSError,ET.ParseError,zipfile.BadZipFile,KeyError) as e:
  print(f"ERROR: {e}",file=sys.stderr)
  return 2
if __name__=="__main__":sys.exit(main())
