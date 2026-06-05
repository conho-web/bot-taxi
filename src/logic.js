import { createAdminApi, isAdmin } from './admin.js';
import { config } from './config.js';
import {
  etaPhraseFromPreset,
  formatCustomEtaPhrase,
  passengerOfferEtaLine,
} from './driverEta.js';
import { readPricesMessage } from './prices.js';
import {
  DRIVER_STATUS,
  helpTextCommunity,
  helpTextDriversChat,
  isMenuButtonText,
  msgActiveOrderBlocks,
  msgDriverFinishOrder,
  msgDriverBlocked,
  msgDriverCustomEtaPrompt,
  msgDriverNotCurrentOrder,
  msgDriverOrderFinishedNext,
  msgDriverPendingRegistration,
  msgDriverProfile,
  msgDriverTripDm,
  msgDriverTripsPanel,
  msgDriverWaitingSent,
  msgDriverUseDmAfterTake,
  msgPassengerDriverWaiting,
  msgDriversChatPassengerCancelled,
  msgDriversChatTaken,
  msgOrderCancelled,
  msgOrderFinished,
  msgPassengerOffer,
  msgPassengerOfferResolved,
  msgOrderSearching,
  msgOrderTrip,
  ORDER_STATUS,
  passengerPhase,
  uiActionFromMessage,
} from './ui.js';
import {
  addUserToChat,
  answerCallbackError,
  answerCallbackEvent,
  blockedDriverKeyboard,
  chatIdFromPeer,
  communityPeerForUser,
  driversChatKeyboard,
  driversOrderKeyboard,
  driverPendingKeyboard,
  driverProfileKeyboard,
  driverPendingWorkKeyboard,
  driverTripKeyboard,
  driverTripsInlineKeyboard,
  EMPTY_INLINE_KEYBOARD,
  getChatInviteLink,
  passengerConfirmKeyboard,
  passengerDuringOrderKeyboard,
  passengerIdleKeyboard,
  passengerMultiActiveKeyboard,
  passengerSearchingKeyboard,
  passengerOrderFormKeyboard,
  pendingDriverKeyboard,
  registeredDriverKeyboard,
  randomId,
  userPeerForSend,
  vkMethod,
} from './vk.js';
import {
  draftFieldForStep,
  formatOrderText,
  FORM_STEP,
  isSkipComment,
  msgOrderFormPanel,
  nextStep,
} from './orderForm.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createWebhookRouter(db) {
  const getDriver = db.prepare('SELECT * FROM drivers WHERE user_id = ?');
  const insertDriverPending = db.prepare(`
    INSERT INTO drivers (user_id, callsign, created_at, status)
    VALUES (@user_id, @callsign, @created_at, 'pending')
  `);
  const updateDriverCallsign = db.prepare(
    'UPDATE drivers SET callsign = ? WHERE user_id = ?',
  );
  const setDriverStatus = db.prepare('UPDATE drivers SET status = ? WHERE user_id = ?');
  const listPendingDrivers = db.prepare(
    "SELECT * FROM drivers WHERE status = 'pending' ORDER BY created_at ASC",
  );
  const listApprovedDrivers = db.prepare(
    "SELECT * FROM drivers WHERE status = 'approved' ORDER BY callsign ASC",
  );
  const listBlockedDrivers = db.prepare(
    "SELECT * FROM drivers WHERE status = 'blocked' ORDER BY callsign ASC",
  );
  const deleteDriver = db.prepare('DELETE FROM drivers WHERE user_id = ?');

  const insertOrder = db.prepare(`
    INSERT INTO orders (passenger_peer_id, passenger_user_id, status, order_text, created_at, updated_at, drivers_chat_message_id)
    VALUES (@passenger_peer_id, @passenger_user_id, 'new', @order_text, @created_at, @updated_at, NULL)
  `);

  const updateOrderMessageId = db.prepare(
    'UPDATE orders SET drivers_chat_message_id = ?, updated_at = ? WHERE id = ?',
  );
  const updatePassengerOfferMessageId = db.prepare(
    'UPDATE orders SET passenger_offer_message_id = ?, updated_at = ? WHERE id = ?',
  );

  const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');

  const takeOrder = db.transaction((orderId, driverUserId, etaPhrase, now) => {
    const u = db
      .prepare(
        `UPDATE orders SET status = 'pending_passenger', driver_user_id = ?, eta_phrase = ?, updated_at = ?
         WHERE id = ? AND status = 'new'`,
      )
      .run(driverUserId, etaPhrase, now, orderId);
    return u.changes === 1;
  });

  const setOrderCancelled = db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`,
  );

  const cancelOrderSearch = db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = ?
     WHERE id = ? AND passenger_user_id = ? AND status = 'new'`,
  );

  const setOrderConfirmed = db.prepare(
    `UPDATE orders SET status = 'confirmed', updated_at = ? WHERE id = ?`,
  );

  const setOrderCompleted = db.prepare(
    `UPDATE orders SET status = 'completed', updated_at = ? WHERE id = ?`,
  );

  const getSession = db.prepare('SELECT * FROM driver_sessions WHERE user_id = ?');
  const upsertSession = db.prepare(`
    INSERT INTO driver_sessions (user_id, mode, context_order_id)
    VALUES (@user_id, @mode, @context_order_id)
    ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, context_order_id = excluded.context_order_id
  `);
  const clearSession = db.prepare('DELETE FROM driver_sessions WHERE user_id = ?');

  const getOrderDraft = db.prepare('SELECT * FROM order_drafts WHERE user_id = ?');
  const upsertOrderDraft = db.prepare(`
    INSERT INTO order_drafts (
      user_id, step, from_address, from_building, to_address, to_building, comment, peer_id
    )
    VALUES (
      @user_id, @step, @from_address, @from_building, @to_address, @to_building, @comment, @peer_id
    )
    ON CONFLICT(user_id) DO UPDATE SET
      step = excluded.step,
      from_address = excluded.from_address,
      from_building = excluded.from_building,
      to_address = excluded.to_address,
      to_building = excluded.to_building,
      comment = excluded.comment,
      peer_id = excluded.peer_id
  `);
  const clearOrderDraft = db.prepare('DELETE FROM order_drafts WHERE user_id = ?');

  const activeOrderForPassenger = db.prepare(`
    SELECT * FROM orders
    WHERE passenger_user_id = ? AND status IN ('new', 'pending_passenger', 'confirmed')
    ORDER BY id DESC LIMIT 1
  `);

  const listPassengerActiveOrders = db.prepare(`
    SELECT * FROM orders
    WHERE passenger_user_id = ? AND status IN ('new', 'pending_passenger', 'confirmed')
    ORDER BY id ASC
  `);

  const setDriverWaitingSent = db.prepare(
    'UPDATE orders SET driver_waiting_sent = 1, updated_at = ? WHERE id = ?',
  );

  const getLastPassengerOrder = db.prepare(`
    SELECT order_text FROM orders
    WHERE passenger_user_id = ?
    ORDER BY id DESC LIMIT 1
  `);

  const listDriverActiveOrders = db.prepare(`
    SELECT * FROM orders
    WHERE driver_user_id = ? AND status IN ('pending_passenger', 'confirmed')
    ORDER BY id ASC
  `);

  function driverConfirmedOrders(userId) {
    return listDriverActiveOrders
      .all(userId)
      .filter((o) => o.status === ORDER_STATUS.CONFIRMED);
  }

  function driverHasActiveOrders(userId) {
    return listDriverActiveOrders.all(userId).length > 0;
  }

  /** Текущий заказ водителя — самый ранний активный (FIFO). */
  function getDriverCurrentOrder(userId) {
    const orders = listDriverActiveOrders.all(userId);
    return orders[0] ?? null;
  }

  function syncDriverCurrentFocus(userId) {
    const current = getDriverCurrentOrder(userId);
    upsertSession.run({
      user_id: userId,
      mode: 'idle',
      context_order_id: current?.id ?? null,
    });
  }

  function isDriverCurrentOrder(userId, orderId) {
    const current = getDriverCurrentOrder(userId);
    return !!(current && current.id === orderId);
  }

  /** #12 текст → заказ 12; иначе фокусная поездка */
  function parseDriverRelayText(text) {
    const m = (text || '').trim().match(/^#(\d+)\s*(.*)$/s);
    if (!m) return { orderId: null, body: (text || '').trim() };
    return { orderId: Number(m[1]), body: (m[2] || '').trim() };
  }

  function resolveDriverRelayOrder(driverUserId, orderId, body) {
    const current = getDriverCurrentOrder(driverUserId);
    if (!current || current.status !== ORDER_STATUS.CONFIRMED) return null;
    if (orderId) {
      return orderId === current.id ? current : null;
    }
    if (!body) return null;
    return current;
  }

  function allowMultiPassengerOrders() {
    return config.multiplePassengerOrders;
  }

  function passengerActiveOrders(userId) {
    return listPassengerActiveOrders.all(userId);
  }

  function passengerHasActiveOrders(userId) {
    return passengerActiveOrders(userId).length > 0;
  }

  function passengerSearchingOrders(userId) {
    return passengerActiveOrders(userId).filter((o) => o.status === ORDER_STATUS.NEW);
  }

  function passengerLatestSearching(userId) {
    const list = passengerSearchingOrders(userId);
    return list.length ? list[list.length - 1] : null;
  }

  function passengerConfirmedOrders(userId) {
    return passengerActiveOrders(userId).filter(
      (o) => o.status === ORDER_STATUS.CONFIRMED && o.driver_user_id,
    );
  }

  function getPrimaryPassengerOrder(userId) {
    if (!allowMultiPassengerOrders()) {
      return activeOrderForPassenger.get(userId);
    }
    const orders = passengerActiveOrders(userId);
    if (!orders.length) return null;
    const session = getSession.get(userId);
    if (session?.context_order_id) {
      const found = orders.find((o) => o.id === session.context_order_id);
      if (found) return found;
    }
    return orders[orders.length - 1];
  }

  function setPassengerFocus(userId, orderId) {
    upsertSession.run({
      user_id: userId,
      mode: 'idle',
      context_order_id: orderId ?? null,
    });
  }

  function resolvePassengerRelayOrder(userId, orderId, body) {
    const confirmed = passengerConfirmedOrders(userId);
    if (!confirmed.length) return null;
    if (orderId) return confirmed.find((o) => o.id === orderId) ?? null;
    if (!body) return null;
    return getPrimaryPassengerOrder(userId);
  }

  function passengerMultiKeyboard(userId) {
    const adm = keyboardIsAdmin(userId);
    return passengerMultiActiveKeyboard(
      adm,
      passengerSearchingOrders(userId).length > 0,
      canRepeatLastOrder(userId),
    );
  }

  function driverWorkKeyboard(userId) {
    const current = getDriverCurrentOrder(userId);
    if (current?.status === ORDER_STATUS.CONFIRMED) {
      return driverTripKeyboardForUser(userId);
    }
    if (driverHasActiveOrders(userId)) {
      return driverPendingWorkKeyboard();
    }
    return registeredDriverKeyboard(keyboardIsAdmin(userId));
  }

  function driverTripKeyboardForUser(userId) {
    const current = getDriverCurrentOrder(userId);
    if (!current || current.status !== ORDER_STATUS.CONFIRMED) {
      return driverPendingWorkKeyboard();
    }
    const showWaiting = !Number(current.driver_waiting_sent);
    return driverTripKeyboard(
      current.id,
      config.simpleDriverFlow ? false : config.showDriverFinishButton,
      showWaiting,
    );
  }

  async function sendPeer(peerId, text, extra = {}) {
    await vkMethod('messages.send', {
      peer_id: peerId,
      message: text,
      random_id: randomId(),
      ...extra,
    });
  }

  async function sendDriverDm(driverUserId, text, extra = {}) {
    let keyboard = extra.keyboard;
    if (!keyboard && driverHasActiveOrders(driverUserId)) {
      keyboard = driverWorkKeyboard(driverUserId);
    } else if (!keyboard) {
      keyboard = dmKeyboardForUser(driverUserId);
    }
    await sendPeer(userPeerForSend(driverUserId), text, {
      keyboard,
      random_id: randomId(),
    });
  }

  function isApprovedDriver(userId) {
    return getDriver.get(userId)?.status === DRIVER_STATUS.APPROVED;
  }

  function isPendingDriver(userId) {
    return getDriver.get(userId)?.status === DRIVER_STATUS.PENDING;
  }

  function isBlockedDriver(userId) {
    return getDriver.get(userId)?.status === DRIVER_STATUS.BLOCKED;
  }

  function keyboardIsAdmin(userId) {
    return isAdmin(userId, config);
  }

  function canRepeatLastOrder(userId) {
    if (!allowMultiPassengerOrders() && activeOrderForPassenger.get(userId)) return false;
    if (getOrderDraft.get(userId)) return false;
    if (isApprovedDriver(userId)) return false;
    const last = getLastPassengerOrder.get(userId);
    return !!(last?.order_text || '').trim();
  }

  /** Главное меню, когда нет заказа, формы и активной поездки. */
  function idleMenuKeyboard(userId) {
    const adm = keyboardIsAdmin(userId);
    if (isBlockedDriver(userId)) return blockedDriverKeyboard(adm);
    if (isApprovedDriver(userId)) return registeredDriverKeyboard(adm);
    if (isPendingDriver(userId)) return pendingDriverKeyboard(adm);
    return passengerIdleKeyboard(adm, canRepeatLastOrder(userId));
  }

  function passengerKeyboard(userId, order) {
    const phase = passengerPhase(order);
    const adm = keyboardIsAdmin(userId);
    if (phase === 'idle') return idleMenuKeyboard(userId);
    if (phase === 'searching') return passengerSearchingKeyboard(adm);
    return passengerDuringOrderKeyboard(adm);
  }

  function isUserDmIdle(userId) {
    if (passengerHasActiveOrders(userId)) return false;
    if (driverHasActiveOrders(userId)) return false;
    if (getOrderDraft.get(userId)) return false;
    const session = getSession.get(userId);
    if (session?.mode === 'register_callsign') return false;
    if (session?.mode === 'admin_set_prices') return false;
    if (session?.mode === 'admin_block_id') return false;
    if (session?.mode === 'driver_eta_custom') return false;
    return true;
  }

  function dmKeyboardForUser(userId, { order = null, override = null } = {}) {
    const adm = keyboardIsAdmin(userId);
    if (override) return override;
    if (getOrderDraft.get(userId)) return passengerOrderFormKeyboard(adm);
    const session = getSession.get(userId);
    if (session?.mode === 'register_callsign') return passengerIdleKeyboard(adm);
    if (allowMultiPassengerOrders() && passengerHasActiveOrders(userId)) {
      return passengerMultiKeyboard(userId);
    }
    const passengerOrder = order ?? getPrimaryPassengerOrder(userId);
    if (passengerOrder) return passengerKeyboard(userId, passengerOrder);
    if (driverHasActiveOrders(userId)) {
      return driverWorkKeyboard(userId);
    }
    return idleMenuKeyboard(userId);
  }

  async function sendToPassenger(peerId, userId, text, order = null, keyboardOverride) {
    await sendPeer(peerId, text, {
      keyboard: dmKeyboardForUser(userId, { order, override: keyboardOverride }),
      random_id: randomId(),
    });
  }

  async function sendIdleMenu(peerId, userId, text) {
    await sendToPassenger(peerId, userId, text, null, idleMenuKeyboard(userId));
  }

  async function notifyPassengerAfterOrderClosed(peerId, userId, text) {
    if (allowMultiPassengerOrders() && passengerHasActiveOrders(userId)) {
      await sendToPassenger(peerId, userId, text, getPrimaryPassengerOrder(userId));
    } else {
      await sendIdleMenu(peerId, userId, text);
    }
  }

  function hasOrderDraft(userId) {
    return !!getOrderDraft.get(userId);
  }

  async function startOrderForm(peerId, userId) {
    upsertOrderDraft.run({
      user_id: userId,
      step: FORM_STEP.FROM_ADDRESS,
      from_address: null,
      from_building: null,
      to_address: null,
      to_building: null,
      comment: null,
      peer_id: peerId,
    });
    const draft = getOrderDraft.get(userId);
    await sendToPassenger(
      peerId,
      userId,
      msgOrderFormPanel(draft, FORM_STEP.FROM_ADDRESS),
      null,
      passengerOrderFormKeyboard(),
    );
  }

  async function cancelOrderForm(peerId, userId) {
    clearOrderDraft.run(userId);
    await sendIdleMenu(
      peerId,
      userId,
      'Оформление заказа отменено. Выберите действие кнопкой ниже.',
    );
  }

  async function publishNewOrder(peerId, userId, orderText, { isRepeat = false } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const info = insertOrder.run({
      passenger_peer_id: peerId,
      passenger_user_id: userId,
      order_text: orderText,
      created_at: now,
      updated_at: now,
    });

    const orderId = Number(info.lastInsertRowid);
    const order = getOrder.get(orderId);
    try {
      await postOrderToDrivers(order);
      await sendToPassenger(peerId, userId, msgOrderSearching(orderId, isRepeat), order);
    } catch (e) {
      console.error('[order] не удалось отправить в беседу водителей:', e.message, {
        driversPeerId: config.driversPeerId,
        vk: e.vk,
      });
      await sendToPassenger(
        peerId,
        userId,
        `Заказ #${orderId} сохранён, но не удалось опубликовать водителям. Проверьте DRIVERS_PEER_ID и что бот в беседе.`,
        order,
      );
    }
    return orderId;
  }

  async function submitOrderFromDraft(peerId, userId, draft) {
    const orderText = formatOrderText(draft);
    clearOrderDraft.run(userId);
    await publishNewOrder(peerId, userId, orderText);
  }

  async function repeatLastOrder(peerId, userId) {
    const last = getLastPassengerOrder.get(userId);
    const orderText = (last?.order_text || '').trim();
    if (!orderText) {
      await sendIdleMenu(peerId, userId, 'Нет предыдущего заказа для повтора.');
      return;
    }
    await publishNewOrder(peerId, userId, orderText, { isRepeat: true });
  }

  async function handleOrderFormInput(peerId, userId, text) {
    const draft = getOrderDraft.get(userId);
    if (!draft) return false;

    const step = draft.step;
    const field = draftFieldForStep(step);
    if (!field) {
      clearOrderDraft.run(userId);
      return false;
    }

    let value = text;
    if (step === FORM_STEP.COMMENT && isSkipComment(text)) {
      value = '';
    } else if (!(value || '').trim()) {
      await sendToPassenger(
        peerId,
        userId,
        'Введите значение или нажмите «❌ Отменить».',
        null,
        passengerOrderFormKeyboard(),
      );
      return true;
    }

    const updated = {
      user_id: userId,
      step,
      from_address: draft.from_address,
      from_building: draft.from_building,
      to_address: draft.to_address,
      to_building: draft.to_building,
      comment: draft.comment,
      peer_id: draft.peer_id ?? peerId,
    };
    updated[field] = (value || '').trim();

    const next = nextStep(step);
    if (!next) {
      await submitOrderFromDraft(peerId, userId, updated);
      return true;
    }

    updated.step = next;
    upsertOrderDraft.run(updated);
    const fresh = getOrderDraft.get(userId);
    await sendToPassenger(
      peerId,
      userId,
      msgOrderFormPanel(fresh, next),
      null,
      passengerOrderFormKeyboard(),
    );
    return true;
  }

  /** @deprecated */
  async function sendCommunity(peerId, text, order = null) {
    await sendToPassenger(peerId, null, text, order);
  }

  async function sendDriversChat(text, extra = {}) {
    await sendPeer(config.driversPeerId, text, {
      keyboard: driversChatKeyboard(),
      ...extra,
    });
  }

  function driverInfo(userId) {
    const d = getDriver.get(userId);
    return {
      registered: d?.status === DRIVER_STATUS.APPROVED,
      pending: d?.status === DRIVER_STATUS.PENDING,
      blocked: d?.status === DRIVER_STATUS.BLOCKED,
      callsign: d?.callsign ?? '',
      status: d?.status ?? null,
    };
  }

  async function sendPricesMessage(peerId, userId, order = null) {
    await sendToPassenger(peerId, userId, readPricesMessage(), order);
  }

  async function replyHelpCommunity(replyPeerId, userId) {
    const { registered, pending, blocked, callsign } = driverInfo(userId);
    const active = getPrimaryPassengerOrder(userId);
    const phase = allowMultiPassengerOrders() && passengerActiveOrders(userId).length > 1
      ? 'idle'
      : passengerPhase(active);
    const lines = [helpTextCommunity(registered, callsign, phase, pending, blocked)];
    if (allowMultiPassengerOrders()) {
      const cnt = passengerActiveOrders(userId).length;
      lines.push('', 'Можно оформить несколько заказов подряд (несколько машин).');
      if (cnt > 1) {
        lines.push(`Активных заказов: ${cnt}. Сообщение водителю: #номер текст`);
      }
    }
    await sendToPassenger(replyPeerId, userId, lines.join('\n'), active);
  }

  async function finishDriverOrder(order, driverUserId, { silent = false } = {}) {
    const fresh = getOrder.get(order.id);
    if (!fresh || fresh.driver_user_id !== driverUserId) return;
    if (!silent) {
      const current = getDriverCurrentOrder(driverUserId);
      if (!current || fresh.id !== current.id) {
        if (current) {
          await sendDriverDm(driverUserId, msgDriverNotCurrentOrder(current.id, fresh.id));
        }
        return;
      }
    }
    if (fresh.status !== ORDER_STATUS.CONFIRMED) {
      await sendDriverDm(
        driverUserId,
        'Завершить поездку можно только после подтверждения пассажиром «Да, едем».',
      );
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    setOrderCompleted.run(now, fresh.id);

    await notifyPassengerAfterOrderClosed(
      fresh.passenger_peer_id,
      fresh.passenger_user_id,
      msgOrderFinished(fresh.id),
    );

    const remaining = listDriverActiveOrders.all(driverUserId);
    if (remaining.length > 0) {
      syncDriverCurrentFocus(driverUserId);
      if (!silent) {
        const next = remaining[0];
        await sendDriverDm(
          driverUserId,
          msgDriverOrderFinishedNext(fresh.id, next.id, remaining.length),
          { keyboard: driverWorkKeyboard(driverUserId) },
        );
      }
    } else {
      clearSession.run(driverUserId);
      if (!silent) {
        await sendDriverDm(driverUserId, msgDriverFinishOrder(fresh.id), {
          keyboard: registeredDriverKeyboard(keyboardIsAdmin(driverUserId)),
        });
      }
    }
  }

  async function notifyDriverWaiting(driverUserId, order) {
    const fresh = getOrder.get(order.id);
    if (!fresh || fresh.driver_user_id !== driverUserId) return;

    const current = getDriverCurrentOrder(driverUserId);
    if (!current || fresh.id !== current.id) {
      await sendDriverDm(
        driverUserId,
        current
          ? msgDriverNotCurrentOrder(current.id, fresh.id)
          : 'Сейчас нет активной поездки для «Ожидаю».',
      );
      return;
    }
    if (fresh.status !== ORDER_STATUS.CONFIRMED) {
      await sendDriverDm(driverUserId, '«Ожидаю» доступно только в активной поездке после «Да, едем».');
      return;
    }
    if (Number(fresh.driver_waiting_sent)) {
      await sendDriverDm(
        driverUserId,
        `«Ожидаю» по заказу #${fresh.id} уже отправлено.`,
      );
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    setDriverWaitingSent.run(now, fresh.id);

    const driver = getDriver.get(driverUserId);
    await sendPeer(fresh.passenger_peer_id, msgPassengerDriverWaiting(fresh.id, driver?.callsign), {
      keyboard: passengerDuringOrderKeyboard(),
      random_id: randomId(),
    });

    syncDriverCurrentFocus(driverUserId);

    const autoFinished = [];
    if (config.simpleDriverFlow && listDriverActiveOrders.all(driverUserId).length <= 1) {
      const toFinish = driverConfirmedOrders(driverUserId).filter((o) => o.id !== fresh.id);
      for (const other of toFinish) {
        await finishDriverOrder(other, driverUserId, { silent: true });
        autoFinished.push(other.id);
      }
    }

    await sendDriverDm(driverUserId, msgDriverWaitingSent(fresh.id, autoFinished), {
      keyboard: driverTripKeyboardForUser(driverUserId),
    });
  }

  async function replyHelpDriversChat(userId) {
    const { registered, callsign } = driverInfo(userId);
    await sendDriversChat(helpTextDriversChat(registered, callsign));
  }

  async function sendDriverTripsPanel(driverUserId, peerId = null) {
    const orders = listDriverActiveOrders.all(driverUserId);
    const current = getDriverCurrentOrder(driverUserId);
    syncDriverCurrentFocus(driverUserId);
    const outPeer = peerId || userPeerForSend(driverUserId);
    const inline = driverTripsInlineKeyboard(
      current?.status === ORDER_STATUS.CONFIRMED ? current : null,
      !config.simpleDriverFlow && config.showDriverFinishButton,
    );
    const panelExtra = { random_id: randomId() };
    if (inline) panelExtra.keyboard = inline;
    await sendPeer(outPeer, msgDriverTripsPanel(orders, current?.id), panelExtra);
    const hint =
      current?.status === ORDER_STATUS.CONFIRMED
        ? `Управление заказом #${current.id} — кнопками ниже.`
        : current
          ? `Сейчас в работе заказ #${current.id}. Дождитесь ответа пассажира.`
          : 'Нет активных заказов.';
    await sendPeer(outPeer, hint, {
      keyboard: driverWorkKeyboard(driverUserId),
      random_id: randomId(),
    });
  }

  async function assignOrderToDriver(orderId, driverId, etaPhrase) {
    const driver = getDriver.get(driverId);
    if (!driver || driver.status !== DRIVER_STATUS.APPROVED) return 'driver';

    const order = getOrder.get(orderId);
    if (!order || order.status !== ORDER_STATUS.NEW) return 'unavailable';

    const now = Math.floor(Date.now() / 1000);
    const ok = takeOrder(orderId, driverId, etaPhrase, now);
    if (!ok) return 'taken';

    const fresh = getOrder.get(orderId);
    const activeCount = listDriverActiveOrders.all(driverId).length - 1;

    await sendPassengerOffer(fresh, passengerOfferEtaLine(driver.callsign, etaPhrase));

    await editDriversOrderMessage(
      fresh,
      msgDriversChatTaken(fresh.id, driver.callsign, etaPhrase),
      EMPTY_INLINE_KEYBOARD,
    );

    await sendDriverDm(
      driverId,
      msgDriverUseDmAfterTake(fresh.id, driver.callsign, etaPhrase, Math.max(0, activeCount)),
    );
    return 'ok';
  }

  async function replyHelpToUser(userId, peerId) {
    if (isDriversChat(peerId)) {
      await replyHelpDriversChat(userId);
      return;
    }
    const outPeer = Number(peerId) > 0 ? peerId : userPeerForSend(userId);
    await replyHelpCommunity(outPeer, userId);
  }

  function parsePayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isDriversChat(peerId) {
    return Number(peerId) === config.driversPeerId;
  }

  // ЛС пользователя с сообществом: peer_id = user_id или 2000000000+user_id (большое число)
  function isUserToCommunityDm(peerId, fromId) {
    const u = Number(fromId);
    const p = Number(peerId);
    if (u <= 0) return false;
    if (p === u) return true;
    if (p === communityPeerForUser(u)) return true;
    return false;
  }

  /** Беседа ВК: peer_id = 2000000000 + маленький chat_id (1, 2, …), не user_id. */
  function isLikelyGroupChatPeer(peerId) {
    const p = Number(peerId);
    if (p < 2_000_000_000) return false;
    const local = p - 2_000_000_000;
    return local > 0 && local < 1_000_000;
  }

  async function postOrderToDrivers(order) {
    const text =
      `🆕 Заказ #${order.id}\n` +
      `📝 ${order.order_text}\n\n` +
      `Нажмите кнопку, чтобы принять заказ.`;

    const messageId = await vkMethod('messages.send', {
      peer_id: config.driversPeerId,
      message: text,
      random_id: randomId(),
      keyboard: driversOrderKeyboard(order.id),
    });

    const now = Math.floor(Date.now() / 1000);
    updateOrderMessageId.run(Number(messageId), now, order.id);
    console.log('[order] опубликован в беседе водителей', {
      orderId: order.id,
      driversPeerId: config.driversPeerId,
      messageId,
    });

  }

  async function editDriversOrderMessage(order, newText, keyboard) {
    if (!order.drivers_chat_message_id) return;
    const params = {
      peer_id: config.driversPeerId,
      message_id: order.drivers_chat_message_id,
      message: newText,
    };
    if (keyboard !== undefined) params.keyboard = keyboard;
    await vkMethod('messages.edit', params);
  }

  async function cancelPassengerSearch(order, passengerUserId) {
    const now = Math.floor(Date.now() / 1000);
    const changed = cancelOrderSearch.run(now, order.id, passengerUserId).changes;
    if (!changed) {
      const fresh = getOrder.get(order.id);
      if (fresh?.status === ORDER_STATUS.PENDING) {
        return 'pending';
      }
      if (fresh?.status === ORDER_STATUS.CONFIRMED) {
        return 'confirmed';
      }
      return 'gone';
    }

    const fresh = getOrder.get(order.id);
    try {
      await editDriversOrderMessage(
        fresh,
        msgDriversChatPassengerCancelled(fresh.id),
        EMPTY_INLINE_KEYBOARD,
      );
    } catch (e) {
      console.warn('[order] не удалось обновить пост в беседе водителей:', e.message, e.vk);
    }

    await notifyPassengerAfterOrderClosed(
      fresh.passenger_peer_id,
      fresh.passenger_user_id,
      msgOrderCancelled(fresh.id),
    );
    return 'ok';
  }

  async function sendPassengerOffer(order, offerLine) {
    const text = msgPassengerOffer(order.id, offerLine);
    const base = {
      message: text,
      random_id: randomId(),
      keyboard: passengerConfirmKeyboard(order.id),
    };
    let messageId;
    try {
      messageId = await vkMethod('messages.send', {
        user_id: order.passenger_user_id,
        ...base,
      });
    } catch {
      messageId = await vkMethod('messages.send', {
        peer_id: order.passenger_peer_id,
        ...base,
      });
    }
    const now = Math.floor(Date.now() / 1000);
    updatePassengerOfferMessageId.run(Number(messageId), now, order.id);
    return Number(messageId);
  }

  async function clearPassengerConfirmButtons(order, resolvedText) {
    if (!order.passenger_offer_message_id) return;
    const editBase = {
      message_id: order.passenger_offer_message_id,
      message: resolvedText,
      keyboard: EMPTY_INLINE_KEYBOARD,
    };
    const attempts = [
      { user_id: order.passenger_user_id, ...editBase },
      { peer_id: order.passenger_peer_id, ...editBase },
    ];
    for (const params of attempts) {
      try {
        await vkMethod('messages.edit', params);
        return;
      } catch (e) {
        console.warn('[order] edit offer (убрать кнопки)', {
          orderId: order.id,
          err: e.message,
          vk: e.vk,
        });
      }
    }
  }

  /**
   * peer_id для messages.send в тот же диалог с пользователем (ВК даёт разные форматы peer_id).
   */
  function passengerDialogPeerId(msg) {
    const p = Number(msg.peer_id);
    if (Number.isFinite(p) && p > 0) return p;
    return userPeerForSend(msg.from_id);
  }

  async function inviteDriverToChat(userId) {
    const chatId = chatIdFromPeer(config.driversPeerId);
    if (!chatId) return { added: false, link: config.driversChatInviteLink || null };

    try {
      await addUserToChat(chatId, userId);
      return { added: true, link: null };
    } catch (e) {
      console.warn('[register] addChatUser:', e.message, e.vk?.error_code);
    }

    try {
      const link = await getChatInviteLink(config.driversPeerId);
      if (link) return { added: false, link };
    } catch (e) {
      console.warn('[register] getInviteLink:', e.message, e.vk?.error_code);
    }

    return { added: false, link: config.driversChatInviteLink || null };
  }

  const adminApi = createAdminApi({
    config,
    db,
    getDriver,
    listPendingDrivers,
    listApprovedDrivers,
    listBlockedDrivers,
    setDriverStatus,
    deleteDriver,
    getSession,
    upsertSession,
    clearSession,
    sendPeer,
    sendToPassenger,
    inviteDriverToChat,
    userPeerForSend,
    answerCallbackEvent,
  });

  async function completeDriverRegistration(fromId, callsign, replyPeerId) {
    const now = Math.floor(Date.now() / 1000);
    clearSession.run(fromId);
    const existing = getDriver.get(fromId);

    if (existing?.status === DRIVER_STATUS.BLOCKED) {
      await sendToPassenger(replyPeerId, fromId, msgDriverBlocked(), null);
      return;
    }

    if (existing?.status === DRIVER_STATUS.APPROVED) {
      updateDriverCallsign.run(callsign, fromId);
      await sendToPassenger(
        replyPeerId,
        fromId,
        `Позывной обновлён: «${callsign}».`,
        null,
      );
      return;
    }

    if (existing?.status === DRIVER_STATUS.PENDING) {
      updateDriverCallsign.run(callsign, fromId);
      await adminApi.notifyNewDriverApplication(fromId, callsign);
      await sendToPassenger(
        replyPeerId,
        fromId,
        msgDriverPendingRegistration(callsign),
        null,
      );
      return;
    }

    try {
      insertDriverPending.run({ user_id: fromId, callsign, created_at: now });
    } catch (e) {
      console.error('[register] insert driver:', e.message);
      await sendToPassenger(replyPeerId, fromId, 'Не удалось сохранить заявку. Попробуйте позже.', null);
      return;
    }

    await adminApi.notifyNewDriverApplication(fromId, callsign);
    await sendToPassenger(
      replyPeerId,
      fromId,
      msgDriverPendingRegistration(callsign),
      null,
    );
  }

  async function sendDriverProfile(replyPeerId, userId) {
    const driver = getDriver.get(userId);
    if (!driver) {
      await sendToPassenger(
        replyPeerId,
        userId,
        'Вы пока не зарегистрированы как водитель. Нажмите «🚗 Я водитель» и отправьте позывной.',
        null,
      );
      return;
    }

    await sendPeer(replyPeerId, msgDriverProfile(driver.callsign, driver.status), {
      keyboard: driverProfileKeyboard(),
      random_id: randomId(),
    });
  }

  async function logoutDriver(replyPeerId, userId) {
    const driver = getDriver.get(userId);
    if (!driver) {
      await sendToPassenger(replyPeerId, userId, 'Вы не зарегистрированы как водитель.', null);
      return;
    }

    if (driver.status === DRIVER_STATUS.BLOCKED) {
      await sendToPassenger(
        replyPeerId,
        userId,
        'Аккаунт заблокирован. Выйти из профиля нельзя — обратитесь к администратору.',
        null,
      );
      return;
    }

    if (driverHasActiveOrders(userId)) {
      await sendToPassenger(
        replyPeerId,
        userId,
        'Нельзя выйти из водителей, пока есть активные заказы. Завершите поездки в личке с ботом.',
        null,
      );
      return;
    }

    deleteDriver.run(userId);
    clearSession.run(userId);
    await sendToPassenger(
      replyPeerId,
      userId,
      'Вы вышли из аккаунта водителя. Заказы в водительской беседе больше не будут относиться к вашему профилю.',
      null,
    );
  }

  async function handleMessageNew(body) {
    // В Callback object бывает { message: {...} } или сразу объект сообщения
    const rawObj = body.object;
    const msg = rawObj?.message ?? rawObj;
    if (!msg || typeof msg !== 'object') {
      console.warn('[message_new] нет сообщения в object', {
        hasObject: !!rawObj,
        objectKeys: rawObj && typeof rawObj === 'object' ? Object.keys(rawObj) : [],
      });
      return;
    }
    if (msg.out === 1) return;

    const peerId = msg.peer_id;
    const fromId = msg.from_id;
    const text = (msg.text || '').trim();
    const msgPayload = msg.payload;

    const uiAction = uiActionFromMessage(text, msgPayload);

    if (uiAction === 'help') {
      if (isDriversChat(peerId)) await replyHelpDriversChat(fromId);
      else if (isUserToCommunityDm(peerId, fromId)) {
        await replyHelpCommunity(passengerDialogPeerId(msg), fromId);
      } else await replyHelpToUser(fromId, peerId);
      return;
    }

    console.log('[message_new]', {
      peerId,
      fromId,
      textPreview: text.slice(0, 120),
      driversChat: isDriversChat(peerId),
    });

    if (isDriversChat(peerId)) {
      const isDriver = isApprovedDriver(fromId);
      if (!isDriver && text && !isMenuButtonText(text)) {
        await sendDriversChat(
          [
            'Это беседа водителей — здесь только кнопки на заказах.',
            '👤 Пассажир: в ЛС сообщества → «🚕 Заказать такси».',
            '🚗 Водитель: в ЛС → «🚗 Я водитель» и позывной.',
            'Переписка с пассажиром — в личке с ботом, не в этой беседе.',
          ].join('\n'),
        );
      }
      return;
    }

    if (!isUserToCommunityDm(peerId, fromId)) {
      const u = Number(fromId);
      if (isLikelyGroupChatPeer(peerId) && text && !text.startsWith('/')) {
        const lines = [
          '👤 Заказ такси — только в личных сообщениях сообществу.',
          'Откройте страницу группы → «Написать сообществу» (не эту беседу).',
          '',
          '🚗 Водителям: заказы появляются здесь после оформления пассажиром в ЛС группы.',
        ];
        if (Number(peerId) !== config.driversPeerId) {
          lines.push(
            '',
            `⚙️ Админ: в .env поставьте DRIVERS_PEER_ID=${peerId} (сейчас ${config.driversPeerId}).`,
          );
          console.warn(
            `[message_new] peer_id беседы ${peerId} ≠ DRIVERS_PEER_ID=${config.driversPeerId}. Обновите .env и перезапустите бота.`,
          );
        }
        await sendToPassenger(peerId, fromId, lines.join('\n'), null);
        return;
      }
      console.warn('[message_new] пропуск: не ЛС с сообществом', {
        peerId,
        fromId,
        expectedPeerForDm: u > 0 ? communityPeerForUser(u) : null,
        orUserId: u > 0 ? u : null,
      });
      return;
    }

    const outPeer = passengerDialogPeerId(msg);

    if (isAdmin(fromId, config)) {
      const handled = await adminApi.handleAdminMessage(fromId, outPeer, text, uiAction);
      if (handled) return;
    }

    const activeEarly = getPrimaryPassengerOrder(fromId);

    if (uiAction === 'prices') {
      await sendPricesMessage(outPeer, fromId, activeEarly);
      return;
    }

    if (uiAction === 'repeat_order') {
      if (activeEarly && !allowMultiPassengerOrders()) {
        await sendToPassenger(outPeer, fromId, msgActiveOrderBlocks('repeat_order'), activeEarly);
        return;
      }
      if (isApprovedDriver(fromId)) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Вы водитель — заказы принимайте в беседе водителей.',
          null,
        );
        return;
      }
      if (!canRepeatLastOrder(fromId)) {
        await sendIdleMenu(
          outPeer,
          fromId,
          'Повтор доступен после первого оформленного заказа. Нажмите «🚕 Заказать такси».',
        );
        return;
      }
      await repeatLastOrder(outPeer, fromId);
      return;
    }

    const orderDraft = getOrderDraft.get(fromId);

    if (uiAction === 'cancel_form') {
      if (orderDraft) await cancelOrderForm(outPeer, fromId);
      else await sendIdleMenu(outPeer, fromId, 'Сейчас нет формы заказа для отмены.');
      return;
    }

    if (uiAction === 'cancel_search') {
      const order = allowMultiPassengerOrders()
        ? passengerLatestSearching(fromId)
        : activeEarly;
      if (!order || order.status !== ORDER_STATUS.NEW) {
        await sendToPassenger(
          outPeer,
          fromId,
          order?.status === ORDER_STATUS.PENDING
            ? 'Водитель уже откликнулся — нажмите «Отмена» под предложением выше.'
            : 'Сейчас нет активного поиска для отмены.',
          order,
        );
        return;
      }
      const result = await cancelPassengerSearch(order, fromId);
      if (result === 'pending') {
        await sendToPassenger(
          outPeer,
          fromId,
          'Водитель уже откликнулся — нажмите «Отмена» под предложением выше.',
          getOrder.get(order.id),
        );
      } else if (result !== 'ok') {
        await sendIdleMenu(outPeer, fromId, 'Заказ уже завершён или отменён.');
      }
      return;
    }

    if (orderDraft) {
      if (uiAction === 'prices') {
        await sendPricesMessage(outPeer, fromId);
        return;
      }
      if (uiAction === 'help') {
        await replyHelpCommunity(outPeer, fromId);
        return;
      }
      if (uiAction === 'order') {
        await startOrderForm(outPeer, fromId);
        return;
      }
      if (
        uiAction === 'driver' ||
        uiAction === 'profile' ||
        uiAction === 'edit_driver' ||
        uiAction === 'logout_driver'
      ) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Сначала завершите или отмените оформление заказа («❌ Отменить»).',
          null,
          passengerOrderFormKeyboard(),
        );
        return;
      }
      if (text && !isMenuButtonText(text)) {
        await handleOrderFormInput(outPeer, fromId, text);
        return;
      }
      await sendToPassenger(
        outPeer,
        fromId,
        msgOrderFormPanel(orderDraft, orderDraft.step),
        null,
        passengerOrderFormKeyboard(),
      );
      return;
    }

    const dmSessionEarly = getSession.get(fromId);
    if (
      dmSessionEarly?.mode === 'driver_eta_custom' &&
      text &&
      !isMenuButtonText(text) &&
      uiAction !== 'my_trips'
    ) {
      const orderId = dmSessionEarly.context_order_id;
      const phrase = formatCustomEtaPhrase(text);
      if (!phrase) {
        await sendDriverDm(
          fromId,
          'Не понял время. Пример: 15, 25 мин, через 40 минут, к 18:30',
        );
        return;
      }
      upsertSession.run({ user_id: fromId, mode: 'idle', context_order_id: orderId });
      const result = await assignOrderToDriver(orderId, fromId, phrase);
      if (result === 'taken') {
        await sendDriverDm(fromId, 'Заказ уже взял другой водитель.');
      } else if (result === 'unavailable') {
        await sendDriverDm(fromId, 'Заказ уже недоступен.');
      }
      return;
    }

    if (uiAction === 'my_trips') {
      if (!driverHasActiveOrders(fromId) && !isApprovedDriver(fromId)) {
        await sendToPassenger(outPeer, fromId, 'Раздел для водителей с активными заказами.', null);
        return;
      }
      if (dmSessionEarly?.mode === 'driver_eta_custom') {
        upsertSession.run({ user_id: fromId, mode: 'idle', context_order_id: null });
      }
      await sendDriverTripsPanel(fromId, outPeer);
      return;
    }

    if (uiAction === 'waiting') {
      const current = getDriverCurrentOrder(fromId);
      if (!current || current.status !== ORDER_STATUS.CONFIRMED) {
        await sendDriverDm(
          fromId,
          current
            ? `Заказ #${current.id}: сначала дождитесь «Да, едем» от пассажира.`
            : 'Сейчас нет активной поездки. «Ожидаю» — после подтверждения пассажиром.',
        );
        return;
      }
      await notifyDriverWaiting(fromId, current);
      return;
    }

    if (uiAction === 'finish_order') {
      const current = getDriverCurrentOrder(fromId);
      if (!current || current.status !== ORDER_STATUS.CONFIRMED) {
        await sendDriverDm(
          fromId,
          current
            ? `Заказ #${current.id}: завершить можно после «Да, едем» от пассажира.`
            : 'Сейчас нет активной поездки для завершения.',
        );
        return;
      }
      await finishDriverOrder(current, fromId);
      return;
    }

    if (
      !allowMultiPassengerOrders() &&
      activeEarly &&
      (uiAction === 'order' ||
        uiAction === 'repeat_order' ||
        uiAction === 'driver' ||
        uiAction === 'profile' ||
        uiAction === 'edit_driver' ||
        uiAction === 'logout_driver')
    ) {
      await sendToPassenger(
        outPeer,
        fromId,
        msgActiveOrderBlocks(uiAction),
        activeEarly,
      );
      return;
    }

    if (uiAction === 'profile') {
      await sendDriverProfile(outPeer, fromId);
      return;
    }

    if (uiAction === 'edit_driver') {
      if (!getDriver.get(fromId)) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Вы пока не зарегистрированы как водитель. Нажмите «🚗 Я водитель».',
          null,
        );
        return;
      }
      upsertSession.run({
        user_id: fromId,
        mode: 'register_callsign',
        context_order_id: null,
      });
      await sendPeer(outPeer, 'Напишите новый позывной одним сообщением.', {
        keyboard: driverProfileKeyboard(),
      });
      return;
    }

    if (uiAction === 'logout_driver') {
      await logoutDriver(outPeer, fromId);
      return;
    }

    if (uiAction === 'driver') {
      if (getDriver.get(fromId)) {
        await sendDriverProfile(outPeer, fromId);
        return;
      }
      upsertSession.run({
        user_id: fromId,
        mode: 'register_callsign',
        context_order_id: null,
      });
      await sendToPassenger(
        outPeer,
        fromId,
        'Напишите позывной одним сообщением.\nПример: Белая Киа 211',
        null,
      );
      return;
    }

    const dmSession = getSession.get(fromId);

    const driverCurrentEarly = getDriverCurrentOrder(fromId);
    if (
      driverCurrentEarly?.status === ORDER_STATUS.CONFIRMED &&
      text &&
      !isMenuButtonText(text) &&
      !(activeEarly && activeEarly.passenger_user_id === fromId)
    ) {
      const { orderId, body } = parseDriverRelayText(text);
      if (!body) {
        await sendDriverDm(
          fromId,
          orderId
            ? `Сейчас в работе заказ #${driverCurrentEarly.id}. Сообщения для #${orderId} — после него.`
            : 'Напишите текст для пассажира текущего заказа.',
        );
        return;
      }
      const target = resolveDriverRelayOrder(fromId, orderId, body);
      if (!target) {
        const current = getDriverCurrentOrder(fromId);
        await sendDriverDm(
          fromId,
          orderId && current
            ? msgDriverNotCurrentOrder(current.id, orderId)
            : 'Нет активной поездки для сообщения.',
        );
        return;
      }
      syncDriverCurrentFocus(fromId);
      await sendPeer(target.passenger_peer_id, `Водитель (заказ #${target.id}):\n${body}`, {
        keyboard: passengerDuringOrderKeyboard(),
        random_id: randomId(),
      });
      return;
    }

    if (driverHasActiveOrders(fromId) && text && !isMenuButtonText(text)) {
      const current = getDriverCurrentOrder(fromId);
      await sendDriverDm(
        fromId,
        current
          ? `Заказ #${current.id}: ожидайте «Да, едем» от пассажира. Остальные в очереди — после него.`
          : 'Ожидайте подтверждения «Да, едем» от пассажира.',
        { keyboard: driverWorkKeyboard(fromId) },
      );
      return;
    }

    const regSession = dmSession;
    if (regSession?.mode === 'register_callsign' && text && !isMenuButtonText(text)) {
      if (passengerHasActiveOrders(fromId)) {
        await sendToPassenger(
          outPeer,
          fromId,
          msgActiveOrderBlocks('driver'),
          getPrimaryPassengerOrder(fromId),
        );
        clearSession.run(fromId);
        return;
      }
      await completeDriverRegistration(fromId, text, outPeer);
      return;
    }

    if (uiAction === 'order') {
      if (isApprovedDriver(fromId)) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Вы зарегистрированы как водитель. Заказы такси принимайте в беседе водителей.',
          null,
        );
        return;
      }
      if (activeEarly && !allowMultiPassengerOrders()) {
        await sendToPassenger(
          outPeer,
          fromId,
          msgActiveOrderBlocks('order'),
          activeEarly,
        );
        return;
      }
      await startOrderForm(outPeer, fromId);
      return;
    }

    if (allowMultiPassengerOrders() && passengerHasActiveOrders(fromId) && text && !isMenuButtonText(text)) {
      const { orderId, body } = parseDriverRelayText(text);
      const target = resolvePassengerRelayOrder(fromId, orderId, body);
      if (target) {
        setPassengerFocus(fromId, target.id);
        await sendDriverDm(
          target.driver_user_id,
          `Заказ #${target.id} — пассажир:\n${body}`,
        );
        await sendToPassenger(
          outPeer,
          fromId,
          `✓ Сообщение по заказу #${target.id} отправлено водителю.`,
          target,
        );
        return;
      }
      const pending = passengerActiveOrders(fromId).filter((o) => o.status === ORDER_STATUS.PENDING);
      if (pending.length) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Есть заказы без ответа — нажмите «Да, едем» или «Отмена» под предложением водителя.',
          getPrimaryPassengerOrder(fromId),
        );
        return;
      }
    }

    const active = getPrimaryPassengerOrder(fromId);
    if (active && !allowMultiPassengerOrders()) {
      if (isMenuButtonText(text)) {
        if (uiAction === 'prices') {
          await sendPricesMessage(outPeer, fromId, active);
          return;
        }
        if (uiAction === 'help') {
          await replyHelpCommunity(outPeer, fromId);
          return;
        }
        return;
      }

      if (active.status === ORDER_STATUS.CONFIRMED && active.driver_user_id) {
        setPassengerFocus(fromId, active.id);
        await sendDriverDm(
          active.driver_user_id,
          `Заказ #${active.id} — пассажир:\n${text || '(без текста)'}`,
        );
        await sendToPassenger(
          outPeer,
          fromId,
          '✓ Сообщение отправлено водителю.',
          active,
        );
        return;
      }

      if (active.status === ORDER_STATUS.PENDING) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Сначала нажмите «Да, едем» или «Отмена» под предложением водителя выше.',
          active,
        );
        return;
      }

      if (active.status === ORDER_STATUS.NEW) {
        if (uiAction === 'cancel_search') {
          const result = await cancelPassengerSearch(active, fromId);
          if (result === 'pending') {
            await sendToPassenger(
              outPeer,
              fromId,
              'Водитель уже откликнулся — нажмите «Отмена» под предложением выше.',
              getOrder.get(active.id),
            );
          }
          return;
        }
        await sendToPassenger(
          outPeer,
          fromId,
          '🔍 Ищем водителя. Как только кто-то ответит — пришлём сюда. Или «❌ Отменить поиск».',
          active,
        );
        return;
      }
    }

    if (allowMultiPassengerOrders() && passengerHasActiveOrders(fromId) && isMenuButtonText(text)) {
      if (uiAction === 'help') {
        await replyHelpCommunity(outPeer, fromId);
        return;
      }
      if (uiAction === 'order' || uiAction === 'repeat_order' || uiAction === 'cancel_search') {
        return;
      }
    }

    if (!text || isMenuButtonText(text)) {
      if (isUserDmIdle(fromId)) {
        const hint = isApprovedDriver(fromId)
          ? 'Выберите действие: профиль водителя или помощь. Заказы — в беседе водителей.'
          : isPendingDriver(fromId)
            ? 'Заявка водителя на рассмотрении. Можно заказать такси или смотреть цены.'
            : 'Выберите действие: заказать такси, цены, стать водителем или помощь.';
        await sendIdleMenu(outPeer, fromId, hint);
      } else {
        await sendToPassenger(outPeer, fromId, 'Используйте кнопки в диалоге выше или «❓ Помощь».', null);
      }
      return;
    }

    if (isApprovedDriver(fromId)) {
      await sendIdleMenu(
        outPeer,
        fromId,
        'Вы водитель — оформление заказов недоступно. Отвечайте на заказы в беседе водителей.',
      );
      return;
    }

    await sendIdleMenu(
      outPeer,
      fromId,
      'Чтобы оформить поездку, нажмите «🚕 Заказать такси».',
    );
  }

  async function handleEtaPress(ev, payload) {
    const orderId = Number(payload.o);
    const kind = String(payload.t || '');
    const driverId = ev.user_id;

    const driver = getDriver.get(driverId);
    if (!driver) {
      await answerCallbackError(ev, 'Сначала: ЛС сообщества → «🚗 Я водитель»');
      return;
    }
    if (driver.status !== DRIVER_STATUS.APPROVED) {
      const msg =
        driver.status === DRIVER_STATUS.PENDING
          ? 'Ожидайте одобрения администратора'
          : driver.status === DRIVER_STATUS.BLOCKED
            ? 'Аккаунт заблокирован'
            : 'Вы не одобрены как водитель';
      await answerCallbackError(ev, msg);
      return;
    }

    const etaPhrase = etaPhraseFromPreset(kind === '20' ? 20 : kind === '10' ? 10 : 3);
    if (!etaPhrase) {
      await answerCallbackError(ev, 'Неизвестный вариант');
      return;
    }

    const result = await assignOrderToDriver(orderId, driverId, etaPhrase);
    if (result === 'taken') {
      await answerCallbackError(ev, 'Заказ уже взят');
      return;
    }
    if (result === 'unavailable') {
      await answerCallbackError(ev, 'Заказ недоступен');
      return;
    }
    if (result === 'driver') {
      await answerCallbackError(ev, 'Вы не одобрены как водитель');
      return;
    }

    await answerCallbackEvent(ev);
  }

  async function handleEtaCustomPress(ev, payload) {
    const orderId = Number(payload.o);
    const driverId = ev.user_id;

    const driver = getDriver.get(driverId);
    if (!driver) {
      await answerCallbackError(ev, 'Сначала: ЛС → «🚗 Я водитель»');
      return;
    }
    if (driver.status !== DRIVER_STATUS.APPROVED) {
      await answerCallbackError(ev, 'Нет доступа водителя');
      return;
    }

    const order = getOrder.get(orderId);
    if (!order || order.status !== ORDER_STATUS.NEW) {
      await answerCallbackError(ev, 'Заказ недоступен');
      return;
    }

    await answerCallbackEvent(ev, 'Напишите время в ЛС боту');

    upsertSession.run({
      user_id: driverId,
      mode: 'driver_eta_custom',
      context_order_id: orderId,
    });

    await sendPeer(userPeerForSend(driverId), msgDriverCustomEtaPrompt(orderId), {
      keyboard: driverWorkKeyboard(driverId),
      random_id: randomId(),
    });
  }

  async function handleDriverTripCallback(ev, payload) {
    const driverId = ev.user_id;
    const orderId = Number(payload.o);
    const action = String(payload.a || '');

    if (action === 'noop') {
      await answerCallbackEvent(ev);
      return;
    }

    const order = getOrder.get(orderId);
    if (!order || order.driver_user_id !== driverId) {
      await answerCallbackError(ev, 'Не ваш заказ');
      return;
    }

    if (action === 'df') {
      const current = getDriverCurrentOrder(driverId);
      await answerCallbackError(
        ev,
        current
          ? `Сейчас #${current.id}. Заказ #${orderId} в очереди.`
          : 'Заказ не в работе',
      );
      return;
    }

    if (action === 'dw') {
      if (!isDriverCurrentOrder(driverId, orderId)) {
        const current = getDriverCurrentOrder(driverId);
        await answerCallbackError(
          ev,
          current ? `Сначала #${current.id}` : 'Не ваш текущий заказ',
        );
        return;
      }
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        await answerCallbackError(ev, 'Только в поездке');
        return;
      }
      await answerCallbackEvent(ev);
      await notifyDriverWaiting(driverId, order);
      return;
    }

    if (action === 'dfin') {
      if (!isDriverCurrentOrder(driverId, orderId)) {
        const current = getDriverCurrentOrder(driverId);
        await answerCallbackError(
          ev,
          current ? `Сначала #${current.id}` : 'Не ваш текущий заказ',
        );
        return;
      }
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        await answerCallbackError(ev, 'Только в поездке');
        return;
      }
      await answerCallbackEvent(ev, `Завершён #${orderId}`);
      await finishDriverOrder(order, driverId);
      return;
    }
  }

  async function handlePassengerDecision(ev, payload) {
    const orderId = Number(payload.o);
    const action = String(payload.a || '');
    const order = getOrder.get(orderId);
    if (!order || order.status !== 'pending_passenger') {
      await answerCallbackError(ev, 'Заказ уже обработан');
      return;
    }

    if (ev.user_id !== order.passenger_user_id) {
      await answerCallbackError(ev, 'Это не ваш заказ');
      return;
    }

    if (action !== 'yes' && action !== 'no') {
      await answerCallbackError(ev, 'Неизвестное действие');
      return;
    }

    await answerCallbackEvent(ev);

    const driverId = order.driver_user_id;
    if (!driverId) return;

    if (action === 'yes') {
      await clearPassengerConfirmButtons(order, msgPassengerOfferResolved(orderId, true));

      const now = Math.floor(Date.now() / 1000);
      setOrderConfirmed.run(now, orderId);
      const confirmed = getOrder.get(orderId);
      const driver = getDriver.get(driverId);
      syncDriverCurrentFocus(driverId);
      setPassengerFocus(confirmed.passenger_user_id, orderId);

      await editDriversOrderMessage(
        confirmed,
        `✅ Заказ #${orderId} — ${driver?.callsign ?? 'водитель'}, пассажир подтвердил. Поездка в личке с ботом.`,
        EMPTY_INLINE_KEYBOARD,
      );

      await sendToPassenger(
        confirmed.passenger_peer_id,
        confirmed.passenger_user_id,
        msgOrderTrip(orderId, driver?.callsign),
        confirmed,
      );
      const current = getDriverCurrentOrder(driverId);
      await sendDriverDm(
        driverId,
        msgDriverTripDm(orderId, driver?.callsign ?? 'водитель', current?.id ?? orderId),
        { keyboard: driverTripKeyboardForUser(driverId) },
      );
      return;
    }

    if (action === 'no') {
      await clearPassengerConfirmButtons(order, msgPassengerOfferResolved(orderId, false));

      const now = Math.floor(Date.now() / 1000);
      setOrderCancelled.run(now, orderId);
      await notifyPassengerAfterOrderClosed(
        order.passenger_peer_id,
        order.passenger_user_id,
        msgOrderCancelled(orderId),
      );
      if (!driverHasActiveOrders(driverId)) {
        clearSession.run(driverId);
      }
      await sendDriverDm(driverId, `Пассажир отменил заказ #${orderId}.`);
    }
  }

  async function handleMessageEvent(body) {
    const ev = body.object;
    if (!ev) return;

    const payload = parsePayload(ev.payload);
    if (!payload) return;

    if (payload.cmd === 'help' || payload.a === 'help') {
      await answerCallbackEvent(ev);
      await replyHelpToUser(ev.user_id, ev.peer_id);
      return;
    }

    if (payload.a === 'eta') {
      await handleEtaPress(ev, payload);
      return;
    }
    if (payload.a === 'eta_custom') {
      await handleEtaCustomPress(ev, payload);
      return;
    }
    if (payload.a === 'df' || payload.a === 'dw' || payload.a === 'dfin' || payload.a === 'noop') {
      await handleDriverTripCallback(ev, payload);
      return;
    }
    if (
      payload.a === 'adm_ok' ||
      payload.a === 'adm_no' ||
      payload.a === 'adm_block' ||
      payload.a === 'adm_unblock' ||
      payload.a === 'admin_pending' ||
      payload.a === 'admin_drivers' ||
      payload.a === 'admin_blocked' ||
      payload.a === 'admin_block_id' ||
      payload.a === 'admin_menu' ||
      payload.a === 'admin_prices'
    ) {
      const handled = await adminApi.handleAdminCallback(ev, payload);
      if (!handled) await answerCallbackError(ev, 'Нет доступа или неизвестное действие');
      return;
    }
    if (payload.a === 'yes' || payload.a === 'no') {
      await handlePassengerDecision(ev, payload);
    }
  }

  /**
   * Express handler
   */
  return async function webhook(req, res) {
    const body = req.body || {};
    const secretOk =
      !config.vkCallbackSecret ||
      String(body.secret ?? '') === String(config.vkCallbackSecret);

    console.log('[VK webhook]', {
      type: body.type,
      group_id: body.group_id,
      secret_ok: secretOk,
    });

    if (!secretOk) {
      console.warn(
        '[VK webhook] 403: секрет Callback не совпал. Сверь VK_CALLBACK_SECRET в .env с полем в настройках Callback API.',
      );
      res.status(403).send('forbidden');
      return;
    }

    const { type } = body;

    if (type === 'confirmation') {
      res.status(200).type('text/plain').send(config.vkConfirmation);
      return;
    }

    const silentTypes = new Set([
      'message_typing_state',
      'message_read',
      'message_reply',
      'user_block',
      'user_unblock',
    ]);

    try {
      if (type === 'message_new') {
        await handleMessageNew(body);
      } else if (type === 'message_event') {
        await handleMessageEvent(body);
      } else if (type && !silentTypes.has(type)) {
        console.log('[VK webhook] событие без обработчика:', type);
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }

    res.status(200).type('text/plain').send('ok');
  };
}
