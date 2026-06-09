import express from 'express';
import { config } from './config.js';
import { openDb } from './db.js';
import { createBot } from './logic.js';
import { runLongPoll } from './longPoll.js';

const db = openDb(config.databasePath);
const processUpdate = createBot(db);

if (config.port > 0) {
  const app = express();
  app.get('/health', (_req, res) => {
    res.type('text/plain').send('ok');
  });
  app.listen(config.port, () => {
    console.log(`Health: GET http://localhost:${config.port}/health`);
  });
}

console.log(`VK Long Poll: group_id=${config.vkGroupId}`);
console.log(`Беседа водителей: DRIVERS_PEER_ID=${config.driversPeerId}`);
if (config.driversPeerId === 2000000123) {
  console.warn(
    '[!] DRIVERS_PEER_ID похож на пример из шаблона. Укажите реальный peer_id вашей беседы (см. лог message_new из этой беседы).',
  );
}

runLongPoll(processUpdate).catch((e) => {
  console.error('[longPoll] фатальная ошибка:', e);
  process.exit(1);
});
