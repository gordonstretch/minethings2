export const LEGAL_VERSION = '2026-08-30';

export const LEGAL_VERSIONS = Object.freeze({
  '2026-08-22': Object.freeze({
    effectiveDate: '22 August 2026',
    title: 'MineThings Terms, Payments and Privacy Notice'
  }),
  '2026-08-23': Object.freeze({
    effectiveDate: '23 August 2026',
    title: 'MineThings Terms, Payments and Privacy Notice'
  }),
  [LEGAL_VERSION]: Object.freeze({
    effectiveDate: '30 August 2026',
    title: 'MineThings Terms, Payments and Privacy Notice'
  })
});

export function sellerConfiguration(options = {}, environment = process.env) {
  return Object.freeze({
    operatorName: String(options.operatorName ?? environment.MINETHINGS_OPERATOR_NAME ?? 'Serif').trim(),
    legalName: String(options.legalName ?? environment.MINETHINGS_LEGAL_NAME ?? '').trim(),
    legalAddress: String(options.legalAddress ?? environment.MINETHINGS_LEGAL_ADDRESS ?? '').trim(),
    legalEmail: String(options.legalEmail ?? environment.MINETHINGS_LEGAL_EMAIL ?? '').trim()
  });
}

export function sellerIdentityComplete(seller) {
  return Boolean(seller?.legalName && seller?.legalAddress && seller?.legalEmail);
}
