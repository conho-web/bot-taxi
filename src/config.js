import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const config = {
  vkGroupToken: required('VK_GROUP_TOKEN'),
  vkConfirmation: required('VK_CONFIRMATION'),
  vkCallbackSecret: process.env.VK_CALLBACK_SECRET || '',
  vkGroupId: Number(required('VK_GROUP_ID')),
  driversPeerId: Number(required('DRIVERS_PEER_ID')),
  /** Ссылка vk.me/join/… если API не выдал invite (опционально) */
  driversChatInviteLink: (process.env.DRIVERS_CHAT_INVITE_LINK || '').trim(),
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || './data/bot.sqlite',
  apiVersion: '5.199',
};
