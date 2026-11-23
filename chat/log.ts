/**
 * Anonymous question log → the Notion table 「小幫手提問 · Chat questions」 (page 「Jason好好聊」).
 * Stores the question, the time, the answer kind, recommended episodes and the reply.
 * Never stores the IP, a visitor ID or anything from earlier turns except the turn number.
 * Needs the Worker secret NOTION_LOG_TOKEN (an insert-only Notion connection shared with that
 * table only) and the var NOTION_LOG_DS (its data source ID). Missing either → nothing is logged.
 * Failures are swallowed: logging must never break or slow an answer (it runs after the reply).
 */
import type { ChatAnswer, Kind } from './core';

const KIND_LABEL: Record<Kind, string> = {
  recommend: '推薦集數 Recommend',
  not_covered: '節目沒聊過 Not covered',
  about_jason: '關於 Jason About Jason',
  about_book: '關於書 About book',
  about_company: '關於公司 About company',
  about_show: '關於節目 About show',
  off_topic: '離題 Off topic',
};

const rich = (s: string) => ({ rich_text: s ? [{ type: 'text', text: { content: s.slice(0, 1900) } }] : [] });

export async function logQuestion(token: string, ds: string, question: string, turn: number, a: ChatAnswer) {
  const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + '+08:00'; // Taipei time
  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: ds },
      properties: {
        '問題 Question': { title: [{ type: 'text', text: { content: question.slice(0, 300) } }] },
        '時間 Time': { date: { start: now } },
        '類型 Kind': { select: { name: KIND_LABEL[a.kind] ?? a.kind } },
        '推薦集數 Episodes': rich(a.episodes.map((e) => `EP.${e.ep}`).join('、')),
        '回答 Reply': rich(a.reply),
        '第幾題 Turn': { number: turn },
      },
    }),
  }).catch(() => undefined);
}
