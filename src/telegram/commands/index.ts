export * from './admin';
export * from './user';

import { adminCommands } from './admin';
import { userCommands } from './user';

export const commands = [adminCommands, userCommands];