// SERVER ONLY. Private fiscal schema; never expose this client in the browser.
export function createWalinkaTaxMapping(db) {
 if(typeof db?.schema!=='function') throw Error('Private fiscal client required');
 return {
  async getVerifiedLineTaxes({businessId,saleId}) {
   const {data,error}=await db.schema('fiscal').from('verified_line_taxes')
    .select('business_id, invoice_id, invoice_item_id, category, verified')
    .eq('business_id',businessId).eq('invoice_id',saleId);
   if(error) throw Error('Fiscal tax mapping unavailable');
   if(!Array.isArray(data)) throw Error('Fiscal tax mapping malformed');
   return data.map(x=>({
    businessId:x.business_id, saleId:x.invoice_id,
    invoiceItemId:x.invoice_item_id, category:x.category, verified:x.verified===true
   }));
  }
 };
}
