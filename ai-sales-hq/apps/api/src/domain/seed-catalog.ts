// Owner-provided initial catalog (MASTER_SPEC §5). Retail prices, awaiting verification against
// the live data; wholesale prices are intentionally absent (D-005).
export const SEED_CATALOG: readonly { name: string; grams: number | null; retailSom: number }[] = [
  { name: 'CHUCHVARA', grams: 500, retailSom: 25_000 },
  { name: 'CHUCHVARA', grams: 300, retailSom: 16_000 },
  { name: 'TABIIY RANGLI CHUCHVARA', grams: 500, retailSom: 27_000 },
  { name: 'TABIIY RANGLI CHUCHVARA', grams: 300, retailSom: 17_000 },
  { name: 'TEFTIL', grams: 300, retailSom: 24_000 },
  { name: 'SOMSA XAMIRI DONA', grams: 850, retailSom: 18_000 },
  { name: 'SOMSA XAMIRI RULON', grams: 1000, retailSom: 20_000 },
  { name: "LAG'MON", grams: 1000, retailSom: 15_000 },
  { name: "LAG'MON", grams: 500, retailSom: 7_500 },
  { name: 'UGRI', grams: 250, retailSom: 8_000 },
  { name: 'GALUPTSI', grams: 1000, retailSom: 40_000 },
  { name: 'QAT-QAT PATIR', grams: null, retailSom: 12_000 },
];
