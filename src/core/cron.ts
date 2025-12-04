import createDebug from 'debug';
import Papa from 'papaparse';
import { SHEET_URL } from '../config';
import { escapeHtml, getCurrentDate, getDateFromNow } from '../utils';
import type { Telegram } from 'telegraf';

const debug = createDebug('bot:cron');

const EXECUTOR_TAGS: Record<string, string> = {
  'Настя': '@a_hunko',
  'Соня': '@javelis',
};

const GLOBAL_TAGS = ['@a_hunko', '@javelis'];


const getTelegramTag = (name: string): string => {
  if (!name) return '';
  const cleanName = name.trim();
  if (EXECUTOR_TAGS[cleanName]) {
    return EXECUTOR_TAGS[cleanName];
  }
  if (cleanName.startsWith('@')) {
    return cleanName;
  }
  return '';
};


export const remindPublications = async (
  telegram: Telegram,
  chatId: number,
  messageThreadId?: number,
) => {
  debug('Cron job to remind publications started');

  try {
    const today = getCurrentDate();
    const oneDayFromNow = getDateFromNow(1);
    const threeDaysFromNow = getDateFromNow(3);

    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error(`Помилка завантаження: ${response.statusText}`);

    const csvData = await response.text();
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });

    if (parsed.errors.length) {
      console.error('CSV parsing errors:', parsed.errors);
      throw new Error('Помилка парсингу CSV');
    }

    const rows = parsed.data as Record<string, string>[];

    const relevantRows = rows.filter((row) => {
      const date = row['Публікація'];
      return date === today || date === oneDayFromNow || date === threeDaysFromNow;
    });

    if (!relevantRows.length) {
      debug('No relevant posts found');
      return;
    }

    for (const row of relevantRows) {
      const postDate = row['Публікація'];

      let reminderText = '';
      let isUrgent = false;

      if (postDate === today) {
        reminderText = `🔔 <b>СЬОГОДНІ</b>`;
        isUrgent = true;
      } else if (postDate === oneDayFromNow) {
        reminderText = `⚠️ <b>ЗАВТРА</b>`;
        isUrgent = true;
      } else if (postDate === threeDaysFromNow) {
        reminderText = `❕ <b>ЧЕРЕЗ 3 ДНІ</b>`;
      } else {
        continue;
      }

      const textAuthorName = row['Виконавець тексту']?.trim() || '';
      const imageAuthorName = row['Виконавець картинки']?.trim() || '';

      const textAuthorTag = getTelegramTag(textAuthorName);
      const imageAuthorTag = getTelegramTag(imageAuthorName);

      const primaryTags = [textAuthorTag, imageAuthorTag].filter(tag => tag);
      const allTagsSet = new Set([...primaryTags, ...GLOBAL_TAGS]);
      const allTags = Array.from(allTagsSet).join(' ');

      const postText = escapeHtml(row['Допис'] || '');
      const platform = escapeHtml(row['Платформа'] || 'N/A');


      const textAuthorBlock = textAuthorName
        ? `<b>Виконавець тексту:</b> ${escapeHtml(textAuthorName)}`
        : `<b>Виконавець тексту:</b> Відсутній`;

      const imageAuthorBlock = imageAuthorName
        ? `<b>Виконавець картинки:</b> ${escapeHtml(imageAuthorName)}`
        : `<b>Виконавець картинки:</b> Відсутній`;

      const message = `
${allTags}

${reminderText} (Дедлайн: ${postDate}) 🔔

<b>Платформа:</b> ${platform}
<b>Допис:</b>
${postText.substring(0, 500)}${row['Допис'] && row['Допис'].length > 500 ? '...' : ''}

${textAuthorBlock}
${imageAuthorBlock}
      `;


      await telegram.sendMessage(chatId, message.trim(), {
        parse_mode: 'HTML',
        message_thread_id: messageThreadId,
        disable_notification: !isUrgent
      });
    }

    debug('Reminders were sent');
  } catch (error) {
    debug('Error running cron job');
    console.error(error);
    try {
      await telegram.sendMessage(chatId, `Помилка Cron: ${error}`);
    } catch {}
  }
};