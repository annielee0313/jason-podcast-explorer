/**
 * Client for the 小幫手 chat API (chat/worker.ts). The widget only appears when VITE_CHAT_URL is
 * set: .env.development points at the local worker; production gets it once the worker is deployed.
 */
export const CHAT_URL: string | undefined = import.meta.env.VITE_CHAT_URL || undefined;
export const MAX_QUESTION = 300; // keep in sync with chat/core.ts

export type ChatKind = 'recommend' | 'about_jason' | 'about_book' | 'about_company' | 'about_show' | 'not_covered' | 'off_topic';
export interface ChatAnswer {
  reply: string;
  kind: ChatKind;
  episodes: { ep: number; reason: string }[];
  sources: ('about_jason' | 'book' | 'company' | 'show')[];
  contact: boolean;
}
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; answer?: ChatAnswer; error?: boolean };

const ERRORS: Record<string, string> = {
  rate_limited: '問得有點快，休息一下再問我～',
  daily_limit: '今天問的問題已經很多了，明天再來聊吧！',
  too_long: `問題有點長，可以濃縮在 ${MAX_QUESTION} 字以內嗎？`,
  paused: '小幫手正在休息，晚點再來找我。',
  busy: '現在問的人有點多，稍等一下再試試。',
};

export async function askChat(history: ChatMessage[]): Promise<ChatAnswer> {
  if (!CHAT_URL) throw new Error('小幫手還沒開放。');
  const messages = history
    .filter((m) => !(m.role === 'assistant' && m.error))
    .map((m) => ({ role: m.role, content: m.content }));
  let res: Response;
  try {
    res = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
  } catch {
    throw new Error('連線不太穩，請再試一次。');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(ERRORS[data.error as string] ?? '出了點狀況，請再試一次。');
  return data as ChatAnswer;
}
