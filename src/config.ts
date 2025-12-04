require('dotenv').config();

export const ENVIRONMENT = process.env.NODE_ENV || '';
export const BOT_TOKEN = process.env.BOT_TOKEN || '';
export const SHEET_URL = process.env.SHEET_URL || '';
export const CHAT_ID = parseInt(process.env.CHAT_ID || '0', 10);
export const MESSAGE_THREAD_ID = process.env.MESSAGE_THREAD_ID
  ? parseInt(process.env.MESSAGE_THREAD_ID, 10)
  : undefined;