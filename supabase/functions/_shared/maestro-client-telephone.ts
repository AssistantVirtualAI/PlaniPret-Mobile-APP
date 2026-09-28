/**
 * Compares public telephone values without retaining formatting differences.
 * A client is considered reachable only after its exact caller number appears in
 * the verified Maestro profile returned by GET /clients/{clientId}.
 */
export function phoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

export function maestroClientHasTelephone(client: unknown, phone: unknown): boolean {
  const expected = phoneDigits(phone);
  if (!expected) return false;

  const source = client && typeof client === "object" ? client as Record<string, unknown> : {};
  const direct = [
    source.phone,
    source.phone_number,
    source.mobile,
    source.mobile_number,
    source.cell_phone,
    source.cellphone,
    source.work_phone,
    source.home_phone,
  ];
  if (direct.some((value) => phoneDigits(value) === expected)) return true;

  const telephones = Array.isArray(source.telephones) ? source.telephones : [];
  return telephones.some((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return phoneDigits(row.telephone_number ?? row.phone ?? row.number) === expected;
  });
}
