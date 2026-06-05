/** Текст времени подачи для пассажира из ввода водителя */
export function formatCustomEtaPhrase(text) {
  const t = (text || '').trim();
  if (!t || t.length > 100) return null;

  const onlyNum = t.match(/^(\d{1,3})$/);
  if (onlyNum) {
    const n = Number(onlyNum[1]);
    if (n >= 1 && n <= 180) return `примерно через ${n} минут`;
    return null;
  }

  const withUnit = t.match(/^(\d{1,3})\s*(минут|минуты|мин|м|min)\.?$/i);
  if (withUnit) {
    const n = Number(withUnit[1]);
    if (n >= 1 && n <= 180) return `примерно через ${n} минут`;
    return null;
  }

  if (/^через\s+/i.test(t) && t.length >= 5) return t;
  if (t.length >= 3) return t;

  return null;
}

export function etaPhraseFromPreset(kind) {
  const presets = {
    3: 'примерно через 3–5 минут',
    10: 'примерно через 10 минут',
    20: 'примерно через 20 минут',
  };
  return presets[kind] ?? null;
}

export function passengerOfferEtaLine(callsign, etaPhrase) {
  return `Водитель (${callsign}) будет у вас ${etaPhrase}.`;
}
