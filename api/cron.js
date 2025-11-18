// --- api/cron.js ---
// Цей файл виконує тікі перевірку таблиці.
// Vercel буде тикати його за розкладом.

require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

if (!process.env.BOT_TOKEN) {
  console.error('ПОМИЛКА: BOT_TOKEN не вказано!');
  process.exit(1);
}
const bot = new Telegraf(process.env.BOT_TOKEN);
const sheetUrl = process.env.SHEET_URL;
const chatId = process.env.CHAT_ID;

function escapeHTML(text) {
  if (!text) return 'N/A'; 
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


async function checkSheetAndSend() {
  console.log('Запущено перевірку таблиці (CRON)...');
  
  if (!chatId) {
    console.error('ПОМИЛКА: CHAT_ID не вказано. Зупиняю cron.');
    return;
  }
  if (!sheetUrl) {
    console.error('ПОМИЛКА: SHEET_URL не вказано. Зупиняю cron.');
    try {
      await bot.telegram.sendMessage(chatId, 'Помилка cron: SHEET_URL не вказано.');
    } catch (e) {
      console.error('Не вдалося надіслати повідомлення про помилку CHAT_ID');
    }
    return;
  }

  try {
    // Отримуємо сьогоднішню дату
    const today = new Date().toLocaleDateString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    console.log(`Cron job: Сьогоднішня дата (Київ): ${today}`);

    // Завантажуєм CSV-файл
    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`Не вдалося завантажити таблицю: ${response.statusText}`);
    }
    const csvData = await response.text();

    // Парсимо CSV
    const rows = csvData.trim().split(/\r?\n/);
    if (rows.length < 2) {
      throw new Error('Таблиця порожня або містить лише заголовки.');
    }

    let headers = rows[0].split(',').map(h => h.trim());
    // Очищуємо BOM-символ
    if (headers[0] && headers[0].charCodeAt(0) === 0xFEFF) {
      headers[0] = headers[0].substring(1);
    }

    // Знаходимо індекси
    const dateIndex = headers.indexOf('Публікація');
    const pubIndex = headers.indexOf('Публікація');
    const postIndex = headers.indexOf('Допис');
    const textAuthorIndex = headers.indexOf('Виконавець тексту');
    const imageAuthorIndex = headers.indexOf('Виконавець картинки');

    if (dateIndex === -1) {
      console.error('Отримані заголовки:', headers);
      throw new Error('Не можу знайти стовпець "Публікація". Перевір назву у таблиці.');
    }

    // Пошук збігів
    for (let i = 1; i < rows.length; i++) {
      const columns = rows[i].split(',').map(c => c.trim());
      if (columns.length <= dateIndex) {
        continue;
      }
      const postDate = columns[dateIndex];

      if (postDate === today) {
        console.log(`Cron job: Знайдено збіг! Дата: ${postDate}`);
        
        const publication = escapeHTML(columns[pubIndex]);
        const postText = escapeHTML(columns[postIndex]);
        const textAuthor = escapeHTML(columns[textAuthorIndex]);
        const imageAuthor = escapeHTML(columns[imageAuthorIndex]);
        
        // <b> замість * та не екрануємо дужки ()
        const message = `
🔔 <b>Нагадування про публікацію на сьогодні (${escapeHTML(today)})</b> 🔔

<b>Дата:</b>
${publication}

<b>Допис:</b>
${postText}

<b>Виконавець (Текст):</b> ${textAuthor}
<b>Виконавець (Картинка):</b> ${imageAuthor}
        `;

        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        console.log(`Cron job: Повідомлення надіслано до чату ${chatId}`);
      }
    }
    console.log('Cron job: Перевірку завершено.');

  } catch (error) {
    console.error('Cron job: Сталася помилка:', error.message);
    try {
      await bot.telegram.sendMessage(chatId, `Помилка Cron: ${error.message}`);
    } catch (e) {
      console.error('Cron job: Не вдалося надіслати повідомлення про помилку', e);
    }
  }
}

// --- Vercel Handler ---
module.exports = async (req, res) => {
  await checkSheetAndSend();
  res.status(200).send('Cron job виконано.');
};