import { config } from './config.js';
import { vkMethod } from './vk.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {(update: { type?: string, object?: unknown }) => Promise<void>} processUpdate
 */
export async function runLongPoll(processUpdate) {
  let ts;
  let key;
  let server;

  async function refreshServer() {
    const res = await vkMethod('groups.getLongPollServer', {
      group_id: config.vkGroupId,
    });
    ts = res.ts;
    key = res.key;
    server = res.server;
    console.log('[longPoll] сервер получен, ts=', ts);
  }

  await refreshServer();

  while (true) {
    try {
      const url = new URL(server);
      url.searchParams.set('act', 'a_check');
      url.searchParams.set('key', key);
      url.searchParams.set('ts', ts);
      url.searchParams.set('wait', String(config.longPollWait));

      const res = await fetch(url);
      const data = await res.json();

      if (data.failed) {
        if (data.failed === 1) {
          console.warn('[longPoll] устаревший ts, обновляем:', data.ts);
          ts = data.ts;
          continue;
        }
        console.warn('[longPoll] failed=', data.failed, '— переподключаемся');
        await refreshServer();
        continue;
      }

      ts = data.ts;

      for (const update of data.updates || []) {
        try {
          await processUpdate(update);
        } catch (e) {
          console.error('[longPoll] ошибка обработки события:', e);
        }
      }
    } catch (e) {
      console.error('[longPoll] ошибка опроса:', e);
      await sleep(3000);
      try {
        await refreshServer();
      } catch (e2) {
        console.error('[longPoll] не удалось обновить сервер:', e2);
      }
    }
  }
}
