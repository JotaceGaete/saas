// Credenciales OAuth exclusivas de la aplicación Mercado Pago Point.
// Nunca hace fallback a MP_CLIENT_* (Checkout Pro): mezclar aplicaciones
// volvería a provocar autorizaciones incorrectas y podría romper online.

export type PointCountry = 'CL' | 'AR';
export type PointCredentialsResult =
  | { ok:true; credentials:{ countryCode:PointCountry; clientId:string; clientSecret:string } }
  | { ok:false; reason:'unsupported_country'|'country_not_configured' };

export function resolveMpPointOauthCredentials(
  rawCountryCode:string|null|undefined,
  env:{clientIdCl?:string;clientSecretCl?:string;clientIdAr?:string;clientSecretAr?:string},
):PointCredentialsResult {
  const code=String(rawCountryCode??'').trim().toUpperCase();
  if(code!=='CL'&&code!=='AR') return {ok:false,reason:'unsupported_country'};
  const clientId=code==='CL'?env.clientIdCl:env.clientIdAr;
  const clientSecret=code==='CL'?env.clientSecretCl:env.clientSecretAr;
  if(!clientId?.trim()||!clientSecret?.trim()) return {ok:false,reason:'country_not_configured'};
  return {ok:true,credentials:{countryCode:code,clientId:clientId.trim(),clientSecret:clientSecret.trim()}};
}

export function getMpPointOauthCredentials(rawCountryCode:string|null|undefined):PointCredentialsResult {
  return resolveMpPointOauthCredentials(rawCountryCode,{
    clientIdCl:Deno.env.get('MP_POINT_CLIENT_ID_CL'),
    clientSecretCl:Deno.env.get('MP_POINT_CLIENT_SECRET_CL'),
    clientIdAr:Deno.env.get('MP_POINT_CLIENT_ID_AR'),
    clientSecretAr:Deno.env.get('MP_POINT_CLIENT_SECRET_AR'),
  });
}
