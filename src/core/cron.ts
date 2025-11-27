import createDebug from 'debug';
import Papa from 'papaparse';
import { SHEET_URL } from '../config';
import { escapeHtml, getCurrentDate } from '../utils';
import type { Telegram } from 'telegraf';

const debug = createDebug('bot:cron');

export const remindPublications = async (
  telegram: Telegram,
  chatId: number,
  messageThreadId?: number,
) => {
  debug('Cron job to remind publicatoins started');

  try {
    const today = getCurrentDate();

    const response = await fetch(SHEET_URL);
    if (!response.ok) {
      throw new Error(`Помилка завантаження: ${response.statusText}`);
    }

    const csvData = await response.text();
    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length) {
      console.error('CSV parsing errors:', parsed.errors);
      throw new Error('Помилка парсингу CSV');
    }

    const rows = parsed.data as Record<string, string>[];
    const todaysRows = rows.filter((row) => row['Публікація'] === today);

    if (!todaysRows.length) {
      debug('No posts for today');
      return;
    }

    let message = '🔔 <b>Публікації на сьогодні</b> 🔔\n\n';

    for (const row of todaysRows) {
      const fields: string[] = [];

      const postText = escapeHtml(row['Допис'] || '');
      const textAuthor = escapeHtml(row['Виконавець тексту'] || '');
      const imageAuthor = escapeHtml(row['Виконавець картинки'] || '');

      if (postText) fields.push(`<b>Допис:</b> ${postText}`);
      if (textAuthor) fields.push(`<b>Виконавець (Текст):</b> ${textAuthor}`);
      if (imageAuthor)
        fields.push(`<b>Виконавець (Картинка):</b> ${imageAuthor}`);

      message += fields.join('\n') + '\n\n';
    }

    await telegram.sendMessage(chatId, message.trim(), {
      parse_mode: 'HTML',
      message_thread_id: messageThreadId,
    });

    debug('Reminders was sent');
  } catch (error) {
    debug('Error running cron job');
    console.error(error);
    try {
      await telegram.sendMessage(chatId, `Помилка Cron: ${error}`);
    } catch {}
  }
};
