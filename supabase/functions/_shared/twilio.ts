// Twilio webhook signature validation (HMAC-SHA1)
// https://www.twilio.com/docs/usage/webhooks/webhooks-security

async function hmacSha1Base64(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Validate Twilio's X-Twilio-Signature on an incoming request.
 * @param authToken Twilio Auth Token
 * @param signature value of X-Twilio-Signature header
 * @param url full request URL (must match the URL Twilio called)
 * @param params form parameters from the request body (parsed)
 */
export async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  if (!signature || !authToken) return false;
  // Build the signing string: url + sorted key+value pairs concatenated
  const sortedKeys = Object.keys(params).sort();
  let signingString = url;
  for (const k of sortedKeys) signingString += k + params[k];
  const computed = await hmacSha1Base64(authToken, signingString);
  return computed === signature;
}
