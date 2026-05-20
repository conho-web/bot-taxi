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

export function passengerIdleKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.ORDER, { cmd: 'order' }, 'positive')],
      [textBtn(BTN.DRIVER, { cmd: 'driver' }, 'primary')],
      [textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')],
    ],
  });
}

export function registeredDriverKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [
      [textBtn(BTN.PROFILE, { cmd: 'profile' }, 'primary')],
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

/** Пассажир с активным заказом — только помощь, без завершения заказа. */
export function passengerDuringOrderKeyboard() {
  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: [[textBtn(BTN.HELP, { cmd: 'help' }, 'secondary')]],
  });
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
      ],
      [callbackBtn('✏️ Ответить', { a: 'reply', o: orderId }, 'secondary')],
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
