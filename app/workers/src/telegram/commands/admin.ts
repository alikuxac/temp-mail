import { env } from 'cloudflare:workers';
import { CommandGroup } from '@grammyjs/commands';
import { Composer } from 'grammy';
import type { CustomContext } from '../types';

import * as db from "@/database/d1";
import { now } from '@/utils/helpers';

export const adminCommands = new CommandGroup<CustomContext>();
export const adminCallbacks = new Composer<CustomContext>();

adminCommands.command('cleanup', 'Cleanup expired emails', async (ctx) => {
  const cutoffTimestamp = now() - env.HOURS_TO_DELETE_D1 * 60 * 60;

  const { success, error } = await db.deleteOldEmails(env.D1, cutoffTimestamp);

  if (success) {
    return await ctx.reply("Email cleanup completed successfully.");
  }

  return await ctx.reply(`Email cleanup failed: ${error}`);
});

export const adminComposer = new Composer<CustomContext>();

adminComposer.use(async (ctx, next) => {
  const { ADMIN_ID } = env;
  const adminList = ADMIN_ID.split(',');
  if (ctx.from?.id && !adminList.includes(ctx.from?.id.toString())) {
    return await ctx.reply(`You don't have enough permission to run command.`)
  }
  await next();
});

adminComposer.use(adminCommands);
adminComposer.use(adminCallbacks);