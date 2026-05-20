import express from 'express';
import { config } from './config.js';
import { openDb } from './db.js';
import { createWebhookRouter } from './logic.js';

const db = openDb(config.databasePath);
const webhook = createWebhookRouter(db);

const app = express();

/**
 * Туннели иногда шлют тело с «левым» Content-Type — стандартный express.json()
 * тогда не парсит, и type пустой. Для /vk всегда читаем сырое тело как JSON.
 */
function parseVkJsonBody(req, res, next) {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    req.body = {};
    return next();
  }
  const raw = buf.toString('utf8').trim();
  if (!raw) {
    req.body = {};
    return next();
  }
  try {
    req.body = JSON.parse(raw);
  } catch (e) {
    console.error('[VK] Ошибка разбора JSON:', e.message, '| начало тела:', raw.slice(0, 240));
    res.status(400).type('text/plain').send('invalid json');
    return;
  }
  next();
}

const rawParser = express.raw({ type: () => true, limit: '4mb' });
const vkChain = [rawParser, parseVkJsonBody, webhook];

app.post('/vk', vkChain);
app.post('/vk/', vkChain);

for (const path of ['/vk', '/vk/']) {
  app.get(path, (_req, res) => {
    res.type('text/plain').send(
      [
        'Эндпоинт для VK Callback API.',
        'ВКонтакте должен слать сюда POST с JSON (type=confirmation и др.).',
        'Если вы открыли страницу в браузере — это GET, для Callback это нормально.',
        'В настройках Callback укажите URL именно с путём /vk в конце (см. README).',
      ].join('\n'),
    );
  });
}

app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.use((req, res) => {
  if (req.method === 'POST') {
    console.warn(`[404] POST ${req.originalUrl} — ожидается POST /vk или POST /vk/`);
  }
  res.status(404).type('text/plain').send('not found');
});

app.listen(config.port, () => {
  console.log(`VK Callback: POST http://localhost:${config.port}/vk (и /vk/)`);
  console.log(`Ожидаемый туннель → localhost:${config.port} (см. PORT в .env)`);
  console.log(`Беседа водителей: DRIVERS_PEER_ID=${config.driversPeerId}`);
  if (config.driversPeerId === 2000000123) {
    console.warn(
      '[!] DRIVERS_PEER_ID похож на пример из шаблона. Укажите реальный peer_id вашей беседы (см. лог message_new из этой беседы).',
    );
  }
});
