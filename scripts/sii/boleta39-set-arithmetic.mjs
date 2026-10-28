// Offline arithmetic diagnostic for the official SII boleta certification set.
// NOT a fiscal tax engine: integer division is diagnostic, rounding must be verified
// against SII's authoritative specifications before emitting DTE 39.
export function inspectBoletaSetCase(c) {
  if (!c || !Array.isArray(c.items) || c.items.length===0) throw Error('MISSING_ITEMS');
  let gross=0,affectedGross=0,exemptGross=0;
  const lines=c.items.map((item,index)=>{
    const {quantity,unitPriceWithIva,tax}=item;
    if(!Number.isSafeInteger(quantity)||quantity<=0||
       !Number.isSafeInteger(unitPriceWithIva)||unitPriceWithIva<0||
       !['afecto','exento'].includes(tax)) throw Error('INVALID_LINE');
    const lineGross=quantity*unitPriceWithIva;
    if(!Number.isSafeInteger(lineGross)) throw Error('UNSAFE_AMOUNT');
    gross+=lineGross;
    if(!Number.isSafeInteger(gross)) throw Error('UNSAFE_TOTAL');
    if(tax==='afecto') affectedGross+=lineGross; else exemptGross+=lineGross;
    return Object.freeze({index:index+1,name:item.name,quantity,unitPriceWithIva,
      gross:lineGross,tax,unit:item.unit??null});
  });
  // Illustrative only: gross prices include 19% IVA. SII rounding may differ.
  const indicativeNet=Math.round(affectedGross/1.19);
  const indicativeIva=affectedGross-indicativeNet;
  return Object.freeze({caseId:c.id,lines,gross,affectedGross,exemptGross,
    indicativeNet,indicativeIva,indicativeTotal:indicativeNet+indicativeIva+exemptGross,
    matchesFixture:gross===c.expectedTotal,roundingApproved:false,
    siiValidated:false,fiscalEligible:false,transmittable:false});
}
