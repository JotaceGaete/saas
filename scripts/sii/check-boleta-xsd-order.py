#!/usr/bin/env python3
"""Audit element sequence directly from a user-provided SII XSD ZIP, offline.
Never repairs or replaces the schema. Order inspection is NOT XSD validation.
Usage: python scripts/sii/check-boleta-xsd-order.py /path/schema_envio_bol.zip
"""
import argparse
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET

XS="{http://www.w3.org/2001/XMLSchema}"
EXPECTED={
 "IdDoc":["TipoDTE","Folio","FchEmis","IndServicio"],
 "Emisor":["RUTEmisor","RznSocEmisor","GiroEmisor","CdgSIISucur","DirOrigen","CmnaOrigen","CiudadOrigen"],
 "Receptor":["RUTRecep","CdgIntRecep","RznSocRecep","Contacto","DirRecep","CmnaRecep","CiudadRecep","DirPostal","CmnaPostal","CiudadPostal"],
 "Totales":["MntNeto","MntExe","IVA","MntTotal","MontoNF","TotalPeriodo","SaldoAnterior","VlrPagar"],
 "Detalle":["NroLinDet","CdgItem","IndExe","ItemEspectaculo","RUTMandante","NmbItem","InfoTicket","DscItem","QtyItem","UnmdItem","PrcItem","DescuentoPct","DescuentoMonto","RecargoPct","RecargoMonto","MontoItem"],
 "Referencia":["NroLinRef","CodRef","RazonRef","CodVndor","CodCaja"],
}
def inspect(raw):
 root=ET.fromstring(raw)
 result={}
 for name,expected in EXPECTED.items():
  found=root.findall(f".//{XS}element[@name='{name}']")
  if len(found)!=1:raise ValueError(f"EXPECTED_UNIQUE_ELEMENT: {name}, found {len(found)}")
  sequence=found[0].find(f".//{XS}sequence")
  if sequence is None:raise ValueError(f"SEQUENCE_MISSING: {name}")
  actual=[el.get("name") for el in sequence if el.tag==XS+"element"]
  if name=="IdDoc":
   if actual[:len(expected)]!=expected:raise ValueError(f"SEQUENCE_CHANGED: {name}: {actual}")
  elif actual!=expected:raise ValueError(f"SEQUENCE_CHANGED: {name}: {actual}")
  result[name]=actual
 return result
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("archive",type=pathlib.Path)
 args=parser.parse_args()
 try:
  with zipfile.ZipFile(args.archive) as z:
   order=inspect(z.read("EnvioBOLETA_v11.xsd"))
  for name,fields in order.items():print(f"{name}: {' > '.join(fields)}")
  print("PASS: inspected element order in supplied archive; NOT schema compilation or SII certification")
  return 0
 except (OSError,KeyError,ValueError,ET.ParseError,zipfile.BadZipFile) as exc:
  print(f"FAIL: {exc}",file=sys.stderr)
  return 1
if __name__=="__main__":sys.exit(main())
