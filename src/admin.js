import { writePricesMessage } from './prices.js';
import { BTN, DRIVER_STATUS, msgAdminMenu, msgDriverApproved, msgDriverRejected } from './ui.js';
import { adminMenuKeyboard, adminPendingListKeyboard } from './vk.js';

export function isAdmin(userId, config) {
  return config.adminUserIds.includes(Number(userId));
}

/**
 * @param {object} ctx
 */
export function createAdminApi(ctx) {
  const {
    config,
    db,
    getDriver,
    listPendingDrivers,
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
  } = ctx;

  async function notifyAdmins(text) {
    for (const adminId of config.adminUserIds) {
      try {
        await sendPeer(userPeerForSend(adminId), text, { random_id: Math.floor(Math.random() * 2e9) });
      } catch (e) {
        console.warn('[admin] не удалось уведомить', adminId, e.message);
      }
    }
  }

  async function sendAdminMenu(peerId, adminId) {
    const pending = listPendingDrivers.all();
    await sendPeer(peerId, msgAdminMenu(pending.length), {
      keyboard: adminMenuKeyboard(pending.length),
      random_id: Math.floor(Math.random() * 2e9),
    });
  }

  async function sendPendingList(peerId) {
    const pending = listPendingDrivers.all();
    if (!pending.length) {
      await sendPeer(peerId, 'Нет заявок водителей на рассмотрении.', {
        keyboard: adminMenuKeyboard(0),
        random_id: Math.floor(Math.random() * 2e9),
      });
      return;
    }
    const lines = ['🚗 Заявки водителей:', ''];
    for (const d of pending) {
      lines.push(`• id ${d.user_id} — «${d.callsign}»`);
    }
    lines.push('', 'Нажмите кнопку под нужным водителем.');
    await sendPeer(peerId, lines.join('\n'), {
      keyboard: adminPendingListKeyboard(pending),
      random_id: Math.floor(Math.random() * 2e9),
    });
  }

  async function approveDriver(driverUserId) {
    const driver = getDriver.get(driverUserId);
    if (!driver || driver.status !== DRIVER_STATUS.PENDING) return false;

    setDriverStatus.run(DRIVER_STATUS.APPROVED, driverUserId);
    const invite = await inviteDriverToChat(driverUserId);
    const lines = [msgDriverApproved(driver.callsign)];
    if (invite.added) {
      lines.push('', '✅ Вас добавили в беседу водителей.');
    } else if (invite.link) {
      lines.push('', 'Вступите в беседу водителей:', invite.link);
    } else {
      lines.push('', 'Попросите админа добавить вас в беседу водителей.');
    }
    await sendToPassenger(userPeerForSend(driverUserId), driverUserId, lines.join('\n'), null);
    return true;
  }

  async function rejectDriver(driverUserId) {
    const driver = getDriver.get(driverUserId);
    if (!driver || driver.status !== DRIVER_STATUS.PENDING) return false;

    deleteDriver.run(driverUserId);
    clearSession.run(driverUserId);
    await sendToPassenger(
      userPeerForSend(driverUserId),
      driverUserId,
      msgDriverRejected(),
      null,
    );
    return true;
  }

  async function notifyNewDriverApplication(userId, callsign) {
    await notifyAdmins(
      [
        '🚗 Новая заявка водителя',
        `id: ${userId}`,
        `Позывной: «${callsign}»`,
        '',
        `Откройте ${BTN.ADMIN} или /admin для решения.`,
      ].join('\n'),
    );
  }

  async function handleAdminMessage(fromId, peerId, text, uiAction) {
    if (!isAdmin(fromId, config)) return false;

    const session = getSession.get(fromId);
    if (session?.mode === 'admin_set_prices' && text && text !== BTN.ADMIN && uiAction !== 'admin') {
      try {
        writePricesMessage(text);
        clearSession.run(fromId);
        await sendPeer(peerId, '✅ Цены сохранены в prices.txt. Проверьте кнопкой «💰 Цены».', {
          keyboard: adminMenuKeyboard(listPendingDrivers.all().length),
          random_id: Math.floor(Math.random() * 2e9),
        });
      } catch (e) {
        await sendPeer(peerId, `Не удалось сохранить: ${e.message}`, {
          random_id: Math.floor(Math.random() * 2e9),
        });
      }
      return true;
    }

    if (uiAction === 'admin' || text === '/admin') {
      clearSession.run(fromId);
      await sendAdminMenu(peerId, fromId);
      return true;
    }

    if (uiAction === 'admin_pending') {
      await sendPendingList(peerId);
      return true;
    }

    if (uiAction === 'admin_prices') {
      upsertSession.run({ user_id: fromId, mode: 'admin_set_prices', context_order_id: null });
      await sendPeer(
        peerId,
        [
          '✏️ Отправьте одним сообщением новый текст тарифов.',
          'Он заменит содержимое prices.txt.',
          '',
          'Отмена: снова /admin',
        ].join('\n'),
        { random_id: Math.floor(Math.random() * 2e9) },
      );
      return true;
    }

    return false;
  }

  async function handleAdminCallback(ev, payload) {
    if (!isAdmin(ev.user_id, config)) return false;

    const action = String(payload.a || '');

    if (action === 'admin_pending') {
      await answerCallbackEvent(ev);
      await sendPendingList(ev.peer_id);
      return true;
    }

    if (action === 'admin_menu') {
      await answerCallbackEvent(ev);
      await sendAdminMenu(ev.peer_id, ev.user_id);
      return true;
    }

    if (action === 'admin_prices') {
      await answerCallbackEvent(ev);
      upsertSession.run({
        user_id: ev.user_id,
        mode: 'admin_set_prices',
        context_order_id: null,
      });
      await sendPeer(
        ev.peer_id,
        'Отправьте новым сообщением текст тарифов (заменит prices.txt).',
        { random_id: Math.floor(Math.random() * 2e9) },
      );
      return true;
    }

    const targetId = Number(payload.u);
    if (!targetId) return false;

    if (action === 'adm_ok') {
      const ok = await approveDriver(targetId);
      await answerCallbackEvent(ev, ok ? 'Водитель одобрен' : 'Заявка уже обработана');
      if (ok) await sendPendingList(ev.peer_id);
      return true;
    }

    if (action === 'adm_no') {
      const ok = await rejectDriver(targetId);
      await answerCallbackEvent(ev, ok ? 'Заявка отклонена' : 'Заявка уже обработана');
      if (ok) await sendPendingList(ev.peer_id);
      return true;
    }

    return false;
  }

  return {
    notifyAdmins,
    notifyNewDriverApplication,
    sendAdminMenu,
    handleAdminMessage,
    handleAdminCallback,
    approveDriver,
    rejectDriver,
  };
}
