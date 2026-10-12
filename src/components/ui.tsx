import { themeById, type ThemeId } from '../lib/data';

export function ThemeChip({ id }: { id: ThemeId }) {
  const t = themeById[id];
  return (
    <span className="chip" style={{ background: t.bg, color: t.fg }}>
      {t.name}
    </span>
  );
}

const iconProps = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

export const PlayIcon = () => (
  <svg {...iconProps}><polygon points="6 4 20 12 6 20 6 4" /></svg>
);
export const ArrowIcon = () => (
  <svg {...iconProps}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
);
export const ShuffleIcon = () => (
  <svg {...iconProps}>
    <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...iconProps} width={18} height={18}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);
export const ArrowUpRightIcon = () => (
  <svg {...iconProps}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></svg>
);
