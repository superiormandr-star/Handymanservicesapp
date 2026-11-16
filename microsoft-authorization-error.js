'use strict';
const reasons=new Set(['invalid_or_expired_link','token_exchange_failed','access_denied','invalid_request','unauthorized_client','login_required','interaction_required','consent_required','provider_error','missing_authorization_code']);
const messages={
 invalid_or_expired_link:'This Microsoft connection link has expired or was already used. Start a new connection from Backups.',
 access_denied:'Microsoft permission approval was declined. Start a new connection when you are ready to approve it.',
 unauthorized_client:'The Microsoft app is not configured for this account type.',
 consent_required:'Microsoft requires permission approval for this connection.',
 login_required:'Microsoft requires you to sign in again.',
 missing_authorization_code:'Microsoft did not return an authorization code. Start a new connection from Backups.'
};
const microsoftMessages={
 50011:'The Microsoft callback address does not match the app registration.',
 700016:'The Microsoft app was not found in the selected directory.',
 7000215:'Microsoft rejected the app client secret. The owner must update it securely in the hosting settings.',
 7000218:'Microsoft requires a server client credential for this app registration.',
 7000222:'The Microsoft app client secret has expired. The owner must replace it securely in the hosting settings.',
 9002332:'The Microsoft app is not configured for this account type.',
 70011:'Microsoft rejected the requested backup permission.',
 65001:'Microsoft requires permission approval for this connection.'
};
function describeAuthorizationError(error){
 const reason=reasons.has(error?.authReason)?error.authReason:'authorization_failed';
 const microsoftCode=Number.isSafeInteger(error?.microsoftCode)&&error.microsoftCode>0&&error.microsoftCode<=9999999999?error.microsoftCode:undefined;
 const diagnostic=reason+(microsoftCode?' / AADSTS'+microsoftCode:'');
 const message=microsoftMessages[microsoftCode]||messages[reason]||'The Microsoft connection could not be completed. Start a new connection from Backups.';
 return {error:message+' ('+diagnostic+')',reason,...(microsoftCode?{microsoftCode}:{})};
}
module.exports={describeAuthorizationError};
