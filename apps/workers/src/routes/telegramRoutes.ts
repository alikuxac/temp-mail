import { webhookCallback } from 'grammy';
import { OpenAPIHono } from '@hono/zod-openapi';
import { TempMailBot } from '@/telegram/bot';
import { telegramCommands } from '@/config/telegram';

const telegramRoutes = new OpenAPIHono<{ Bindings: Env }>();

// Webhook 
telegramRoutes.post('/webhook', async (c) => {
  const handler =  webhookCallback(TempMailBot, 'hono');
  return await handler(c);
});

telegramRoutes.post('/commands', async (c) => {
  const bot = TempMailBot;
  await bot.api.setMyCommands(telegramCommands);
  return c.text('Commands set');
});

export default telegramRoutes;