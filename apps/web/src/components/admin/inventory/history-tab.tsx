'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import type { StockMovement, StockReason } from '@restaurant-os/shared';
import { STOCK_REASONS, STOCK_REASON_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR, timeAgo } from '@/lib/utils';
import { Badge, EmptyState, Select } from '@/components/ui';
import { Chip, ChipRow } from '../page-header';
import { useNow } from '../use-now';
import { DataTable, ErrorNote, ListSkeleton, Td, Th, fmtSignedQty, formatIst } from './ops-shared';
import type { InventoryContext } from './inventory-view';

const REASON_TONE: Record<StockReason, 'neutral' | 'sky' | 'mint' | 'rose' | 'saffron' | 'ember'> = {
  sale: 'neutral',
  sale_reversal: 'sky',
  purchase: 'mint',
  waste: 'rose',
  adjustment: 'saffron',
  opening: 'ember',
};

export function HistoryTab({ ctx }: { ctx: InventoryContext }) {
  const { token, ingredients, loadFailed } = ctx;
  const now = useNow(60_000);
  const [reason, setReason] = React.useState<StockReason | ''>('');
  const [ingredientId, setIngredientId] = React.useState('');
  const [rows, setRows] = React.useState<StockMovement[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await adminApi.stockMovements(token, { reason: reason || undefined, ingredient_id: ingredientId || undefined });
      if (id !== requestId.current) return;
      setRows(res);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(loadFailed(e, 'Could not load the stock history.'));
      setRows((p) => p ?? []);
    }
  }, [token, reason, ingredientId, loadFailed]);

  React.useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const sortedIngredients = [...(ingredients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const list = rows ?? [];

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChipRow label="Reason" className="lg:flex-1">
          <Chip active={reason === ''} onClick={() => setReason('')}>
            Everything
          </Chip>
          {STOCK_REASONS.map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {STOCK_REASON_LABEL[r]}
            </Chip>
          ))}
        </ChipRow>
        <div className="lg:w-[260px]">
          <Select aria-label="Ingredient" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className="h-10">
            <option value="">All ingredients</option>
            {sortedIngredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

      <div className="mt-4">
        {rows === null ? (
          <ListSkeleton rows={6} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No stock changes yet"
            description={
              reason || ingredientId
                ? 'Nothing matches these filters. Try “Everything” or all ingredients.'
                : 'Every change shows up here: orders the kitchen accepts, purchases received, waste and stock counts.'
            }
          />
        ) : (
          <>
            <DataTable
              head={
                <tr>
                  <Th>When</Th>
                  <Th>Ingredient</Th>
                  <Th>Reason</Th>
                  <Th right>Change</Th>
                  <Th right>Unit cost</Th>
                  <Th>Note</Th>
                </tr>
              }
            >
              {list.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-muted">
                    <span title={formatIst(m.created_at)}>{timeAgo(m.created_at, now)}</span>
                  </Td>
                  <Td className="font-medium">{m.ingredient?.name ?? 'Removed ingredient'}</Td>
                  <Td>
                    <Badge tone={REASON_TONE[m.reason]}>{STOCK_REASON_LABEL[m.reason]}</Badge>
                  </Td>
                  <Td right className={cn('tnum whitespace-nowrap font-mono font-semibold', m.change < 0 ? 'text-rose' : 'text-[#1b6f49]')}>
                    {fmtSignedQty(m.change, m.ingredient?.unit)}
                  </Td>
                  <Td right className="tnum whitespace-nowrap font-mono text-muted">
                    {m.unit_cost !== null ? formatINR(m.unit_cost) : '—'}
                  </Td>
                  <Td className="max-w-[280px] truncate text-muted">{m.note ?? ''}</Td>
                </tr>
              ))}
            </DataTable>

            <ul className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-soft lg:hidden">
              {list.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.ingredient?.name ?? 'Removed ingredient'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <Badge tone={REASON_TONE[m.reason]}>{STOCK_REASON_LABEL[m.reason]}</Badge>
                      <span>{timeAgo(m.created_at, now)}</span>
                    </div>
                    {m.note && <p className="mt-1 text-xs text-muted">{m.note}</p>}
                  </div>
                  <span className={cn('tnum shrink-0 font-mono font-semibold', m.change < 0 ? 'text-rose' : 'text-[#1b6f49]')}>{fmtSignedQty(m.change, m.ingredient?.unit)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">{list.length >= 300 ? 'Showing the latest 300 changes' : `${list.length} change${list.length === 1 ? '' : 's'}`}</p>
          </>
        )}
      </div>
    </div>
  );
}
