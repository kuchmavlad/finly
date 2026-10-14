import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';

type Selection = { identity: string; index: number | null };
type Selections = Record<string, Selection>;
const Context = createContext<{ selections: Selections; update: Dispatch<SetStateAction<Selections>> } | null>(null);

export function ChartSelectionProvider({ children }: { children: ReactNode }) {
  const [selections, update] = useState<Selections>({});
  return <Context.Provider value={{ selections, update }}>{children}</Context.Provider>;
}

// Keep selection while visiting Settings, even if navigation unmounts the screen.
export function useChartSelection(slot: string, identity: string) {
  const context = useContext(Context);
  if (!context) throw new Error('Missing chart selection provider');
  const { selections, update } = context;
  const entry = selections[slot];
  const selected = entry?.identity === identity ? entry.index : null;
  useEffect(() => {
    update(previous => previous[slot]?.identity === identity ? previous : { ...previous, [slot]: { identity, index: null } });
  }, [slot, identity, update]);
  const setSelected = useCallback((next: SetStateAction<number | null>) => {
    update(previous => {
      const current = previous[slot]?.identity === identity ? previous[slot].index : null;
      const index = typeof next === 'function' ? next(current) : next;
      return { ...previous, [slot]: { identity, index } };
    });
  }, [slot, identity, update]);
  return [selected, setSelected] as const;
}
