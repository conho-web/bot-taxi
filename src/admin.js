import { writePricesMessage } from './prices.js';
import {
  BTN,
  DRIVER_STATUS,
  msgAdminMenu,
  msgDriverApproved,
  msgDriverBlocked,
  msgDriverRejected,
  msgDriverUnblocked,
} from './ui.js';
import {
  adminBlockedListKeyboard,
  adminDriversListKeyboard,
  adminMenuKeyboard,
  adminPendingListKeyboard,
} from './vk.js';

export function isAdmin(userId, config) {
  return config.adminUserIds.includes(Number(userId));
}

/**
 * @param {object} ctx
 */
export function createAdminApi(ctx) {
  const {
    config,
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
  } = ctx;

  function menuKeyboard() {
    return adminMenuKeyboard(
      listPendingDrivers.all().length,
      listApprovedDrivers.all().length,
      listBlockedDrivers.all().length,
    );
  }

  async function notifyAdmins(text) {
    for (const adminId of config.adminUserIds) {
      try {
        await sendPeer(userPeerForSend(adminId), text, { random_id: Math.floor(Math.random() * 2e9) });
      } catch (e) {
        console.warn('[admin] не удалось уведомить', adminId, e.message);
      }
    }
  }

  async function sendAdminMenu(peerId) {
    const pending = listPendingDrivers.all();
    const approved = listApprovedDrivers.all();
    const blocked = listBlockedDrivers.all();
    await sendPeer(peerId, msgAdminMenu(pending.length, approved.length, blocked.length), {
      keyboard: menuKeyboard(),
      random_id: Math.floor(Math.random() * 2e9),
    });
  }

  async function sendPendingList(peerId) {
    const pending = listPendingDrivers.all();
    if (!pending.length) {
      await sendPeer(peerId, 'Нет заявок водителей на рассмотрении.', {
        keyboard: menuKeyboard(),
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

  async function sendApprovedDriversList(peerId) {
    const drivers = listApprovedDrivers.all();
    if (!drivers.length) {
      await sendPeer(peerId, 'Нет одобренных водителей для блокировки.', {
        keyboard: menuKeyboard(),
        random_id: Math.floor(Math.random() * 2e9),
      });
      return;
    }
    const lines = ['🚗 Одобренные водители (нажмите, чтобы заблокировать):', ''];
    for (const d of drivers) {
      lines.push(`• id ${d.user_id} — «${d.callsign}»`);
    }
    await sendPeer(peerId, lines.join('\n'), {
      keyboard: adminDriversListKeyboard(drivers),
      random_id: Math.floor(Math.random() * 2e9),
    });
  }

  async function sendBlockedDriversList(peerId) {
    const drivers = listBlockedDrivers.all();
    if (!drivers.length) {
      await sendPeer(peerId, 'Нет заблокированных водителей.', {
        keyboard: menuKeyboard(),
        random_id: Math.floor(Math.random() * 2e9),
      });
      return;
    }
    const lines = ['🚫 Заблокированные (нажмите, чтобы разблокировать):', ''];
    for (const d of drivers) {
      lines.push(`• id ${d.user_id} — «${d.callsign}»`);
    }
    await sendPeer(peerId, lines.join('\n'), {
      keyboard: adminBlockedListKeyboard(drivers),
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

  async function blockDriver(driverUserId) {
    const driver = getDriver.get(driverUserId);
    if (!driver) return 'missing';
    if (driver.status === DRIVER_STATUS.BLOCKED) return 'already';
    if (driver.status !== DRIVER_STATUS.APPROVED && driver.status !== DRIVER_STATUS.PENDING) {
      return 'invalid';
    }

    setDriverStatus.run(DRIVER_STATUS.BLOCKED, driverUserId);
    clearSession.run(driverUserId);
    await sendToPassenger(
      userPeerForSend(driverUserId),
      driverUserId,
      msgDriverBlocked(),
      null,
    );
    return 'ok';
  }

  async function unblockDriver(driverUserId) {
    const driver = getDriver.get(driverUserId);
    if (!driver || driver.status !== DRIVER_STATUS.BLOCKED) return false;

    setDriverStatus.run(DRIVER_STATUS.APPROVED, driverUserId);
    await sendToPassenger(
      userPeerForSend(driverUserId),
      driverUserId,
      msgDriverUnblocked(driver.callsign),
      null,
    );
    return true;
  }

  async function blockDriverByVkId(rawId) {
    const id = Number(String(rawId).trim().replace(/\D/g, ''));
    if (!id || id <= 0) return 'bad_id';
    return blockDriver(id);
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

    if (session?.mode === 'admin_block_id' && text && text !== BTN.ADMIN && uiAction !== 'admin') {
      const result = await blockDriverByVkId(text);
      clearSession.run(fromId);
      const replies = {
        ok: '✅ Водитель заблокирован.',
        missing: 'Водитель с таким VK id не найден в базе.',
        already: 'Уже заблокирован.',
        invalid: 'Нельзя заблокировать этого пользователя.',
        bad_id: 'Укажите числовой VK id (например 123456789).',
      };
      await sendPeer(peerId, replies[result] || 'Ошибка.', {
        keyboard: menuKeyboard(),
        random_id: Math.floor(Math.random() * 2e9),
      });
      return true;
    }

    if (session?.mode === 'admin_set_prices' && text && text !== BTN.ADMIN && uiAction !== 'admin') {
      try {
        writePricesMessage(text);
        clearSession.run(fromId);
        await sendPeer(peerId, '✅ Цены сохранены в prices.txt. Проверьте кнопкой «💰 Цены».', {
          keyboard: menuKeyboard(),
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
      await sendAdminMenu(peerId);
      return true;
    }

    if (uiAction === 'admin_pending') {
      await sendPendingList(peerId);
      return true;
    }

    if (uiAction === 'admin_drivers') {
      await sendApprovedDriversList(peerId);
      return true;
    }

    if (uiAction === 'admin_blocked') {
      await sendBlockedDriversList(peerId);
      return true;
    }

    if (uiAction === 'admin_block_id') {
      upsertSession.run({ user_id: fromId, mode: 'admin_block_id', context_order_id: null });
      await sendPeer(
        peerId,
        [
          '🔢 Отправьте VK id водителя (число из ссылки vk.com/id…).',
          'Пользователь должен быть в базе (регистрировался как водитель).',
          '',
          'Отмена: /admin',
        ].join('\n'),
        { random_id: Math.floor(Math.random() * 2e9) },
      );
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

    if (action === 'admin_drivers') {
      await answerCallbackEvent(ev);
      await sendApprovedDriversList(ev.peer_id);
      return true;
    }

    if (action === 'admin_blocked') {
      await answerCallbackEvent(ev);
      await sendBlockedDriversList(ev.peer_id);
      return true;
    }

    if (action === 'admin_block_id') {
      await answerCallbackEvent(ev);
      upsertSession.run({
        user_id: ev.user_id,
        mode: 'admin_block_id',
        context_order_id: null,
      });
      await sendPeer(
        ev.peer_id,
        'Отправьте VK id водителя числом (из vk.com/id…).',
        { random_id: Math.floor(Math.random() * 2e9) },
      );
      return true;
    }

    if (action === 'admin_menu') {
      await answerCallbackEvent(ev);
      clearSession.run(ev.user_id);
      await sendAdminMenu(ev.peer_id);
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

    if (action === 'adm_block') {
      const result = await blockDriver(targetId);
      const snack = {
        ok: 'Заблокирован',
        missing: 'Не найден',
        already: 'Уже заблокирован',
        invalid: 'Нельзя заблокировать',
      };
      await answerCallbackEvent(ev, snack[result] || 'Ошибка');
      if (result === 'ok') await sendApprovedDriversList(ev.peer_id);
      return true;
    }

    if (action === 'adm_unblock') {
      const ok = await unblockDriver(targetId);
      await answerCallbackEvent(ev, ok ? 'Разблокирован' : 'Не заблокирован');
      if (ok) await sendBlockedDriversList(ev.peer_id);
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
    blockDriver,
    unblockDriver,
  };
}
