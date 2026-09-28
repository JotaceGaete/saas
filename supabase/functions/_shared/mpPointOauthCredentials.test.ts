import { describe,it,expect } from 'vitest';
import { resolveMpPointOauthCredentials } from './mpPointOauthCredentials';

describe('Point OAuth credentials isolation',()=>{
  it('uses only Point CL credentials',()=>{
    const r=resolveMpPointOauthCredentials('cl',{clientIdCl:'point-cl',clientSecretCl:'secret-cl',clientIdAr:'point-ar',clientSecretAr:'secret-ar'});
    expect(r.ok).toBe(true);
    if(r.ok) expect(r.credentials).toMatchObject({countryCode:'CL',clientId:'point-cl',clientSecret:'secret-cl'});
  });
  it('fails closed when Point credentials are missing',()=>{
    expect(resolveMpPointOauthCredentials('CL',{})).toEqual({ok:false,reason:'country_not_configured'});
  });
  it('does not route unsupported countries',()=>{
    expect(resolveMpPointOauthCredentials('UY',{clientIdCl:'x',clientSecretCl:'y'})).toEqual({ok:false,reason:'unsupported_country'});
  });
});
