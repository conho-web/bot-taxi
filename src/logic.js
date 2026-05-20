import { config } from './config.js';
import {
  helpTextCommunity,
  helpTextDriversChat,
  isMenuButtonText,
  msgActiveOrderBlocks,
  msgDriverFinishOrder,
  msgDriverProfile,
  msgDriverTripDm,
  msgDriverUseDmAfterTake,
  msgDriverUseDmCustomReply,
  msgDriversChatTaken,
  msgOrderCancelled,
  msgOrderFinished,
  msgOrderOffer,
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
  chatIdFromPeer,
  communityPeerForUser,
  driversChatKeyboard,
  driversOrderKeyboard,
  driverPendingKeyboard,
  driverTripKeyboard,
  EMPTY_INLINE_KEYBOARD,
  getChatInviteLink,
  passengerConfirmKeyboard,
  passengerDuringOrderKeyboard,
  passengerIdleKeyboard,
  registeredDriverKeyboard,
  driverProfileKeyboard,
  randomId,
  userPeerForSend,
  vkMethod,
} from './vk.js';

const ETA_TEXT = {
  3: 'примерно через 3–5 минут',
  10: 'примерно через 10 минут',
};


/**
 * @param {import('better-sqlite3').Database} db
 */
export function createWebhookRouter(db) {
  const getDriver = db.prepare('SELECT * FROM drivers WHERE user_id = ?');
  const upsertDriver = db.prepare(`
    INSERT INTO drivers (user_id, callsign, created_at)
    VALUES (@user_id, @callsign, @created_at)
    ON CONFLICT(user_id) DO UPDATE SET callsign = excluded.callsign
  `);
  const deleteDriver = db.prepare('DELETE FROM drivers WHERE user_id = ?');

  const insertOrder = db.prepare(`
    INSERT INTO orders (passenger_peer_id, passenger_user_id, status, order_text, created_at, updated_at, drivers_chat_message_id)
    VALUES (@passenger_peer_id, @passenger_user_id, 'new', @order_text, @created_at, @updated_at, NULL)
  `);

  const updateOrderMessageId = db.prepare(
    'UPDATE orders SET drivers_chat_message_id = ?, updated_at = ? WHERE id = ?',
  );

  const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');

  const takeOrder = db.transaction((orderId, driverUserId, now) => {
    const u = db
      .prepare(
        `UPDATE orders SET status = 'pending_passenger', driver_user_id = ?, updated_at = ?
         WHERE id = ? AND status = 'new'`,
      )
      .run(driverUserId, now, orderId);
    return u.changes === 1;
  });

  const setOrderCancelled = db.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`,
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

  const activeOrderForPassenger = db.prepare(`
    SELECT * FROM orders
    WHERE passenger_user_id = ? AND status IN ('new', 'pending_passenger', 'confirmed')
    ORDER BY id DESC LIMIT 1
  `);

  const activeOrderForDriver = db.prepare(`
    SELECT * FROM orders
    WHERE driver_user_id = ? AND status IN ('pending_passenger', 'confirmed')
    ORDER BY id DESC LIMIT 1
  `);

  async function sendPeer(peerId, text, extra = {}) {
    await vkMethod('messages.send', {
      peer_id: peerId,
      message: text,
      random_id: randomId(),
      ...extra,
    });
  }

  async function sendDriverDm(driverUserId, text, extra = {}) {
    await sendPeer(userPeerForSend(driverUserId), text, extra);
  }

  function passengerKeyboard(userId, order) {
    const phase = passengerPhase(order);
    if (phase === 'idle' && userId && getDriver.get(userId)) {
      return registeredDriverKeyboard();
    }
    if (phase === 'idle') return passengerIdleKeyboard();
    return passengerDuringOrderKeyboard();
  }

  function driverDmKeyboard(order) {
    if (!order) return driverProfileKeyboard();
    if (order.status === ORDER_STATUS.CONFIRMED) return driverTripKeyboard();
    if (order.status === ORDER_STATUS.PENDING) return driverPendingKeyboard();
    return driverProfileKeyboard();
  }

  async function sendToPassenger(peerId, userId, text, order = null) {
    await sendPeer(peerId, text, {
      keyboard: passengerKeyboard(userId, order),
      ...{},
    });
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
      registered: !!d,
      callsign: d?.callsign ?? '',
    };
  }

  async function replyHelpCommunity(replyPeerId, userId) {
    const { registered, callsign } = driverInfo(userId);
    const active = activeOrderForPassenger.get(userId);
    const phase = passengerPhase(active);
    await sendToPassenger(
      replyPeerId,
      userId,
      helpTextCommunity(registered, callsign, phase),
      active,
    );
  }

  async function finishDriverOrder(order, driverUserId) {
    const fresh = getOrder.get(order.id);
    if (!fresh || fresh.driver_user_id !== driverUserId) return;
    if (fresh.status !== ORDER_STATUS.CONFIRMED) {
      await sendDriverDm(
        driverUserId,
        'Завершить поездку можно только после подтверждения пассажиром «Да, едем».',
        { keyboard: driverDmKeyboard(fresh) },
      );
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    setOrderCompleted.run(now, fresh.id);
    clearSession.run(driverUserId);

    const driver = getDriver.get(driverUserId);
    const tag = driver?.callsign ?? 'Водитель';

    await editDriversOrderMessage(
      fresh,
      `✅ Заказ #${fresh.id} завершён — ${tag}.`,
      EMPTY_INLINE_KEYBOARD,
    );

    await sendToPassenger(
      fresh.passenger_peer_id,
      fresh.passenger_user_id,
      msgOrderFinished(fresh.id),
      null,
    );
    await sendDriverDm(driverUserId, msgDriverFinishOrder(fresh.id), {
      keyboard: registeredDriverKeyboard(),
    });
  }

  async function replyHelpDriversChat(userId) {
    const { registered, callsign } = driverInfo(userId);
    await sendDriversChat(helpTextDriversChat(registered, callsign));
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
      `Нажмите кнопку, чтобы ответить пассажиру.`;

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

  async function completeDriverRegistration(fromId, callsign, replyPeerId) {
    const now = Math.floor(Date.now() / 1000);
    upsertDriver.run({ user_id: fromId, callsign, created_at: now });
    clearSession.run(fromId);

    const invite = await inviteDriverToChat(fromId);
    const lines = [`Вы зарегистрированы как «${callsign}».`];

    if (invite.added) {
      lines.push('', '✅ Вас добавили в беседу водителей. Ждите заказы с кнопками ответа.');
    } else if (invite.link) {
      lines.push('', 'Вступите в беседу водителей:', invite.link);
    } else {
      lines.push('', 'Попросите админа добавить вас в беседу водителей.');
    }

    await sendToPassenger(replyPeerId, fromId, lines.join('\n'), null);
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

    await sendPeer(replyPeerId, msgDriverProfile(driver.callsign), {
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

    const driverOrder = activeOrderForDriver.get(userId);
    if (driverOrder) {
      await sendToPassenger(
        replyPeerId,
        userId,
        'Нельзя выйти из водителей, пока у вас активный заказ. Сначала завершите поездку в личке с ботом («🏁 Завершить заказ»).',
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
      const isDriver = !!getDriver.get(fromId);
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

    const activeEarly = activeOrderForPassenger.get(fromId);
    const driverOrderEarly = activeOrderForDriver.get(fromId);

    if (uiAction === 'finish_order') {
      if (!driverOrderEarly) {
        await sendToPassenger(outPeer, fromId, 'Сейчас нет активной поездки для завершения.', null);
        return;
      }
      await finishDriverOrder(driverOrderEarly, fromId);
      return;
    }

    if (
      activeEarly &&
      (uiAction === 'order' ||
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
    if (dmSession?.mode === 'custom_dm' && dmSession.context_order_id && text && !isMenuButtonText(text)) {
      await handleDriverCustomReplyInDm(fromId, text, dmSession.context_order_id);
      return;
    }

    if (
      driverOrderEarly &&
      driverOrderEarly.status === ORDER_STATUS.CONFIRMED &&
      text &&
      !isMenuButtonText(text) &&
      !(activeEarly && activeEarly.passenger_user_id === fromId)
    ) {
      await sendPeer(driverOrderEarly.passenger_peer_id, `Водитель:\n${text}`, {
        keyboard: passengerDuringOrderKeyboard(),
      });
      await sendDriverDm(fromId, '✓ Сообщение отправлено пассажиру.', {
        keyboard: driverTripKeyboard(),
      });
      return;
    }

    if (
      driverOrderEarly &&
      driverOrderEarly.status === ORDER_STATUS.PENDING &&
      text &&
      !isMenuButtonText(text)
    ) {
      await sendDriverDm(
        fromId,
        'Ожидайте подтверждения «Да, едем» от пассажира. Переписка откроется после подтверждения.',
        { keyboard: driverPendingKeyboard() },
      );
      return;
    }

    const regSession = dmSession;
    if (regSession?.mode === 'register_callsign' && text && !isMenuButtonText(text)) {
      if (activeEarly) {
        await sendToPassenger(
          outPeer,
          fromId,
          msgActiveOrderBlocks('driver'),
          activeEarly,
        );
        clearSession.run(fromId);
        return;
      }
      await completeDriverRegistration(fromId, text, outPeer);
      return;
    }

    if (uiAction === 'order') {
      if (getDriver.get(fromId)) {
        await sendToPassenger(
          outPeer,
          fromId,
          'Вы зарегистрированы как водитель. Заказы такси принимайте в беседе водителей.',
          null,
        );
        return;
      }
      await sendToPassenger(
        outPeer,
        fromId,
        'Опишите маршрут одним сообщением: откуда, куда, комментарий.',
        null,
      );
      return;
    }

    const active = activeEarly ?? activeOrderForPassenger.get(fromId);
    if (active) {
      if (isMenuButtonText(text)) {
        if (uiAction === 'help') {
          await replyHelpCommunity(outPeer, fromId);
        }
        return;
      }

      if (active.status === ORDER_STATUS.CONFIRMED && active.driver_user_id) {
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
        await sendToPassenger(
          outPeer,
          fromId,
          '🔍 Ищем водителя. Как только кто-то ответит — пришлём сюда.',
          active,
        );
        return;
      }
    }

    if (!text || isMenuButtonText(text)) {
      const hint = getDriver.get(fromId)
        ? 'Используйте «👤 Профиль водителя» или «❓ Помощь». Новые заказы — в беседе водителей.'
        : 'Нажмите «🚕 Заказать такси» и опишите маршрут, или «❓ Помощь».';
      await sendToPassenger(outPeer, fromId, hint, null);
      return;
    }

    if (getDriver.get(fromId)) {
      await sendToPassenger(
        outPeer,
        fromId,
        'Вы водитель — оформление заказов недоступно. Отвечайте на заказы в беседе водителей.',
        null,
      );
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const info = insertOrder.run({
      passenger_peer_id: outPeer,
      passenger_user_id: fromId,
      order_text: text,
      created_at: now,
      updated_at: now,
    });

    const orderId = Number(info.lastInsertRowid);
    const order = getOrder.get(orderId);
    try {
      await postOrderToDrivers(order);
      await sendToPassenger(outPeer, fromId, msgOrderSearching(orderId), order);
    } catch (e) {
      console.error('[order] не удалось отправить в беседу водителей:', e.message, {
        driversPeerId: config.driversPeerId,
        vk: e.vk,
      });
      await sendToPassenger(
        outPeer,
        fromId,
        `Заказ #${orderId} сохранён, но не удалось опубликовать водителям. Проверьте DRIVERS_PEER_ID и что бот в беседе.`,
        order,
      );
    }
  }

  async function handleDriverCustomReplyInDm(fromId, text, orderId) {
    const order = getOrder.get(orderId);
    if (!order || order.status !== ORDER_STATUS.NEW || order.driver_user_id) {
      clearSession.run(fromId);
      return;
    }
    const driver = getDriver.get(fromId);
    if (!driver) {
      clearSession.run(fromId);
      await sendDriverDm(fromId, 'Сначала зарегистрируйтесь: «🚗 Я водитель» и позывной.');
      return;
    }

    const ok = takeOrder(order.id, fromId, Math.floor(Date.now() / 1000));
    clearSession.run(fromId);
    if (!ok) {
      await sendDriverDm(fromId, `Заказ #${order.id} уже взят другим водителем.`);
      return;
    }

    const fresh = getOrder.get(order.id);
    await sendPeer(fresh.passenger_peer_id, `Водитель (${driver.callsign}) пишет:\n«${text}»`, {
      keyboard: passengerConfirmKeyboard(fresh.id),
    });
    await sendToPassenger(
      fresh.passenger_peer_id,
      fresh.passenger_user_id,
      msgOrderOffer(fresh.id),
      fresh,
    );

    await editDriversOrderMessage(
      fresh,
      msgDriversChatTaken(fresh.id, driver.callsign),
      EMPTY_INLINE_KEYBOARD,
    );
    await sendDriverDm(fromId, msgDriverUseDmAfterTake(fresh.id, driver.callsign), {
      keyboard: driverPendingKeyboard(),
    });
  }

  async function handleReplyPress(ev, orderId) {
    const driverId = ev.user_id;
    const driver = getDriver.get(driverId);
    if (!driver) {
      await answerCallbackError(ev, 'Сначала: ЛС сообщества → «🚗 Я водитель»');
      return;
    }

    const order = getOrder.get(orderId);
    if (!order || order.status !== 'new') {
      await answerCallbackError(ev, 'Заказ недоступен');
      return;
    }

    await answerCallbackEvent(ev);
    upsertSession.run({
      user_id: driverId,
      mode: 'custom_dm',
      context_order_id: orderId,
    });
    await sendDriverDm(driverId, msgDriverUseDmCustomReply(orderId), {
      keyboard: driverPendingKeyboard(),
    });
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

    const order = getOrder.get(orderId);
    if (!order || order.status !== 'new') {
      await answerCallbackError(ev, 'Заказ недоступен');
      return;
    }

    const etaKey = kind === '10' ? 10 : 3;
    const etaPhrase = ETA_TEXT[etaKey];
    if (!etaPhrase) {
      await answerCallbackError(ev, 'Неизвестный вариант');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const ok = takeOrder(orderId, driverId, now);
    if (!ok) {
      await answerCallbackError(ev, 'Заказ уже взят');
      return;
    }

    await answerCallbackEvent(ev);

    const fresh = getOrder.get(orderId);
    await sendPeer(
      fresh.passenger_peer_id,
      `Водитель (${driver.callsign}) будет у вас ${etaPhrase}.`,
      { keyboard: passengerConfirmKeyboard(fresh.id) },
    );
    await sendToPassenger(
      fresh.passenger_peer_id,
      fresh.passenger_user_id,
      msgOrderOffer(fresh.id),
      fresh,
    );

    await editDriversOrderMessage(
      fresh,
      msgDriversChatTaken(fresh.id, driver.callsign),
      EMPTY_INLINE_KEYBOARD,
    );

    await sendDriverDm(driverId, msgDriverUseDmAfterTake(fresh.id, driver.callsign), {
      keyboard: driverPendingKeyboard(),
    });
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
      const now = Math.floor(Date.now() / 1000);
      setOrderConfirmed.run(now, orderId);
      const confirmed = getOrder.get(orderId);
      const driver = getDriver.get(driverId);
      clearSession.run(driverId);

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
      await sendDriverDm(
        driverId,
        msgDriverTripDm(orderId, driver?.callsign ?? 'водитель'),
        { keyboard: driverTripKeyboard() },
      );
      return;
    }

    if (action === 'no') {
      const now = Math.floor(Date.now() / 1000);
      setOrderCancelled.run(now, orderId);
      await sendDriversChat(`Пассажир отменил заказ #${orderId}.`);
      await sendToPassenger(
        order.passenger_peer_id,
        order.passenger_user_id,
        msgOrderCancelled(orderId),
        null,
      );
      clearSession.run(driverId);
      await editDriversOrderMessage(
        order,
        `❌ Заказ #${orderId} отменён пассажиром.`,
        EMPTY_INLINE_KEYBOARD,
      );
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

    if (payload.a === 'reply') {
      await handleReplyPress(ev, Number(payload.o));
      return;
    }

    if (payload.a === 'eta') {
      await handleEtaPress(ev, payload);
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
