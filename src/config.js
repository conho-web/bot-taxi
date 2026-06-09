import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parseAdminIds(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export const config = {
  vkGroupToken: required('VK_GROUP_TOKEN'),
  vkGroupId: Number(required('VK_GROUP_ID')),
  /** Секунды ожидания в long poll (макс. 90) */
  longPollWait: Math.min(90, Math.max(1, Number(process.env.LONG_POLL_WAIT || 25))),
  driversPeerId: Number(required('DRIVERS_PEER_ID')),
  /** Ссылка vk.me/join/… если API не выдал invite (опционально) */
  driversChatInviteLink: (process.env.DRIVERS_CHAT_INVITE_LINK || '').trim(),
  /** VK user_id админов через запятую — модерация водителей и смена цен */
  adminUserIds: parseAdminIds(process.env.ADMIN_VK_IDS),
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || './data/bot.sqlite',
  apiVersion: '5.199',
  /** Показывать «🏁 Завершить заказ» (false — только «⏳ Ожидаю», см. SIMPLE_DRIVER_FLOW) */
  showDriverFinishButton: process.env.DRIVER_FINISH_BUTTON !== 'false',
  /**
   * Упрощённый режим: без «Завершить»; при «Ожидаю» по заказу N
   * автоматически завершаются остальные подтверждённые поездки этого водителя.
   */
  simpleDriverFlow: process.env.SIMPLE_DRIVER_FLOW === 'true',
  /** Временно: один пассажир — несколько параллельных заказов (несколько машин) */
  multiplePassengerOrders: process.env.MULTIPLE_PASSENGER_ORDERS !== 'false',
};
