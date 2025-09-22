import { CommandsFlavor } from '@grammyjs/commands';
import { MenuFlavor } from '@grammyjs/menu';
import type { Context } from 'grammy';

export type CustomContext = MenuFlavor & CommandsFlavor<Context>;