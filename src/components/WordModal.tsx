import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { takeawayLines, type Phrase } from '../lib/data';
import { Modal } from './Modal';

/** Wrap every occurrence of any of `terms` in <mark>, longest term first so 品牌力 beats 品牌. */
function highlight(text: string, terms: string[]) {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'g'));
  return parts.map((p, i) => (sorted.includes(p) ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

/**
 * Every show-note line that mentions a phrase, grouped by episode (newest first),
 * with the phrase highlighted. Each episode links to its page.
 */
export function WordModal({ phrase, onClose }: { phrase: Phrase; onClose: () => void }) {
  const lines = takeawayLines.filter((l) => phrase.terms.some((t) => l.text.includes(t)));
  const byEp = new Map<number, typeof lines>();
  for (const l of lines) byEp.set(l.ep, [...(byEp.get(l.ep) ?? []), l]);

  return (
    <Modal
      title={<>「{phrase.label}」</>}
      subtitle={`出現在 ${byEp.size} 集的節目重點，共 ${lines.length} 句`}
      onClose={onClose}
    >
      <ol className="word-list">
        {[...byEp.entries()].map(([ep, ls]) => (
          <li key={ep}>
            <Link to={`/episode/${ep}`} className="word-ep" onClick={onClose}>
              <span className="mono">EP.{ep}</span>
              <span className="word-ep-title">{ls[0].title}</span>
              <span className="word-ep-guest">{ls[0].guest}</span>
            </Link>
            <ul>{ls.map((l) => <li key={l.text}>{highlight(l.text, phrase.terms)}</li>)}</ul>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
