import { remindPublications } from '../core/cron';
import { CHAT_ID, BOT_TOKEN, MESSAGE_THREAD_ID } from '../config';
import { Telegraf } from 'telegraf';

const runTestCron = async () => {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Помилка: BOT_TOKEN або CHAT_ID не вказано у .env');
    return;
  }

  console.log('--- Локальне тестування Cron: Запуск ---');

  const bot = new Telegraf(BOT_TOKEN);

  try {
    await remindPublications(bot.telegram, CHAT_ID, MESSAGE_THREAD_ID);

    console.log('--- Тестування завершено: Успіх ---');
    console.log('Перевірте повідомлення у Telegram чаті.');

  } catch (error) {
    console.error('--- Тестування завершено: Помилка ---');
    console.error('Сталася помилка під час тестування Cron:', error);
  } finally {
    process.exit(0);
  }
};

runTestCron();