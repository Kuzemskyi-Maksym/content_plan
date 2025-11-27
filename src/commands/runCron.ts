import createDebug from 'debug';
import { remindPublications } from '../core/cron';
import { CHAT_ID, MESSAGE_THREAD_ID } from '../config';
import type { Context } from 'telegraf';

const debug = createDebug('bot:run_cron');

export const runCron = async (ctx: Context) => {
  debug('Triggered "run_cron" command');
  await remindPublications(ctx.telegram, CHAT_ID, MESSAGE_THREAD_ID);
};
