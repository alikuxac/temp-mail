import * as kv from '@/database/kv';
import { env } from 'cloudflare:workers';

export async function getTop10Sender() {
  const topSenders = await kv.getTopSenders(env.KV, 10);

  const message = `*Top 10 Senders*\n\n${topSenders
    .map(({ name, count }) => `*${name}*: ${count}`)
    .join("\n")}`;

  return message;
}