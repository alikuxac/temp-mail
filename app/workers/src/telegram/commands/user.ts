import { env } from 'cloudflare:workers';
import { Composer } from 'grammy';
import { Menu } from "@grammyjs/menu";
import { CommandGroup } from '@grammyjs/commands';
import type { CustomContext } from '../types';
import { generateUsername } from '@/utils/helpers';

export const userCommands = new CommandGroup<CustomContext>();

// Menu
export const newGenerateMenu = new Menu('generated-email');

newGenerateMenu
  .text('🔃 Re-generate', async (ctx) => {
    const newUsername = generateUsername();
    const text = `New email address generated: \`${newUsername}@${env.DOMAIN}\``;
    return await ctx.editMessageText(text, { parse_mode: 'MarkdownV2' });
  }).row()
  .text('🗑️ Delete', async (ctx) => { await ctx.deleteMessage(); })

// Commands
userCommands.command('id', 'Show chat ID', async (ctx) => {
  const text = `Your chat ID is ${ctx.chatId}`;
  return await ctx.reply(text, {
    reply_parameters: { message_id: ctx.msg.message_id },
  });
});

userCommands.command('new', 'Generate random email address', async (ctx) => {
  const { DOMAIN } = env;
  const randomUsername = generateUsername();
  const text = `New email address generated: \`${randomUsername}@${DOMAIN}\``;
  return await ctx.reply(text, { parse_mode: 'MarkdownV2', reply_markup: newGenerateMenu });
});

export const userComposer = new Composer<CustomContext>();

userComposer.use(newGenerateMenu)
userComposer.use(userCommands)