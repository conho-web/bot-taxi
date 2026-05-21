import fs from 'node:fs';
import path from 'node:path';

const PRICES_PATH = path.join(process.cwd(), 'prices.txt');

const DEFAULT_TEXT = `💰 Тарифы

Укажите тарифы в файле prices.txt в папке бота.
После сохранения файла кнопка «💰 Цены» сразу покажет новый текст.`;

export function readPricesMessage() {
  try {
    const text = fs.readFileSync(PRICES_PATH, 'utf8').trim();
    return text || DEFAULT_TEXT;
  } catch {
    return DEFAULT_TEXT;
  }
}

/** Только для админа через бота */
export function writePricesMessage(text) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Пустой текст цен');
  fs.writeFileSync(PRICES_PATH, `${body}\n`, 'utf8');
}
