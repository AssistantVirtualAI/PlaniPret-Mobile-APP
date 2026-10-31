/** Never turn widget/web credentials into mobile credentials by changing a suffix. */
export function validatedMobileCredentialIdentity(value: Record<string, unknown>): { extension: string; username: string } | null {
  const extension = String(value.sip_extension ?? "").trim();
  if (!/^\d{2,6}$/.test(extension)) return null;
  const username = `${extension}M`;
  if (value.client_type !== "mobile" || value.device_id !== username || value.sip_username !== username || value.sip_auth_user !== username) return null;
  return { extension, username };
}