// Server-only tenant configuration. No credentials are read from client requests.
// JSON environment mapping is a temporary, explicit pilot configuration.
// Never log or return this mapping in an HTTP response.
export function loadDte39TenantCredentials(businessId, raw = process.env.DTECORE_TENANTS_JSON) {
 if (typeof businessId!=='string' ||
     !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(businessId))
  throw new Error('BUSINESS_ID_INVALID');
 if (typeof raw!=='string' || !raw.trim())
  throw new Error('DTECORE_TENANTS_NOT_CONFIGURED');
 let map;
 try { map=JSON.parse(raw); } catch { throw new Error('DTECORE_TENANTS_INVALID'); }
 if (!map || typeof map!=='object' || Array.isArray(map))
  throw new Error('DTECORE_TENANTS_INVALID');
 const entry=Object.hasOwn(map,businessId)?map[businessId]:null;
 if (!entry || typeof entry!=='object' || Array.isArray(entry) ||
     entry.enabled!==true || typeof entry.apiKey!=='string' ||
     !entry.apiKey.trim() || typeof entry.baseUrl!=='string')
  throw new Error('DTECORE_TENANT_NOT_CONFIGURED');
 return {business_id:businessId,apiKey:entry.apiKey,baseUrl:entry.baseUrl};
}
