import createDebug from 'debug';
import Papa from 'papaparse';
import { SHEET_URL } from '../config';
import { getCurrentDate, getDateFromNow } from '../utils';
import type { Telegram } from 'telegraf';

const debug = createDebug('bot:cron');

const TELEGRAM_LIMIT = 4096;
const MAX_OVERDUE_DAYS = 14;

const EXECUTOR_TAGS: Record<string, string> = {
  'Настя': '@a_hunko',
  'Артем': '@artemiisychov',
  'Нікіта': '@Nikita_vdn',
  'Publicsa': '@publicsa',
  'if_found': '@if_found',
  'nonGratis': '@nonGratis',
};

const GLOBAL_TAGS = ['@artemiisychov',];

const getTelegramTag = (name: string): string => {
  if (!name) return '';
  const clean = name.trim();
  if (EXECUTOR_TAGS[clean]) return EXECUTOR_TAGS[clean];
  if (clean.startsWith('@')) return clean;
  return '';
};

const isCompletedStatus = (status?: string) => {
  const s = status?.trim().toLowerCase();
  return (
    s === 'опубліковано' ||
    s === 'заплановано' ||
    s === 'заблоковано'
  );
};

const parseDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;

  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return null;

  return new Date(year, month - 1, day);
};

const diffInDays = (a: Date, b: Date) => {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const parseTimeToMinutes = (time?: string): number => {
  if (!time) return 9999;
  const parts = time.split(':');
  if (parts.length !== 2) return 9999;

  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) return 9999;

  return h * 60 + m;
};

export const remindPublications = async (
  telegram: Telegram,
  chatId: number,
  messageThreadId?: number,
) => {
  debug('Cron job started');

  try {
    const todayStr = getCurrentDate();
    const tomorrowStr = getDateFromNow(1);
    const threeDaysStr = getDateFromNow(3);

    const todayDate = parseDate(todayStr);
    if (!todayDate) throw new Error('Помилка парсингу сьогоднішньої дати');

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
      console.error(parsed.errors);
      throw new Error('Помилка парсингу CSV');
    }

    const rows = parsed.data as Record<string, string>[];

    const grouped = {
      overdue: [] as { text: string; timeOrder: number }[],
      today: [] as { text: string; timeOrder: number }[],
      tomorrow: [] as { text: string; timeOrder: number }[],
      threeDays: [] as { text: string; timeOrder: number }[],
    };

    const tags = new Set<string>([...GLOBAL_TAGS]);
    let isUrgent = false;

    for (const row of rows) {
      const postDateStr = row['Публікація']?.trim();
      if (!postDateStr) continue;

      const postDate = parseDate(postDateStr);
      if (!postDate) continue;

      const status = row['Статус'];
      const daysDiff = diffInDays(todayDate, postDate);

      const isToday = postDateStr === todayStr;
      const isTomorrow = postDateStr === tomorrowStr;
      const isThreeDays = postDateStr === threeDaysStr;

      const isOverdue =
        daysDiff > 0 &&
        daysDiff <= MAX_OVERDUE_DAYS &&
        !isCompletedStatus(status);

      if (!isToday && !isTomorrow && !isThreeDays && !isOverdue) {
        continue;
      }

      const textAuthor = row['Виконавець тексту']?.trim() || 'Відсутній';
      const imageAuthor = row['Виконавець картинки']?.trim() || '';
      const platform = row['Платформа'] || 'N/A';
      const postText = (row['Допис'] || '').substring(0, 500);
      const time = row['Час']?.trim();

      const collectTags = (name: string) => {
        name
          .split(/\s+/)
          .map(n => getTelegramTag(n))
          .filter(Boolean)
          .forEach(tag => tags.add(tag));
      };

      collectTags(textAuthor);
      collectTags(imageAuthor);

      let block = '';

      if (time) {
        block += `🕒 ${time}\n`;
      }

      block +=
        `Платформа: ${platform}
Допис: ${postText}
Виконавець тексту: ${textAuthor}`;

      if (imageAuthor) {
        block += `\nВиконавець картинки: ${imageAuthor}`;
      }

      if (isOverdue) {
        block += `\nСтатус: ${status || 'Невідомо'}`;
        block += `\nПрострочено на ${daysDiff} дн.`;
      }

      const timeOrder = parseTimeToMinutes(time);

      if (isOverdue) {
        grouped.overdue.push({ text: block, timeOrder });
        isUrgent = true;
      } else if (isToday) {
        grouped.today.push({ text: block, timeOrder });
        isUrgent = true;
      } else if (isTomorrow) {
        grouped.tomorrow.push({ text: block, timeOrder });
        isUrgent = true;
      } else if (isThreeDays) {
        grouped.threeDays.push({ text: block, timeOrder });
      }
    }

    // сортуємо по часу
    const sortByTime = (arr: { text: string; timeOrder: number }[]) =>
      arr.sort((a, b) => a.timeOrder - b.timeOrder);

    sortByTime(grouped.today);
    sortByTime(grouped.tomorrow);
    sortByTime(grouped.threeDays);
    sortByTime(grouped.overdue);

    const total =
      grouped.overdue.length +
      grouped.today.length +
      grouped.tomorrow.length +
      grouped.threeDays.length;

    if (!total) {
      debug('No relevant posts found');
      return;
    }

    let message = `
${Array.from(tags).join(' ')}

ЗВЕДЕННЯ КОНТЕНТ-ПЛАНУ НА ${todayStr}
Знайдено ${total} постів.
`;

    const appendSection = (
      title: string,
      data: { text: string }[],
      icon: string,
    ) => {
      if (data.length > 0) {
        message += `\n-----------------------------------\n`;
        message += `${icon} ${title}\n\n`;
        message += data.map(d => d.text).join('\n\n');
      }
    };

    appendSection('ПРОСТРОЧЕНІ (до 14 днів)', grouped.overdue, '🚨');
    appendSection('СЬОГОДНІ', grouped.today, '🟥');
    appendSection('ЗАВТРА', grouped.tomorrow, '🟨');
    appendSection('ЧЕРЕЗ 3 ДНІ', grouped.threeDays, '🟦');

    const text = message.trim();

    for (let i = 0; i < text.length; i += TELEGRAM_LIMIT) {
      await telegram.sendMessage(chatId, text.slice(i, i + TELEGRAM_LIMIT), {
        message_thread_id: messageThreadId,
        disable_notification: !isUrgent,
      });
    }

    debug('Message sent successfully');
  } catch (error) {
    console.error(error);
    try {
      await telegram.sendMessage(chatId, `Помилка Cron: ${error}`);
    } catch {}
  }
};
