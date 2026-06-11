// utils/binInfo.js (DB version)
import { getModel } from '../models/index.js';

export async function getBinInfo(bin) {
  const BinInfo = getModel('BinInfo');
  if (BinInfo) {
    const record = await BinInfo.findOne({ where: { bin, is_active: true } });
    if (record) {
      return {
        bankName: record.bank_name,
        country: record.country,
        network: record.network,
        cardType: record.card_type
      };
    }
  }
  // Fallback static map
  const STATIC_MAP = {
    '506099': { bankName: 'Interswitch (Verve)', country: 'Nigeria', network: 'VERVE', cardType: 'Standard' },
    '506100': { bankName: 'N/A', country: 'Nigeria', network: 'Maestro', cardType: 'Standard' }
  };
  return STATIC_MAP[bin] || { bankName: 'Unknown', country: 'Unknown', network: 'Unknown', cardType: 'Unknown' };
}