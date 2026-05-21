/** Подписи кнопок (ВК при нажатии шлёт их как текст сообщения). */
export const BTN = {
  ORDER: '🚕 Заказать такси',
  PRICES: '💰 Цены',
  DRIVER: '🚗 Я водитель',
  PROFILE: '👤 Профиль водителя',
  EDIT_DRIVER: '✏️ Изменить позывной',
  LOGOUT_DRIVER: '🚪 Выйти из водителей',
  HELP: '❓ Помощь',
  ADMIN: '⚙️ Админ',
  FINISH_ORDER: '🏁 Завершить заказ',
  CANCEL_FORM: '❌ Отменить',
};

export const DRIVER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const MENU_TEXTS = new Set(Object.values(BTN));

export const ORDER_STATUS = {
  NEW: 'new',
  PENDING: 'pending_passenger',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

export function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isMenuButtonText(text) {
  return MENU_TEXTS.has((text || '').trim());
}

export function uiActionFromMessage(text, payloadRaw) {
  const payload = parsePayload(payloadRaw);
  if (payload?.cmd) return payload.cmd;
  if (payload?.a === 'help') return 'help';

  const t = (text || '').trim();
  if (t === BTN.HELP || /^\/help$/i.test(t) || /^\/start$/i.test(t)) return 'help';
  if (t === BTN.PRICES) return 'prices';
  if (t === BTN.ADMIN || t === '/admin') return 'admin';
  if (t === BTN.ORDER) return 'order';
  if (t === BTN.DRIVER) return 'driver';
  if (t === BTN.PROFILE) return 'profile';
  if (t === BTN.EDIT_DRIVER) return 'edit_driver';
  if (t === BTN.LOGOUT_DRIVER) return 'logout_driver';
  if (t === BTN.FINISH_ORDER) return 'finish_order';
  if (t === BTN.CANCEL_FORM) return 'cancel_form';
  return null;
}

export function passengerPhase(order) {
  if (!order) return 'idle';
  if (order.status === ORDER_STATUS.NEW) return 'searching';
  if (order.status === ORDER_STATUS.PENDING) return 'offer';
  if (order.status === ORDER_STATUS.CONFIRMED) return 'trip';
  return 'idle';
}

export function msgOrderSearching(orderId) {
  return [
    `🆔 Заказ #${orderId} оформлен`,
    '',
    '🔍 Ищем водителя. Как только кто-то ответит — пришлём предложение сюда.',
    'Ожидайте сообщение в этом диалоге.',
  ].join('\n');
}

export function msgPassengerOffer(orderId, offerLine) {
  return [
    `🆔 Заказ #${orderId}`,
    '',
    offerLine,
    '',
    'Нажмите «Да, едем» или «Отмена».',
  ].join('\n');
}

export function msgPassengerOfferResolved(orderId, accepted) {
  if (accepted) {
    return [`🆔 Заказ #${orderId}`, '', '✅ Вы подтвердили поездку.'].join('\n');
  }
  return [`🆔 Заказ #${orderId}`, '', '❌ Вы отменили заказ.'].join('\n');
}

export function msgOrderTrip(orderId, callsign) {
  const who = callsign ? `водителем (${callsign})` : 'водителем';
  return [
    `🆔 Заказ #${orderId} · поездка активна`,
    '',
    `💬 Вы в диалоге с ${who}.`,
    'Пишите сюда — сообщения уходят водителю.',
    'Водитель отвечает вам в этом же диалоге с ботом.',
    'Завершить поездку может только водитель.',
  ].join('\n');
}

export function msgOrderFinished(orderId) {
  return [
    `✅ Заказ #${orderId} завершён водителем.`,
    '',
    'Спасибо! Можете оформить новый заказ.',
  ].join('\n');
}

export function msgOrderCancelled(orderId) {
  return [
    `❌ Заказ #${orderId} отменён.`,
    '',
    'Нажмите «🚕 Заказать такси», когда будете готовы.',
  ].join('\n');
}

export function msgDriversChatTaken(orderId, callsign) {
  return (
    `🚕 Заказ #${orderId} — взял ${callsign}\n\n` +
    `Переписка с пассажиром — только в личных сообщениях бота (не в этой беседе).`
  );
}

export function msgDriverUseDmAfterTake(orderId, callsign) {
  return [
    `Вы взяли заказ #${orderId} (${callsign}).`,
    '',
    'Дальнейшая переписка с пассажиром — только здесь, в личных сообщениях бота.',
    'В беседе водителей новые сообщения пассажиру не уходят.',
    '',
    'Ожидайте подтверждения «Да, едем» от пассажира.',
  ].join('\n');
}

export function msgDriverTripDm(orderId, callsign) {
  return [
    `🚕 Поездка по заказу #${orderId}`,
    '',
    `Пассажир подтвердил. Пишите ему здесь, в личке с ботом.`,
    `Когда поездка закончена — «🏁 Завершить заказ».`,
    '',
    `Позывной: ${callsign}`,
  ].join('\n');
}

export function msgDriverFinishOrder(orderId) {
  return [
    `✅ Вы завершили заказ #${orderId}.`,
    '',
    'Пассажир уведомлён. Можете брать следующие заказы в беседе водителей.',
  ].join('\n');
}

export function msgActiveOrderBlocks(action) {
  if (action === 'order') {
    return 'Сейчас активен заказ. Дождитесь ответа водителя или его решения по поездке.';
  }
  if (action === 'driver' || action === 'profile' || action === 'edit_driver' || action === 'logout_driver') {
    return 'Сейчас у вас активный заказ как пассажир. Дождитесь завершения поездки.';
  }
  return 'Сейчас активен заказ. Используйте подсказки в диалоге.';
}

export function msgDriverProfile(callsign, status = DRIVER_STATUS.APPROVED) {
  const lines = ['👤 Профиль водителя', '', `Позывной: «${callsign}»`, ''];
  if (status === DRIVER_STATUS.PENDING) {
    lines.push('⏳ Статус: заявка на рассмотрении у администратора.');
    lines.push('После одобрения появятся заказы в беседе водителей.');
    return lines.join('\n');
  }
  lines.push('Заказы приходят в беседу водителей — там только кнопки ответа.');
  lines.push('С пассажирами общайтесь в личке с ботом после взятия заказа.');
  return lines.join('\n');
}

export function msgDriverPendingRegistration(callsign) {
  return [
    `Заявка принята: «${callsign}».`,
    '',
    '⏳ Ожидайте подтверждения администратора.',
    'Когда вас одобрят — придёт сообщение и доступ к заказам в беседе водителей.',
  ].join('\n');
}

export function msgDriverApproved(callsign) {
  return [
    `✅ Вы одобрены как водитель «${callsign}».`,
    '',
    'Можете брать заказы в беседе водителей (кнопки ~3-5 / ~10 / ~20 мин).',
  ].join('\n');
}

export function msgDriverRejected() {
  return [
    '❌ Заявка водителя отклонена.',
    '',
    'Можно подать заявку снова: «🚗 Я водитель» и новый позывной.',
  ].join('\n');
}

export function msgAdminMenu(pendingCount) {
  return [
    '⚙️ Админ-панель',
    '',
    `Заявок водителей: ${pendingCount}`,
    '• Водители — одобрить / отклонить',
    '• Цены — новый текст в prices.txt (или правьте файл на сервере)',
  ].join('\n');
}

export function helpTextCommunity(isRegisteredDriver, callsign, phase = 'idle', isPendingDriver = false) {
  const lines = ['🚕 Справка', ''];

  if (phase === 'searching') {
    lines.push('🔍 Идёт поиск водителя. Ждите ответа в этом диалоге.');
  } else if (phase === 'offer') {
    lines.push('Подтвердите поездку кнопками «Да, едем» / «Отмена» над этим меню.');
  } else if (phase === 'trip') {
    lines.push('💬 Вы в диалоге с водителем — пишите сюда.');
    lines.push('🏁 Завершить поездку может только водитель.');
  } else if (isPendingDriver) {
    lines.push('⏳ Заявка водителя на рассмотрении. Заказы пока недоступны.');
  } else if (isRegisteredDriver) {
    lines.push('🚗 Вы водитель — заказы в беседе водителей (кнопки ~3-5 / ~10 / ~20 мин).');
    lines.push('Переписка с пассажиром и завершение поездки — в личке с ботом.');
    lines.push('«👤 Профиль водителя» — позывной и выход из водителей.');
  } else {
    lines.push('👤 Пассажир: «🚕 Заказать такси» → форма (откуда / куда / комментарий).');
    lines.push('💰 «💰 Цены» — тарифы.');
    lines.push('🚗 Водитель: «🚗 Я водитель» и позывной (нужно одобрение админа).');
    lines.push('В беседе водителей — принять заказ кнопкой.');
    lines.push('Переписка с пассажиром — в личке с ботом.');
  }

  if (isRegisteredDriver) {
    lines.push('', `Ваш позывной: «${callsign}»`);
  }

  return lines.join('\n');
}

export function helpTextDriversChat(isRegisteredDriver, callsign) {
  const lines = [
    '🚕 Беседа водителей',
    '',
    '• Новый заказ — кнопки «~ 3-5 мин», «~ 10 мин», «~ 20 мин».',
    '• После взятия заказа здесь только обновится статус — кто взял.',
    '• Переписка с пассажиром — в личных сообщениях бота.',
    '• Завершить поездку водитель может только в личке с ботом.',
  ];

  if (isRegisteredDriver) {
    lines.splice(3, 0, `• Ваш позывной: «${callsign}»`);
  } else {
    lines.splice(3, 0, '• Регистрация: ЛС бота → «🚗 Я водитель».');
  }

  return lines.join('\n');
}
