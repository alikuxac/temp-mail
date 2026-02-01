import { env } from 'cloudflare:workers';
import { CallbackQueryContext, Composer, InlineKeyboard } from 'grammy';
import { Menu } from "@grammyjs/menu";
import { CommandGroup } from '@grammyjs/commands';
import type { CustomContext } from '../types';
import { generateUsername } from '@/utils/helpers';
import * as db from "@/database/d1";
import type { EmailAddress } from "@/schemas/addresses/schema";
import type { User } from "@/schemas/users/schema";

const COOLDOWN_SECONDS = 10;
const MAX_RETRIES = 3;
const MAX_EMAILS_PER_USER = 5;

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

  const { } = await db.pinEmail(env.D1, emailId, !email);
  await showEmail(ctx, emailId);
}

// Menu
export const newGenerateMenu = new Menu('generated-email');

newGenerateMenu
  .text('🔃 Re-generate', async (ctx) => {
    if (!ctx.from) return await ctx.answerCallbackQuery("❌ User not found.");

    const { DOMAIN, D1, ADMIN_ID } = env;

    // Admin check
    const adminList = (ADMIN_ID || "").split(',');
    const isAdmin = adminList.includes(ctx.from.id.toString());

    if (!isAdmin) {
      // Limit check
      const { count } = await db.countEmailsByUserId(D1, ctx.from.id);
      if (count >= MAX_EMAILS_PER_USER) {
        return await ctx.answerCallbackQuery(`❌ Limit reached (${MAX_EMAILS_PER_USER} emails). Please delete some first.`);
      }

      // Cooldown check
      const { result: latestEmail } = await db.getLatestEmailByUserId(D1, ctx.from.id);
      if (latestEmail) {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - latestEmail.created_at;
        if (diff < COOLDOWN_SECONDS) {
          return await ctx.answerCallbackQuery(`⏳ Please wait ${COOLDOWN_SECONDS - diff}s.`);
        }
      }
    }

    const user: User = {
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      language_code: ctx.from.language_code,
      created_at: Math.floor(Date.now() / 1000),
    };
    await db.createOrUpdateUser(D1, user);

    let address = "";
    let success = false;

    // Retry loop for collision handling
    for (let i = 0; i < MAX_RETRIES; i++) {
      const newUsername = generateUsername();
      address = `${newUsername}@${DOMAIN}`;
      const emailData: EmailAddress = {
        id: crypto.randomUUID(),
        user_id: user.id,
        address,
        created_at: Math.floor(Date.now() / 1000),
      };
      const result = await db.createEmailAddress(D1, emailData);
      if (result.success) {
        success = true;
        break;
      }
      // If failed, likely unique constraint, try again
    }

    if (!success) {
      return await ctx.answerCallbackQuery("❌ Failed to generate unique email. Please try again.");
    }

    const text = `New email address generated: \`${address}\``;
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
  if (!ctx.from) return await ctx.reply("❌ User not found.");

  const { DOMAIN, D1, ADMIN_ID } = env;

  // Admin check
  const adminList = (ADMIN_ID || "").split(',');
  const isAdmin = adminList.includes(ctx.from.id.toString());

  if (!isAdmin) {
    // Limit check
    const { count } = await db.countEmailsByUserId(D1, ctx.from.id);
    if (count >= MAX_EMAILS_PER_USER) {
      return await ctx.reply(`❌ Limit reached (${MAX_EMAILS_PER_USER} emails). Please delete some first.`);
    }

    // Cooldown check
    const { result: latestEmail } = await db.getLatestEmailByUserId(D1, ctx.from.id);
    if (latestEmail) {
      const now = Math.floor(Date.now() / 1000);
      const diff = now - latestEmail.created_at;
      if (diff < COOLDOWN_SECONDS) {
        return await ctx.reply(`⏳ Please wait ${COOLDOWN_SECONDS - diff}s before generating a new email.`);
      }
    }
  }

  const user: User = {
    id: ctx.from.id,
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
    language_code: ctx.from.language_code,
    created_at: Math.floor(Date.now() / 1000),
  };
  await db.createOrUpdateUser(D1, user);

  let address = "";
  let success = false;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const randomUsername = generateUsername();
    address = `${randomUsername}@${DOMAIN}`;
    const emailData: EmailAddress = {
      id: crypto.randomUUID(),
      user_id: user.id,
      address,
      created_at: Math.floor(Date.now() / 1000),
    };
    const result = await db.createEmailAddress(D1, emailData);
    if (result.success) {
      success = true;
      break;
    }
  }

  if (!success) {
    return await ctx.reply("❌ Failed to generate unique email. Please try again.");
  }

  const text = `New email address generated: \`${address}\``;
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