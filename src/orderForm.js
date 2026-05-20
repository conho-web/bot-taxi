/** Шаги заполнения формы заказа пассажиром. */
export const FORM_STEP = {
  FROM_ADDRESS: 'from_address',
  FROM_BUILDING: 'from_building',
  TO_ADDRESS: 'to_address',
  TO_BUILDING: 'to_building',
  COMMENT: 'comment',
};

const STEP_ORDER = [
  FORM_STEP.FROM_ADDRESS,
  FORM_STEP.FROM_BUILDING,
  FORM_STEP.TO_ADDRESS,
  FORM_STEP.TO_BUILDING,
  FORM_STEP.COMMENT,
];

const PROMPTS = {
  [FORM_STEP.FROM_ADDRESS]: 'Введите **адрес откуда** (улица, район):',
  [FORM_STEP.FROM_BUILDING]: 'Введите **дом и подъезд** (откуда):',
  [FORM_STEP.TO_ADDRESS]: 'Введите **адрес куда** (улица, район):',
  [FORM_STEP.TO_BUILDING]: 'Введите **дом и подъезд** (куда):',
  [FORM_STEP.COMMENT]:
    '**Комментарий водителю** (по желанию).\nОтправьте текст или «—», чтобы пропустить.',
};

function line(value) {
  const v = (value || '').trim();
  return v || '—';
}

export function isSkipComment(text) {
  const t = (text || '').trim().toLowerCase();
  return !t || t === '—' || t === '-' || t === 'нет' || t === 'пропустить' || t === 'пропуск';
}

export function nextStep(current) {
  const i = STEP_ORDER.indexOf(current);
  if (i < 0 || i >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[i + 1];
}

/** Текст панели формы + подсказка текущего шага. */
export function msgOrderFormPanel(draft, step) {
  const prompt = PROMPTS[step] || '';
  return [
    '🚕 Оформление заказа',
    '',
    '📍 **Откуда**',
    `Адрес: ${line(draft.from_address)}`,
    `Дом, подъезд: ${line(draft.from_building)}`,
    '',
    '📍 **Куда**',
    `Адрес: ${line(draft.to_address)}`,
    `Дом, подъезд: ${line(draft.to_building)}`,
    '',
    '💬 **Комментарий водителю**',
    line(draft.comment),
    '',
    '————————',
    prompt.replace(/\*\*/g, ''),
    '',
    '«❌ Отменить» — выйти из формы.',
  ].join('\n');
}

/** Текст заказа для водителей и БД. */
export function formatOrderText(draft) {
  const comment = (draft.comment || '').trim();
  return [
    '📍 Откуда',
    `Адрес: ${line(draft.from_address)}`,
    `Дом, подъезд: ${line(draft.from_building)}`,
    '',
    '📍 Куда',
    `Адрес: ${line(draft.to_address)}`,
    `Дом, подъезд: ${line(draft.to_building)}`,
    '',
    '💬 Комментарий водителю',
    comment ? comment : '—',
  ].join('\n');
}

export function draftFieldForStep(step) {
  switch (step) {
    case FORM_STEP.FROM_ADDRESS:
      return 'from_address';
    case FORM_STEP.FROM_BUILDING:
      return 'from_building';
    case FORM_STEP.TO_ADDRESS:
      return 'to_address';
    case FORM_STEP.TO_BUILDING:
      return 'to_building';
    case FORM_STEP.COMMENT:
      return 'comment';
    default:
      return null;
  }
}
