import { config } from './config.js';
import { BTN } from './ui.js';

/**
 * @param {string} method
 * @param {Record<string, string | number | undefined>} params
 */
export async function vkMethod(method, params) {
  const body = new URLSearchParams();
  body.set('access_token', config.vkGroupToken);
  body.set('v', config.apiVersion);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }

  const res = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body,
  });

  const data = await res.json();
  if (data.error) {
    const err = new Error(`VK API ${method}: ${data.error.error_msg}`);
    err.vk = data.error;
    throw err;
  }
  return data.response;
}

export function randomId() {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function communityPeerForUser(userId) {
  return 2_000_000_000 + Number(userId);
}

export function userPeerForSend(userId) {
  return Number(userId);
}

export function chatIdFromPeer(peerId) {
  const p = Number(peerId);
  if (p < 2_000_000_000) return null;
  return p - 2_000_000_000;
}

export async function addUserToChat(chatId, userId) {
  return vkMethod('messages.addChatUser', {
    chat_id: chatId,
    user_id: userId,
  });
}

export async function getChatInviteLink(peerId) {
  const res = await vkMethod('messages.getInviteLink', {
    peer_id: peerId,
  });
  if (typeof res === 'string') return res;
  if (res?.link) return res.link;
  return null;
}

function textBtn(label, payloadObj, color = 'primary') {
  return {
    action: {
      type: 'text',
      label,
      payload: JSON.stringify(payloadObj),
    },
    color,
  };
}

function callbackBtn(label, payloadObj, color = 'primary') {
  return {
    action: {
      type: 'callback',
      label,
      payload: JSON.stringify(payloadObj),
    },
    color,
  };
}

function menuExtrasRow(isAdmin) {
  const row = [textBtn(BTN.PRICES, { cmd: 'prices' }, 'secondary')];
  if (isAdmin) row.push(textBtn(BTN.ADMIN, { cmd: 'admin' }, 'secondary'));
  return [row];
}

export function passengerIdleKeyboard(isAdmin = false) {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.ORDER, { cmd: 'order' }, 'positive')],
      ...menuExtrasRow(isAdmin),
      [textBtn(BTN.DRIVER, { cmd: 'driver' }, 'primary')],
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

export function registeredDriverKeyboard(isAdmin = false) {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.PROFILE, { cmd: 'profile' }, 'primary')],
      ...menuExtrasRow(isAdmin),
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

/** Водитель ждёт одобрения админа */
export function pendingDriverKeyboard(isAdmin = false) {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.PROFILE, { cmd: 'profile' }, 'primary')],
      ...menuExtrasRow(isAdmin),
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

export function driverProfileKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.EDIT_DRIVER, { cmd: 'edit_driver' }, 'primary')],
      [textBtn(BTN.LOGOUT_DRIVER, { cmd: 'logout_driver' }, 'negative')],
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

/** Заполнение формы заказа. */
export function passengerOrderFormKeyboard(isAdmin = false) {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.CANCEL_FORM, { cmd: 'cancel_form' }, 'negative')],
      [textBtn(BTN.PRICES, { cmd: 'prices' }, 'secondary')],
      ...(isAdmin ? [[textBtn(BTN.ADMIN, { cmd: 'admin' }, 'secondary')]] : []),
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

/** Пассажир с активным заказом — только помощь, без завершения заказа. */
export function passengerDuringOrderKeyboard(isAdmin = false) {
  const rows = [[textBtn(BTN.PRICES, { cmd: 'prices' }, 'secondary')]];
  if (isAdmin) rows.push([textBtn(BTN.ADMIN, { cmd: 'admin' }, 'secondary')]);
  rows.push([textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')]);
  return JSON.stringify({ one_time: false, inline: false, buttons: rows });
}

/** Водитель ждёт подтверждения пассажира. */
export function driverPendingKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [[textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')]],
  });
}

/** Активная поездка — завершить может только водитель. */
export function driverTripKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.FINISH_ORDER, { cmd: 'finish_order' }, 'negative')],
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

export function driversChatKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [[textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')]],
  });
}

export function driversOrderKeyboard(orderId) {
  return JSON.stringify({
    inline: true,
    buttons: [
      [
        callbackBtn('~ 3-5 мин', { a: 'eta', o: orderId, t: '3' }, 'positive'),
        callbackBtn('~ 10 мин', { a: 'eta', o: orderId, t: '10' }, 'primary'),
        callbackBtn('~ 20 мин', { a: 'eta', o: orderId, t: '20' }, 'secondary'),
      ],
    ],
  });
}

export function passengerConfirmKeyboard(orderId) {
  return JSON.stringify({
    inline: true,
    buttons: [
      [
        callbackBtn('Да, едем', { a: 'yes', o: orderId }, 'positive'),
        callbackBtn('Отмена', { a: 'no', o: orderId }, 'negative'),
      ],
    ],
  });
}

export function adminMenuKeyboard(pendingCount) {
  const rows = [];
  if (pendingCount > 0) {
    rows.push([
      callbackBtn(`🚗 Заявки (${pendingCount})`, { a: 'admin_pending' }, 'primary'),
    ]);
  }
  rows.push([callbackBtn('✏️ Изменить цены', { a: 'admin_prices' }, 'secondary')]);
  return JSON.stringify({ inline: true, buttons: rows });
}

export function adminPendingListKeyboard(pendingDrivers) {
  const rows = pendingDrivers.slice(0, 5).map((d) => [
    callbackBtn(`✅ ${d.callsign}`, { a: 'adm_ok', u: d.user_id }, 'positive'),
    callbackBtn('❌', { a: 'adm_no', u: d.user_id }, 'negative'),
  ]);
  rows.push([callbackBtn('← Меню', { a: 'admin_menu' }, 'secondary')]);
  return JSON.stringify({ inline: true, buttons: rows });
}

export function adminDriverReviewKeyboard(userId, callsign) {
  return JSON.stringify({
    inline: true,
    buttons: [
      [
        callbackBtn(`✅ ${callsign}`, { a: 'adm_ok', u: userId }, 'positive'),
        callbackBtn('❌ Отклонить', { a: 'adm_no', u: userId }, 'negative'),
      ],
      [callbackBtn('← Меню', { a: 'admin_menu' }, 'secondary')],
    ],
  });
}

export const EMPTY_INLINE_KEYBOARD = JSON.stringify({
  one_time: false,
  inline: true,
  buttons: [],
});

export async function answerCallbackEvent(ev, snackText = 'Готово') {
  const event_data = JSON.stringify({
    type: 'show_snackbar',
    text: snackText,
  });
  try {
    await vkMethod('messages.sendMessageEventAnswer', {
      event_id: ev.event_id,
      user_id: ev.user_id,
      peer_id: ev.peer_id,
      event_data,
    });
  } catch {
    try {
      await vkMethod('messages.sendMessageEventAnswer', {
        event_id: ev.event_id,
        user_id: ev.user_id,
        peer_id: ev.peer_id,
        event_data: JSON.stringify({ type: 'snackbar', text: snackText }),
      });
    } catch {
      // ignore
    }
  }
}

export async function answerCallbackError(ev, text) {
  await answerCallbackEvent(ev, text);
}
