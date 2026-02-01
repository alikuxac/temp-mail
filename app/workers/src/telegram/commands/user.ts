import { env } from 'cloudflare:workers';
import { CallbackQueryContext, Composer, InlineKeyboard } from 'grammy';
import { Menu } from "@grammyjs/menu";
import { CommandGroup } from '@grammyjs/commands';
import type { CustomContext } from '../types';
import { generateUsername } from '@/utils/helpers';
import * as db from "@/database/d1";

export const userCommands = new CommandGroup<CustomContext>();

export async function showEmail(ctx: CustomContext, emailId: string) {
  const { result: email, error } = await db.getEmailById(env.D1, emailId);

  if (error || !email) {
    return await ctx.reply("❌ Email not found or expired.");
  }

  // Format nội dung hiển thị
  const text =
    `📧 *Email Details*

👤 *From:* \`${email.from_address}\`
📝 *Subject:* ${email.subject || "(No Subject)"}
📅 *Time:* ${new Date(email.received_at * 1000).toLocaleString()}

--------------------------------
${email.text_content || "_(No text content)_"}
`;

  // Nút chức năng bên dưới email (ví dụ: Xóa, Đóng)
  const keyboard = new InlineKeyboard()
    .text("❌ Delete", `delete_email:${emailId}`)
    .text("🔙 Close", "delete_msg");

  // Nếu là callback (bấm nút), sửa tin nhắn cũ hoặc gửi tin mới
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery(); // Tắt vòng xoay loading
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    // Nếu là command, gửi tin nhắn mới
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

export async function pinEmail(ctx: CustomContext, emailId: string) {
  const { result: email, error } = await db.getEmailById(env.D1, emailId);

  if (error || !email) {
    return await ctx.reply("❌ Email not found or expired.");
  }

  const {} = await db.pinEmail(env.D1, emailId, !email);
  await showEmail(ctx, emailId);
}

// Menu
export const newGenerateMenu = new Menu('generated-email');

newGenerateMenu
  .text('🔃 Re-generate', async (ctx) => {
    const newUsername = generateUsername();
    const text = `New email address generated: \`${newUsername}@${env.DOMAIN}\``;
    return await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', reply_markup: newGenerateMenu });
  })
  .row()
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

userCommands.command('read', 'Read email by ID', async (ctx) => {
  const emailId = ctx.match;
  if (!emailId) {
    return await ctx.reply("Please provide an email ID.");
  }

  await showEmail(ctx, emailId);
})

export const userComposer = new Composer<CustomContext>();

userComposer.callbackQuery(/^read_emails:(.+)$/, async (ctx) => {
  const email = ctx.match[1];
  await showEmail(ctx, email);
})

userComposer.callbackQuery(/^delete_email:(.+)$/, async (ctx) => {
  const emailId = ctx.match[1];
  await db.deleteEmailById(env.D1, emailId);
  await ctx.answerCallbackQuery("Email deleted!");
  await ctx.deleteMessage();
});

userComposer.callbackQuery("delete_msg", async (ctx) => {
  await ctx.deleteMessage();
});

userComposer.use(newGenerateMenu)
userComposer.use(userCommands)