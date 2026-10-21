import { useState } from 'react';
import { PlayIcon } from './ui';

/**
 * The episode's full video on YouTube. Until someone presses play this is just the
 * thumbnail (no YouTube scripts or cookies on page load); the click swaps in the
 * privacy-enhanced youtube-nocookie.com player and starts it.
 */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="yt">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`YouTube：${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="yt-poster" onClick={() => setOn(true)} aria-label={`播放影片：${title}`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="yt-play"><PlayIcon /></span>
        </button>
      )}
    </div>
  );
}
