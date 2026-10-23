import type { CommandsFlavor } from '@grammyjs/commands';
import type { MenuFlavor } from '@grammyjs/menu';
import type { Context } from 'grammy';

export type CustomContext = MenuFlavor & CommandsFlavor<Context>;