import createDebug from 'debug';
import Papa from 'papaparse';
import { SHEET_URL } from '../config';
import { escapeHtml, getCurrentDate, getDateFromNow } from '../utils';
import type { Telegram } from 'telegraf';

const debug = createDebug('bot:cron');

const EXECUTOR_TAGS: Record<string, string> = {
  'Настя': '@a_hunko',
  'Соня': '@javelis',
  'Нікіта': '@Nikita_vdn',
  'Publicsa': '@publicsa',
  'if_found': '@if_found',
  'nonGratis': '@nonGratis',
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


    const groupedMessages = {
      [today]: [] as string[],
      [oneDayFromNow]: [] as string[],
      [threeDaysFromNow]: [] as string[],
    };

    const allTagsSet = new Set<string>([...GLOBAL_TAGS]);
    let isUrgentFound = false;

    for (const row of relevantRows) {
      const postDate = row['Публікація'];

      const textAuthorName = row['Виконавець тексту']?.trim() || '';
      const imageAuthorName = row['Виконавець картинки']?.trim() || '';

      const extractTags = (name: string): string[] => {
        return name.split(/\s+/).map(tag => getTelegramTag(tag)).filter(t => t.length > 0);
      }

      const textTags = extractTags(textAuthorName);
      const imageTags = extractTags(imageAuthorName);

      textTags.forEach(tag => allTagsSet.add(tag));
      imageTags.forEach(tag => allTagsSet.add(tag));

      // Формування блоків
      const postText = escapeHtml(row['Допис'] || '');
      const platform = escapeHtml(row['Платформа'] || 'N/A');

      const textAuthorBlock = `<b>Виконавець тексту:</b> ${textAuthorName ? escapeHtml(textAuthorName) : 'Відсутній'}`;

      const imageAuthorBlock = imageAuthorName
        ? `<b>Виконавець картинки:</b> ${escapeHtml(imageAuthorName)}`
        : null;

      const postDetails = [
        `<b>Платформа:</b> ${platform}`,
        `<b>Допис:</b> ${postText.substring(0, 500)}${row['Допис'] && row['Допис'].length > 500 ? '...' : ''}`,
        textAuthorBlock,
        imageAuthorBlock,
      ].filter(Boolean).join('\n');

      const postBlock = `\n${postDetails}\n`;

      if (postDate === today || postDate === oneDayFromNow) {
        isUrgentFound = true;
        groupedMessages[postDate].push(postBlock);
      } else if (postDate === threeDaysFromNow) {
        groupedMessages[postDate].push(postBlock);
      }
    }

    const allTags = Array.from(allTagsSet).join(' ');

    const header = `
${allTags.trim()}

<b>ЗВЕДЕННЯ КОНТЕНТ-ПЛАНУ НА ${escapeHtml(getCurrentDate())}</b>
Знайдено ${relevantRows.length} актуальних постів.
`;

    let finalMessage = header;

    const appendGroup = (date: string, title: string, icon: string) => {
      const finalIcon = title === 'СЬОГОДНІ' ? '🟥' : icon;

      if (groupedMessages[date].length > 0) {
        finalMessage += `\n———————————————————\n`;
        finalMessage += `${finalIcon} <b>${title}</b> (Дедлайн: ${date})\n\n`;
        finalMessage += groupedMessages[date].map(p => p.trim()).join('\n\n');
      }
    };

    appendGroup(today, 'СЬОГОДНІ', '🟥');
    appendGroup(oneDayFromNow, 'ЗАВТРА', '🟨');
    appendGroup(threeDaysFromNow, 'ЧЕРЕЗ 3 ДНІ', '🟦');

    await telegram.sendMessage(chatId, finalMessage.trim(), {
      parse_mode: 'HTML',
      message_thread_id: messageThreadId,
      disable_notification: !isUrgentFound
    });

    debug('Reminders were sent in one consolidated message');
  } catch (error) {
    debug('Error running cron job');
    console.error(error);
    try {
      await telegram.sendMessage(chatId, `Помилка Cron: ${error}`);
    } catch {}
  }
};