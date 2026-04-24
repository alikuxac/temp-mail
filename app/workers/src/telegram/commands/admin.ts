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
    return await ctx.reply("✅ Email cleanup completed successfully.", { parse_mode: "Markdown" });
  }

  return await ctx.reply(`❌ Email cleanup failed: \`${error}\``, { parse_mode: "Markdown" });
});

adminCommands.command('list_all', 'List all active email addresses', async (ctx) => {
  const userIdArg = ctx.match;
  let results, error;

  if (userIdArg) {
    const userId = parseInt(userIdArg);
    if (isNaN(userId)) {
      return await ctx.reply("❌ Invalid User ID. Usage: `/list_all <user_id>`", { parse_mode: "Markdown" });
    }
    const resp = await db.getEmailAddressesByUserId(env.D1, userId);
    results = resp.results;
    error = resp.error;
  } else {
    const resp = await db.getAllEmailAddresses(env.D1);
    results = resp.results;
    error = resp.error;
  }

  if (error) {
    return await ctx.reply(`❌ Failed to fetch email addresses: \`${error}\``, { parse_mode: "Markdown" });
  }

  if (!results || results.length === 0) {
    return await ctx.reply("📭 No active email addresses found.", { parse_mode: "Markdown" });
  }

  let text = userIdArg 
    ? `📋 *Active Email Addresses for User* \`${userIdArg}\`\n\n`
    : "📋 *All Active Email Addresses*\n\n";
    
  text += "`Address | User ID | Created At`\n";
  text += "--------------------------------\n";

  for (const email of results) {
    const createdAt = new Date(email.created_at * 1000).toLocaleString();
    text += `\`${email.address}\` | \`${email.user_id}\` | ${createdAt}\n`;
  }

  return await ctx.reply(text, { parse_mode: "Markdown" });
});

export const adminComposer = new Composer<CustomContext>();

adminComposer.use(async (ctx, next) => {
  const { ADMIN_ID } = env;
  const adminList = ADMIN_ID.split(',');
  if (ctx.from?.id && !adminList.includes(ctx.from?.id.toString())) {
    return await ctx.reply(`❌ You don't have enough permission to run command.`, { parse_mode: "Markdown" })
  }
  await next();
});

adminComposer.use(adminCommands);
adminComposer.use(adminCallbacks);