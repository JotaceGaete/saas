// Converts a trusted DB snapshot into a reviewed, single-attempt dispatch plan.
// No provider call, no database mutation, and no credential material in output.
import {previewPaidPosDte39} from './previewPaidPosDte39.js';
import {preparePosDte39} from './preparePosDte39.js';
import {resolveDte39PaymentCode} from './posDte39Payment.js';
import {buildDte39Payload} from './dtecore39.js';
import {authorizeDte39Dispatch} from './authorizeDte39Dispatch.js';

export function prepareClaimedDte39Dispatch({snapshot,control,credentials}) {
 const {job,invoice,business,issuer,taxConfig,items,payments}=snapshot||{};
 if (!job || job.state!=='claimed') throw new Error('DTE39_CLAIM_REQUIRED');
 // An issuer snapshot must prove tenant ownership, not merely share an RUT.
 const authorization=authorizeDte39Dispatch({job,control,issuer,credentials});
 previewPaidPosDte39({job,invoice,business,issuer,taxConfig,items,payments});
 const paymentCode=resolveDte39PaymentCode(payments,invoice.total);
 const sale=preparePosDte39({
  invoice,business,issuer,taxConfig,items,
  operationId:authorization.operationId,paymentCode
 });
 const payload=buildDte39Payload(sale);
 if (payload.idBoletaOperacion!==job.operation_id)
  throw new Error('OPERATION_ID_MISMATCH');
 return {payload,authorization};
}
