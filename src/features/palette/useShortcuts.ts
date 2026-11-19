import { useEffect } from 'react';
import { useNavigate } from 'react-router';

const isTyping = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName));
};

/** Qlobal qısayollar (SPEC §5): Ctrl/⌘+K, "/", g p|e|t|l|s, n, ?. Mətn sahəsində işləmir (Ctrl+K istisna). */
export function useShortcuts({
  openPalette,
  openHelp,
  blocked,
}: {
  openPalette: () => void;
  openHelp: () => void;
  blocked: boolean;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (blocked || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('[aria-modal="true"]'))
        return;
      if (Date.now() - g < 1200) {
        const to = { p: '/', e: '/employees', t: '/tasks', l: '/log', s: '/settings' }[e.key.toLowerCase()];
        g = 0;
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (e.key === 'g') g = Date.now();
      else if (e.key === '/') {
        e.preventDefault();
        openPalette();
      } else if (e.key === '?') {
        e.preventDefault();
        openHelp();
      } else if (e.key === 'n') {
        e.preventDefault();
        navigate('/tasks?task=new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, openPalette, openHelp, blocked]);
}
