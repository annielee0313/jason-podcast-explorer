/**
 * Cloudflare Worker: POST /chat → 小幫手 answer. Holds the Anthropic key (a Worker secret),
 * so it never reaches the browser.
 *
 * Abuse limits, cheapest first:
 * - only our site's origins may call it (CORS + Origin check)
 * - one short question per request (300 characters), last 6 turns of context
 * - per-visitor rate limit (Workers rate-limiting binding: 8 requests / minute)
 * - per-visitor daily cap (40 questions / day, per Worker instance; best effort)
 * - CHAT_ENABLED=false switches it off without a deploy
 * - the hard backstop: the jason-podcast workspace's monthly spend limit in the Claude Console
 *
 * Questions are logged anonymously to Notion (log.ts) when NOTION_LOG_TOKEN is set.
 */
import Anthropic from '@anthropic-ai/sdk';
import { answer, cleanHistory, MAX_QUESTION } from './core';
import { logQuestion } from './log';

interface WaitUntil { waitUntil(p: Promise<unknown>): void }
interface RateLimit { limit(opts: { key: string }): Promise<{ success: boolean }> }
interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string; // comma-separated
  CHAT_ENABLED?: string;
  CHAT_LIMITER?: RateLimit;
  NOTION_LOG_TOKEN?: string; // secret: insert-only Notion connection (see log.ts)
  NOTION_LOG_DS?: string;
}

const DAILY_CAP = 40;
const daily = new Map<string, { day: string; n: number }>();

function cors(origin: string | null, env: Env) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = !!origin && allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin! : allowed[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(request: Request, env: Env, ctx: WaitUntil): Promise<Response> {
    const { ok, headers } = cors(request.headers.get('Origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers });
    if (new URL(request.url).pathname !== '/chat' || request.method !== 'POST') return json({ error: 'not_found' }, 404, headers);
    if (!ok) return json({ error: 'forbidden' }, 403, headers);
    if (env.CHAT_ENABLED === 'false') return json({ error: 'paused' }, 503, headers);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    if (env.CHAT_LIMITER && !(await env.CHAT_LIMITER.limit({ key: ip })).success) {
      return json({ error: 'rate_limited' }, 429, headers);
    }
    const today = new Date().toISOString().slice(0, 10);
    const used = daily.get(ip);
    const n = used && used.day === today ? used.n : 0;
    if (n >= DAILY_CAP) return json({ error: 'daily_limit' }, 429, headers);

    let body: { messages?: unknown };
    try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400, headers); }
    // Reject (don't silently trim) an over-long question; the site's input enforces the same limit.
    const raw = Array.isArray(body.messages) ? body.messages[body.messages.length - 1] : null;
    if (typeof raw?.content === 'string' && raw.content.trim().length > MAX_QUESTION) return json({ error: 'too_long' }, 400, headers);
    const turns = cleanHistory(body.messages);
    if (!turns) return json({ error: 'bad_request' }, 400, headers);

    daily.set(ip, { day: today, n: n + 1 });
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
      const result = await answer(client, turns);
      // Anonymous log for the team (not from local dev); runs after the reply is sent.
      const origin = request.headers.get('Origin') ?? '';
      if (env.NOTION_LOG_TOKEN && env.NOTION_LOG_DS && !origin.includes('localhost')) {
        const turn = turns.filter((t) => t.role === 'user').length;
        ctx.waitUntil(logQuestion(env.NOTION_LOG_TOKEN, env.NOTION_LOG_DS, turns[turns.length - 1].content, turn, result));
      }
      return json(result, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503, headers);
      if (err instanceof Anthropic.APIError) return json({ error: 'upstream' }, 502, headers);
      return json({ error: 'server' }, 500, headers);
    }
  },
};
