import { env } from 'cloudflare:workers';
import { commandNotFound, commands } from '@grammyjs/commands';
import { Bot, GrammyError, HttpError } from 'grammy';
import type { CustomContext } from './types';

import { adminComposer, userComposer, commands as commandList } from './commands';

const { TELEGRAM_TOKEN: token } = env;

export const TempMailBot = new Bot<CustomContext>(token);

// Install things
TempMailBot.use(commands());

// Register
TempMailBot.use(adminComposer);
TempMailBot.use(userComposer);

async function setCommands() {
  for (const command of commandList) {
    await command.setCommands(TempMailBot);
  }
}

(async () => { await setCommands(); })

TempMailBot.command('start', async (ctx) => {
  const text = `Welcome to Temp Mail TempMailBot`;

  return await ctx.reply(text);
});

// Suggest command for user!
TempMailBot
  .filter(commandNotFound(commandList))
  .use(async (ctx) => {
    if (ctx.commandSuggestion) {
      return await ctx.reply(
        `Hmm... I don't know that command. Did you mean ${ctx.commandSuggestion}?`,
      );
    }

    // Nothing seems to come close to what the user typed
    await ctx.reply("Oops... I don't know that command :/");
  });

// Catch errors
TempMailBot
  .catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Could not contact Telegram:", e);
    } else {
      console.error("Unknown error:", e);
    }
  });