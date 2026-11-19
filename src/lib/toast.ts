import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

// Toast-lar (SPEC §12.3): "Geri al" düyməli bildiriş; ən çox 3, 6 s sonra itir.
export type ToastItem = { id: number; text: string; action?: { label: string; fn: () => void }; kind?: 'info' | 'error' };
const store = createStore<{ items: ToastItem[] }>()(() => ({ items: [] }));
let seq = 0;

export function toast(text: string, opts: { action?: ToastItem['action']; kind?: ToastItem['kind']; ms?: number } = {}) {
  const id = ++seq;
  store.setState((s) => ({ items: [...s.items, { id, text, action: opts.action, kind: opts.kind }].slice(-3) }));
  setTimeout(() => dismiss(id), opts.ms ?? 6000);
  return id;
}
export const dismiss = (id: number) => store.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
export const useToasts = () => useStore(store, (s) => s.items);
