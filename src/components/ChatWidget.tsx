import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { about, episodeByNumber } from '../lib/data';
import { askChat, CHAT_URL, MAX_QUESTION, type ChatAnswer, type ChatMessage } from '../lib/chat';
import { track } from '../lib/analytics';
import { ArrowIcon, CloseIcon } from './ui';

const STORE = 'jhl-chat';
const STARTERS = ['剛開始創業，先聽哪幾集？', '有聊過 AI 怎麼改變工作嗎？', '想聽接手老品牌的故事', 'Jason 是誰？'];
const GREETING = `嗨！想找什麼主題的節目？跟我說你的處境或好奇的事，我從 ${about.stats.episodes} 場對話裡幫你挑。`;

/** Where a non-episode answer comes from, as a link the visitor can check. */
const SOURCE: Record<ChatAnswer['sources'][number], { label: string; href: string; external?: boolean }> = {
  about_jason: { label: '關於 Jason', href: '/' },
  book: { label: `《${about.book.title}》書籍頁`, href: about.book.url, external: true },
  company: { label: `${about.company.name} 官網`, href: about.company.website, external: true },
  show: { label: 'Apple Podcasts', href: about.show.apple, external: true },
};

function load(): ChatMessage[] {
  try { return JSON.parse(sessionStorage.getItem(STORE) ?? '[]'); } catch { return []; }
}

function Answer({ m, question, onNavigate }: { m: Extract<ChatMessage, { role: 'assistant' }>; question: string; onNavigate: () => void }) {
  const a = m.answer;
  const mail = `mailto:${about.company.email}?subject=${encodeURIComponent('Jason好好聊｜聽眾提問')}&body=${encodeURIComponent(question)}`;
  return (
    <div className="chat-msg chat-bot">
      <p>{m.content}</p>
      {a && a.episodes.length > 0 && (
        <ul className="chat-eps">
          {a.episodes.map(({ ep, reason }) => {
            const e = episodeByNumber(ep);
            if (!e) return null;
            return (
              <li key={ep}>
                <Link to={`/episode/${ep}`} className="chat-ep" onClick={onNavigate} data-track="chat_rec_click" data-ep={ep}>
                  <span className="chat-ep-meta mono">EP.{ep} · {e.guest}</span>
                  <span className="chat-ep-title">{e.title}</span>
                  <span className="chat-ep-why">{reason}</span>
                  <span className="chat-ep-src">來源：EP.{ep} 節目說明 <ArrowIcon /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {a && a.sources.length > 0 && (
        <p className="chat-sources">來源：{a.sources.map((s) => {
          const src = SOURCE[s];
          return src.external
            ? <a key={s} href={src.href} target="_blank" rel="noreferrer">{src.label}</a>
            : <Link key={s} to={src.href} state={{ scrollTo: 'about' }} onClick={onNavigate}>{src.label}</Link>;
        })}</p>
      )}
      {a?.contact && (
        <a className="chat-contact" href={mail} data-track="chat_contact">把問題留給我們 <ArrowIcon /></a>
      )}
    </div>
  );
}

/**
 * The 小幫手 chat: a launcher button and a panel (bottom sheet on phones). Answers come only from
 * the show's catalog; every recommendation is an episode card with its source, and questions the
 * show can't answer get a "leave us your question" link. Conversation lives in sessionStorage.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMsgs(load()); }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-20))); } catch { /* private mode */ } }, [msgs]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!CHAT_URL) return null;

  const send = async (q: string) => {
    const question = q.trim().slice(0, MAX_QUESTION);
    if (!question || busy) return;
    const next: ChatMessage[] = [...msgs, { role: 'user', content: question }];
    setMsgs(next);
    setText('');
    setBusy(true);
    track('chat_ask');
    try {
      const answer = await askChat(next);
      setMsgs((m) => [...m, { role: 'assistant', content: answer.reply, answer }]);
      track('chat_answer', { kind: answer.kind });
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', content: (err as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(text); };
  const closeOnPhone = () => { if (window.matchMedia('(max-width: 640px)').matches) setOpen(false); };

  return (
    <>
      {!open && (
        <button type="button" className="chat-launch" onClick={() => { setOpen(true); track('chat_open'); }} aria-haspopup="dialog">
          <span className="chat-launch-dot" aria-hidden="true" />問問小幫手
        </button>
      )}
      {open && (
        <div className="chat-panel" role="dialog" aria-label="小幫手">
          <div className="chat-head">
            <div>
              <div className="chat-title">小幫手</div>
              <div className="chat-sub">只根據節目內容回答，推薦都附來源</div>
            </div>
            <button type="button" className="icon-btn chat-close" aria-label="關閉小幫手" onClick={() => setOpen(false)}><CloseIcon /></button>
          </div>

          <div className="chat-list" ref={listRef} aria-live="polite">
            <div className="chat-msg chat-bot"><p>{GREETING}</p></div>
            {!msgs.length && (
              <div className="chat-starters">
                {STARTERS.map((s) => <button key={s} type="button" onClick={() => void send(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user'
              ? <div key={i} className="chat-msg chat-user"><p>{m.content}</p></div>
              : <Answer key={i} m={m} question={(msgs[i - 1]?.content as string) ?? ''} onNavigate={closeOnPhone} />)}
            {busy && <div className="chat-msg chat-bot chat-typing" aria-label="小幫手正在想"><span /><span /><span /></div>}
          </div>

          <form className="chat-form" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={MAX_QUESTION}
              placeholder="例如：想聽品牌轉型的故事"
              aria-label="輸入問題"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }}
            />
            <button type="submit" className="chat-send" disabled={busy || !text.trim()} aria-label="送出"><ArrowIcon /></button>
          </form>
          <p className="chat-note">AI 依節目說明整理，可能不完整；以節目內容為準。{text.length > MAX_QUESTION - 50 && ` ${text.length}/${MAX_QUESTION}`}</p>
        </div>
      )}
    </>
  );
}
