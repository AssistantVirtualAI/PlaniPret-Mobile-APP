// FusionPBX-compatible IP phone catalog grouped by brand.
export const PBX_DEVICE_BRANDS: Record<string, string[]> = {
  'Polycom/Poly': [
    'VVX 150', 'VVX 250', 'VVX 350', 'VVX 450', 'VVX 601', 'VVX 1500',
    'Trio 8300', 'Trio 8500', 'Trio 8800',
    'Edge E100', 'Edge E220', 'Edge E300', 'Edge E400', 'Edge E500', 'Edge E600',
    'CCX 350', 'CCX 400', 'CCX 500', 'CCX 600', 'CCX 700',
  ],
  'Yealink': [
    'SIP-T19P E2', 'SIP-T21P E2', 'SIP-T23G',
    'SIP-T27G', 'SIP-T29G',
    'SIP-T31G', 'SIP-T33G', 'SIP-T41S', 'SIP-T42S',
    'SIP-T46S', 'SIP-T48S',
    'SIP-T53W', 'SIP-T54W', 'SIP-T57W',
    'SIP-T58W', 'SIP-T58A',
    'CP920', 'CP960',
    'W52P', 'W56P', 'W60P',
    'VP59',
  ],
  'Grandstream': [
    'GXP1610', 'GXP1620', 'GXP1625', 'GXP1628',
    'GXP2130', 'GXP2135', 'GXP2140', 'GXP2160', 'GXP2170',
    'GXP2200',
    'GXV3240', 'GXV3275', 'GXV3350',
    'DP720', 'DP722', 'DP730', 'DP750',
    'GVC3210', 'GVC3220',
  ],
  'Cisco': [
    'SPA303', 'SPA504G', 'SPA508G', 'SPA525G',
    'CP-7821', 'CP-7841', 'CP-7861',
    'CP-8841', 'CP-8845', 'CP-8865', 'CP-8832',
  ],
  'Snom': [
    'D120', 'D315', 'D335', 'D345', 'D385',
    'D717', 'D735', 'D765', 'D785', 'D865',
    'C520', 'C620', 'M18', 'M25', 'M65', 'M700',
  ],
  'Fanvil': [
    'X1', 'X1P', 'X1SG', 'X3', 'X3S', 'X3SG', 'X3SP',
    'X4', 'X4G', 'X5S', 'X5SG', 'X6', 'X6U', 'X7', 'X7A',
    'C400', 'C600', 'i10V', 'i20S', 'PA2',
  ],
  'Aastra/Mitel': [
    '6730i', '6731i', '6735i', '6737i', '6739i',
    '6755i', '6757i', '6863i', '6865i', '6867i', '6869i', '6873i',
  ],
  'AudioCodes': [
    '405', '405HD', '420HD', '430HD', '440HD', '445HD', '450HD',
    'C450HD', '710HD', '720HD', '740HD', '750HD',
  ],
  'Htek': ['UC902', 'UC903', 'UC912', 'UC923', 'UC924', 'UC926'],
  'Escene': ['ES290', 'ES320', 'ES330', 'ES410', 'ES620'],
};

export function formatMac(input: string): string {
  const clean = input.replace(/[^0-9a-fA-F]/g, '').slice(0, 12).toLowerCase();
  return (clean.match(/.{1,2}/g) ?? []).join(':');
}
