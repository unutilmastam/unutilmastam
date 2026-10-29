// Small RFC 4180 CSV reader for the owner's prospect import (MASTER_SPEC §10, A4 source 2).
// Accepts "," or ";" (Excel in Uzbek/Russian locales saves ";"), quoted fields and a BOM.

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export const CSV_COLUMNS = ['name', 'phone', 'address', 'district', 'category', 'telegram', 'notes'] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

const HEADER_ALIASES: Record<CsvColumn, readonly string[]> = {
  name: ['name', 'nomi', 'nom', "do'kon", 'dokon', 'название', 'магазин'],
  phone: ['phone', 'telefon', 'tel', 'телефон', 'raqam'],
  address: ['address', 'manzil', 'адрес'],
  district: ['district', 'tuman', 'shahar', 'район', 'город'],
  category: ['category', 'turi', 'tur', 'тип', 'категория'],
  telegram: ['telegram', 'tg'],
  notes: ['notes', 'izoh', 'izohlar', 'примечание', 'комментарий'],
};

export function mapHeader(header: readonly string[]): Partial<Record<CsvColumn, number>> {
  const map: Partial<Record<CsvColumn, number>> = {};
  header.forEach((h, idx) => {
    const key = h
      .trim()
      .toLowerCase()
      .replace(/[‘’ʻʼ`]/g, "'");
    for (const col of CSV_COLUMNS) {
      if (map[col] === undefined && HEADER_ALIASES[col].includes(key)) map[col] = idx;
    }
  });
  return map;
}
