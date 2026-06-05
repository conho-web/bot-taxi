/** Подписи кнопок (ВК при нажатии шлёт их как текст сообщения). */
export const BTN = {
  ORDER: '🚕 Заказать такси',
  REPEAT_ORDER: '🔁 Повторить заказ',
  PRICES: '💰 Цены',
  DRIVER: '🚗 Я водитель',
  PROFILE: '👤 Профиль водителя',
  EDIT_DRIVER: '✏️ Изменить позывной',
  LOGOUT_DRIVER: '🚪 Выйти из водителей',
  HELP: '❓ Помощь',
  ADMIN: '⚙️ Админ',
  WAITING: '⏳ Ожидаю',
  MY_TRIPS: '📋 Мои поездки',
  FINISH_ORDER: '🏁 Завершить заказ',
  CANCEL_FORM: '❌ Отменить',
  CANCEL_SEARCH: '❌ Отменить поиск',
};

export const DRIVER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
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
  if (t === BTN.REPEAT_ORDER) return 'repeat_order';
  if (t === BTN.DRIVER) return 'driver';
  if (t === BTN.PROFILE) return 'profile';
  if (t === BTN.EDIT_DRIVER) return 'edit_driver';
  if (t === BTN.LOGOUT_DRIVER) return 'logout_driver';
  if (/^⏳ Ожидаю #\d+$/.test(t)) return 'waiting';
  if (/^🏁 Завершить #\d+$/.test(t)) return 'finish_order';
  if (t === BTN.WAITING) return 'waiting';
  if (t === BTN.MY_TRIPS) return 'my_trips';
  if (t === BTN.FINISH_ORDER) return 'finish_order';
  if (t === BTN.CANCEL_FORM) return 'cancel_form';
  if (t === BTN.CANCEL_SEARCH) return 'cancel_search';
  return null;
}

export function passengerPhase(order) {
  if (!order) return 'idle';
  if (order.status === ORDER_STATUS.NEW) return 'searching';
  if (order.status === ORDER_STATUS.PENDING) return 'offer';
  if (order.status === ORDER_STATUS.CONFIRMED) return 'trip';
  return 'idle';
}

export function msgOrderSearching(orderId, isRepeat = false) {
  const lines = [`🆔 Заказ #${orderId} оформлен`];
  if (isRepeat) {
    lines.push('', '🔁 Повтор предыдущего маршрута — отправлен водителям.');
  }
  lines.push(
    '',
    '🔍 Ищем водителя. Как только кто-то ответит — пришлём предложение сюда.',
    'Ожидайте сообщение в этом диалоге.',
  );
  return lines.join('\n');
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

export function msgDriversChatTaken(orderId, callsign, etaPhrase = null) {
  const eta = etaPhrase ? `\n⏱ ${etaPhrase}` : '';
  return (
    `🚕 Заказ #${orderId} — взял ${callsign}${eta}\n\n` +
    `Переписка с пассажиром — только в личных сообщениях бота (не в этой беседе).`
  );
}

export function msgDriversChatPassengerCancelled(orderId) {
  return `🚕 Заказ #${orderId}\n\n❌ Пассажир отменил заказ.`;
}

export function msgDriverUseDmAfterTake(orderId, callsign, etaPhrase, activeCount = 0) {
  const lines = [
    `Вы взяли заказ #${orderId} (${callsign}).`,
    `Пассажиру: ${etaPhrase}`,
    '',
    'Ожидайте «Да, едем» от пассажира.',
    'Можно брать другие заказы в беседе — они встанут в очередь после текущего.',
  ];
  if (activeCount > 0) {
    lines.push(
      '',
      `📋 Всего активных: ${activeCount + 1}. Сейчас в работе — самый ранний. «📋 Мои поездки» — очередь.`,
    );
  }
  return lines.join('\n');
}

export function msgDriverCustomEtaPrompt(orderId) {
  return [
    `✏️ Заказ #${orderId} — своё время подачи`,
    '',
    'Напишите одним сообщением в этот диалог:',
    '• число минут: 15, 25, 40',
    '• или текст: через полчаса, к 18:30',
    '',
    'Отмена: «📋 Мои поездки» или «❓ Помощь»',
  ].join('\n');
}

export function msgDriverTripDm(orderId, callsign, currentOrderId = orderId) {
  if (orderId !== currentOrderId) {
    return [
      `✅ Пассажир подтвердил заказ #${orderId}.`,
      '',
      `Сейчас в работе заказ #${currentOrderId} — сначала завершите его.`,
      `#${orderId} в очереди. «📋 Мои поездки» — статус.`,
      '',
      `Позывной: ${callsign}`,
    ].join('\n');
  }
  return [
    `🚕 Поездка по заказу #${orderId}`,
    '',
    'Пассажир подтвердил. Пишите пассажиру здесь (просто текст).',
    `«⏳ Ожидаю #${orderId}» — вы на месте (один раз).`,
    `«🏁 Завершить #${orderId}» — закрыть поездку.`,
    'Новые заказы в беседе — встанут в очередь после текущего.',
    '«📋 Мои поездки» — очередь и кнопки управления.',
    '',
    `Позывной: ${callsign}`,
  ].join('\n');
}

export function msgDriverTripsPanel(orders, currentId) {
  const lines = ['📋 Мои поездки', ''];
  if (!orders.length) {
    lines.push('Нет активных заказов. Новые — в беседе водителей.');
    return lines.join('\n');
  }

  const current = orders.find((o) => o.id === currentId) || orders[0];
  const queued = orders.filter((o) => o.id !== current.id);

  lines.push(`🔵 Сейчас: заказ #${current.id}`);
  if (current.status === ORDER_STATUS.CONFIRMED) {
    lines.push(
      Number(current.driver_waiting_sent)
        ? '   Поездка · «Ожидаю» уже отправлено'
        : '   Поездка · можно отправить «Ожидаю»',
    );
  } else {
    lines.push(
      `   Ждём «Да, едем» от пассажира${current.eta_phrase ? ` · ${current.eta_phrase}` : ''}`,
    );
  }

  if (queued.length) {
    lines.push('', `🔒 В очереди (после #${current.id}):`);
    for (const o of queued) {
      let status = '';
      if (o.status === ORDER_STATUS.CONFIRMED) {
        status = 'поездка подтверждена';
      } else {
        status = `ждём пассажира${o.eta_phrase ? ` · ${o.eta_phrase}` : ''}`;
      }
      lines.push(`   #${o.id} — ${status}`);
    }
    lines.push('', `Следующий заказ откроется после завершения #${current.id}.`);
  }

  if (current.status === ORDER_STATUS.CONFIRMED) {
    lines.push(
      '',
      `Кнопки ниже — только для заказа #${current.id}.`,
      'Сообщение пассажиру: просто текст в этот диалог.',
    );
  } else {
    lines.push(
      '',
      'Управление поездкой откроется после «Да, едем» по текущему заказу.',
      'Новые заказы в беседе (~3-5 / ~10 / ~20 / Своё время) — попадут в очередь.',
    );
  }
  return lines.join('\n');
}

export function msgDriverNotCurrentOrder(currentId, actionOrderId) {
  return [
    `Сейчас в работе заказ #${currentId}.`,
    `Заказ #${actionOrderId} в очереди — сначала завершите текущий.`,
    '«📋 Мои поездки» — статус очереди.',
  ].join('\n');
}

export function msgDriverOrderFinishedNext(finishedId, nextId, queueSize) {
  const lines = [
    `✅ Заказ #${finishedId} завершён.`,
    '',
    `🔵 Сейчас в работе: заказ #${nextId}.`,
  ];
  if (queueSize > 1) {
    lines.push(`В очереди ещё ${queueSize - 1}. «📋 Мои поездки» — список.`);
  }
  return lines.join('\n');
}

export function msgPassengerDriverWaiting(orderId, callsign) {
  const who = callsign ? `«${callsign}»` : 'Водитель';
  return [
    `🆔 Заказ #${orderId}`,
    '',
    `⏳ ${who} на месте и ожидает вас.`,
    'Выходите к машине, при необходимости напишите в этот диалог.',
  ].join('\n');
}

export function msgDriverWaitingSent(orderId, autoFinishedIds = []) {
  const lines = [`✓ Пассажиру заказа #${orderId} отправлено «Ожидаю».`];
  if (autoFinishedIds.length) {
    lines.push('', `Завершены предыдущие: ${autoFinishedIds.map((id) => `#${id}`).join(', ')}`);
  }
  return lines.join('\n');
}

export function msgDriverFinishOrder(orderId) {
  return [
    `✅ Вы завершили заказ #${orderId}.`,
    '',
    'Пассажир уведомлён. Можете брать следующие заказы в беседе водителей.',
  ].join('\n');
}

export function msgActiveOrderBlocks(action) {
  if (action === 'order' || action === 'repeat_order') {
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
  if (status === DRIVER_STATUS.BLOCKED) {
    lines.push('🚫 Статус: заблокирован администратором.');
    lines.push('Заказы недоступны. По вопросам — к администратору сервиса.');
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

export function msgDriverBlocked() {
  return [
    '🚫 Ваш аккаунт водителя заблокирован администратором.',
    '',
    'Принимать заказы нельзя. По вопросам обращайтесь к администратору.',
  ].join('\n');
}

export function msgDriverUnblocked(callsign) {
  return [
    `✅ Блокировка снята. Вы снова можете работать как «${callsign}».`,
    '',
    'Заказы — в беседе водителей.',
  ].join('\n');
}

export function msgAdminMenu(pendingCount, approvedCount = 0, blockedCount = 0) {
  return [
    '⚙️ Админ-панель',
    '',
    `Заявок на рассмотрении: ${pendingCount}`,
    `Активных водителей: ${approvedCount}`,
    `Заблокировано: ${blockedCount}`,
    '',
    '• Заявки — одобрить / отклонить',
    '• Блокировка — список водителей или по VK id',
    '• Цены — изменить prices.txt',
  ].join('\n');
}

export function helpTextCommunity(
  isRegisteredDriver,
  callsign,
  phase = 'idle',
  isPendingDriver = false,
  isBlockedDriver = false,
) {
  const lines = ['🚕 Справка', ''];

  if (phase === 'searching') {
    lines.push('🔍 Идёт поиск водителя. Ждите ответа в этом диалоге.');
    lines.push('«❌ Отменить поиск» — отменить заказ до ответа водителя.');
  } else if (phase === 'offer') {
    lines.push('Подтвердите поездку кнопками «Да, едем» / «Отмена» над этим меню.');
  } else if (phase === 'trip') {
    lines.push('💬 Вы в диалоге с водителем — пишите сюда.');
    lines.push('🏁 Завершить поездку может только водитель.');
  } else if (isBlockedDriver) {
    lines.push('🚫 Аккаунт водителя заблокирован. Заказы недоступны.');
  } else if (isPendingDriver) {
    lines.push('⏳ Заявка водителя на рассмотрении. Заказы пока недоступны.');
  } else if (isRegisteredDriver) {
    lines.push('🚗 Вы водитель — заказы в беседе водителей (кнопки ~3-5 / ~10 / ~20 мин).');
    lines.push('Переписка с пассажиром и завершение поездки — в личке с ботом.');
    lines.push('«👤 Профиль водителя» — позывной и выход из водителей.');
  } else {
    lines.push('👤 Пассажир: «🚕 Заказать такси» → форма (откуда / куда / комментарий).');
    lines.push('🔁 «Повторить заказ» — снова отправить последний маршрут водителям.');
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
    '• Новый заказ — ~3-5 / ~10 / ~20 мин или «Своё время».',
    '• Можно брать несколько заказов — они встают в очередь.',
    '• Сначала всегда текущий (самый ранний), остальные ждут.',
    '• После взятия здесь только обновится статус — кто взял.',
    '• Переписка и «Ожидаю» / «Завершить» — в личке с ботом.',
    '• «📋 Мои поездки» — очередь и кнопки для текущего заказа.',
  ];

  if (isRegisteredDriver) {
    lines.splice(3, 0, `• Ваш позывной: «${callsign}»`);
  } else {
    lines.splice(3, 0, '• Регистрация: ЛС бота → «🚗 Я водитель».');
  }

  return lines.join('\n');
}
