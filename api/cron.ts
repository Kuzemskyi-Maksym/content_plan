import { remindPublications } from '../src/core/cron';
// import { BOT_TOKEN, CHAT_ID } from '../src/config';
import { BOT_TOKEN, CHAT_ID, MESSAGE_THREAD_ID } from '../src/config';
import { Telegraf } from 'telegraf';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handle(req: VercelRequest, res: VercelResponse) {
  try {
    const bot = new Telegraf(BOT_TOKEN);
    await remindPublications(bot.telegram, CHAT_ID, MESSAGE_THREAD_ID);
    // await remindPublications(bot.telegram, CHAT_ID);
    res.status(200).json('Cron job runned successfully!');
  } catch (e: unknown) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Server Error</h1><p>Sorry, there was a problem</p>');
    console.error(e);
  }
}
