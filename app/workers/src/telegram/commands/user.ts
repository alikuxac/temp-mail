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
    return await ctx.reply("❌ Email not found or expired.", { parse_mode: "Markdown" });
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

// Menu
export const newGenerateMenu = new Menu<CustomContext>('generated-email');

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
        return await ctx.answerCallbackQuery(`❌ You have reached the limit of ${MAX_EMAILS_PER_USER} emails. Please delete some before creating new ones.`);
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
    }

    if (!success) {
      return await ctx.answerCallbackQuery("❌ Failed to generate unique email. Please try again.");
    }

    const text = `New email address generated: \`${address}\``;
    return await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: newGenerateMenu });
  })
  .row()
  .text('🗑️ Delete', async (ctx) => { await ctx.deleteMessage(); })

// Commands
userCommands.command('id', 'Show chat ID', async (ctx) => {
  const text = `Your chat ID is \`${ctx.chatId}\``;
  return await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_parameters: { message_id: ctx.msg.message_id },
  });
});

userCommands.command('new', 'Generate random email address', async (ctx) => {
  if (!ctx.from) return await ctx.reply("❌ *User not found*.", { parse_mode: "Markdown" });

  const { DOMAIN, D1, ADMIN_ID } = env;

  // Admin check
  const adminList = (ADMIN_ID || "").split(',');
  const isAdmin = adminList.includes(ctx.from.id.toString());

  if (!isAdmin) {
    // Limit check
    const { count } = await db.countEmailsByUserId(D1, ctx.from.id);
    if (count >= MAX_EMAILS_PER_USER) {
      return await ctx.reply(`❌ You have reached the limit of *${MAX_EMAILS_PER_USER}* emails. Please delete some before creating new ones.`, { parse_mode: "Markdown" });
    }

    // Cooldown check
    const { result: latestEmail } = await db.getLatestEmailByUserId(D1, ctx.from.id);
    if (latestEmail) {
      const now = Math.floor(Date.now() / 1000);
      const diff = now - latestEmail.created_at;
      if (diff < COOLDOWN_SECONDS) {
        return await ctx.reply(`⏳ Please wait *${COOLDOWN_SECONDS - diff}s* before generating a new email.`, { parse_mode: "Markdown" });
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
    return await ctx.reply("❌ Failed to generate unique email. Please try again.", { parse_mode: "Markdown" });
  }

  const text = `New email address generated: \`${address}\``;
  return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: newGenerateMenu });
});

userCommands.command('list', 'List your email addresses', async (ctx) => {
  if (!ctx.from) return await ctx.reply("❌ *User not found*.", { parse_mode: "Markdown" });

  const { results, error } = await db.getEmailAddressesByUserId(env.D1, ctx.from.id);

  if (error) {
    return await ctx.reply(`❌ Failed to fetch email addresses: \`${error}\``, { parse_mode: "Markdown" });
  }

  if (results.length === 0) {
    return await ctx.reply("📭 You don't have any active email addresses.", { parse_mode: "Markdown" });
  }

  const text = `📋 *Your Email Addresses* (${results.length}/${MAX_EMAILS_PER_USER})`;

  const keyboard = new InlineKeyboard();
  for (const email of results) {
    keyboard.text(`📖 ${email.address}`, `view_address_info:${email.id}`).row();
  }

  return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
});

export const userComposer = new Composer<CustomContext>();

// --- Callback Handlers ---

userComposer.callbackQuery(/^view_address_info:(.+)$/, async (ctx) => {
  const addressId = ctx.match[1];
  const { result: addr, error } = await db.getEmailAddressById(env.D1, addressId);

  if (error || !addr) {
    return await ctx.answerCallbackQuery("❌ Address not found.");
  }

  const text = `📍 *Address:* \`${addr.address}\`
📅 *Created:* ${new Date(addr.created_at * 1000).toLocaleString()}
${addr.expires_at ? `⌛ *Expires:* ${new Date(addr.expires_at * 1000).toLocaleString()}` : ""}
`;

  const keyboard = new InlineKeyboard()
    .text("📥 View Emails", `read_emails:${addr.address}`)
    .text("🗑️ Delete Address", `delete_address:${addr.id}`)
    .row()
    .text("🔙 Back to List", "list_my_addresses")
    .text("❌ Close", "delete_msg");

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
});

userComposer.callbackQuery("list_my_addresses", async (ctx) => {
  if (!ctx.from) return;
  const { results } = await db.getEmailAddressesByUserId(env.D1, ctx.from.id);
  
  const text = `📋 *Your Email Addresses* (${results.length}/${MAX_EMAILS_PER_USER})`;
  const keyboard = new InlineKeyboard();
  for (const email of results) {
    keyboard.text(`📖 ${email.address}`, `view_address_info:${email.id}`).row();
  }

  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  } catch (e) {
    // If message text is same, editMessageText throws
    await ctx.answerCallbackQuery();
  }
});

userComposer.callbackQuery(/^read_emails:(.+)$/, async (ctx) => {
  const address = ctx.match[1];
  const { results, error } = await db.getEmailsByRecipient(env.D1, address);

  if (error) {
    return await ctx.answerCallbackQuery("❌ Error fetching emails.");
  }

  if (results.length === 0) {
    return await ctx.answerCallbackQuery({ text: "📭 No emails received yet.", show_alert: false });
  }

  let text = `📧 *Emails for* \`${address}\`\n\n`;
  const keyboard = new InlineKeyboard();

  for (const email of results) {
    text += `🔹 *${email.subject || "(No Subject)"}*\n   From: ${email.from_address}\n\n`;
    keyboard.text(`Read: ${email.subject || "No Subject"}`, `read_single_email:${email.id}`).row();
  }

  keyboard.text("🔙 Back", `view_address_info_by_addr:${address}`);

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
});

userComposer.callbackQuery(/^view_address_info_by_addr:(.+)$/, async (ctx) => {
  const address = ctx.match[1];
  const { result: addr } = await db.getEmailAddressByAddress(env.D1, address);
  if (!addr) return await ctx.answerCallbackQuery("❌ Address not found.");
  
  const text = `📍 *Address:* \`${addr.address}\`
📅 *Created:* ${new Date(addr.created_at * 1000).toLocaleString()}
`;
  const keyboard = new InlineKeyboard()
    .text("📥 View Emails", `read_emails:${addr.address}`)
    .text("🗑️ Delete Address", `delete_address:${addr.id}`)
    .row()
    .text("🔙 Back to List", "list_my_addresses")
    .text("❌ Close", "delete_msg");

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
});

userComposer.callbackQuery(/^read_single_email:(.+)$/, async (ctx) => {
  const emailId = ctx.match[1];
  await showEmail(ctx, emailId);
});

userCommands.command('delete', 'Delete an email address', async (ctx) => {
  const address = ctx.match;
  if (!address) {
    return await ctx.reply("❌ Please specify the address. Usage: `/delete <address>`", { parse_mode: 'Markdown' });
  }

  const { result: addr, error } = await db.getEmailAddressByAddress(env.D1, address);

  if (error || !addr) {
    return await ctx.reply("❌ Address not found.", { parse_mode: "Markdown" });
  }

  // Ownership check
  const isAdmin = (env.ADMIN_ID || "").split(',').includes(ctx.from?.id.toString() || "");
  if (addr.user_id !== ctx.from?.id && !isAdmin) {
    return await ctx.reply("❌ Permission denied. This address does not belong to you.", { parse_mode: "Markdown" });
  }

  const { success } = await db.deleteEmailAddress(env.D1, addr.id);
  if (success) {
    return await ctx.reply(`✅ Address \`${address}\` deleted successfully.`, { parse_mode: 'Markdown' });
  }
  return await ctx.reply("❌ Failed to delete address.", { parse_mode: "Markdown" });
});

userComposer.callbackQuery(/^delete_address:(.+)$/, async (ctx) => {
  const addressId = ctx.match[1];
  const { success } = await db.deleteEmailAddress(env.D1, addressId);
  if (success) {
    await ctx.answerCallbackQuery("✅ Address deleted.");
    // Return to list
    const { results } = await db.getEmailAddressesByUserId(env.D1, ctx.from!.id);
    if (results.length > 0) {
      const text = `📋 *Your Email Addresses* (${results.length}/${MAX_EMAILS_PER_USER})`;
      const keyboard = new InlineKeyboard();
      for (const email of results) {
        keyboard.text(`📖 ${email.address}`, `view_address_info:${email.id}`).row();
      }
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      await ctx.editMessageText("📭 You don't have any active email addresses.", { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("❌ Close", "delete_msg") });
    }
  } else {
    await ctx.answerCallbackQuery("❌ Failed to delete address.");
  }
});

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