'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, Printer, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import type { DiningTable } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { pop } from '@/lib/motion';
import { useAdmin } from './admin-provider';
import { TableCard } from './table-card';
import { TableEditor, type TableDraftBody } from './table-editor';
import { PageHeader } from './page-header';
import { useConfirm } from './confirm-dialog';
import { errorMessage } from './format';

export function TablesManager() {
  const { token, tables: ctxTables, loading, refreshTables } = useAdmin();
  const reduce = useReducedMotion();
  const { confirm, dialog } = useConfirm();
  const [tables, setTables] = React.useState<DiningTable[]>(ctxTables);
  const [editor, setEditor] = React.useState<{ open: boolean; table: DiningTable | null }>({ open: false, table: null });
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setTables(ctxTables);
  }, [ctxTables]);

  const sorted = React.useMemo(() => [...tables].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { numeric: true })), [tables]);
  const activeCount = tables.filter((t) => t.is_active).length;

  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const toggleActive = async (table: DiningTable, is_active: boolean) => {
    setTables((list) => list.map((t) => (t.id === table.id ? { ...t, is_active } : t)));
    try {
      await adminApi.updateTable(token, table.id, { is_active });
      await refreshTables();
      toast.success(is_active ? `${table.label} is active.` : `${table.label} is inactive. Its QR shows a closed notice.`);
    } catch (e) {
      setTables((list) => list.map((t) => (t.id === table.id ? table : t)));
      toast.error(errorMessage(e, 'Could not update the table.'));
    }
  };

  const resetCode = async (table: DiningTable) => {
    const ok = await confirm({
      title: `Reset the code for ${table.label}?`,
      description: 'A new QR code is generated. Any sticker already printed with the old code stops working, so print and replace it.',
      confirmLabel: 'Reset code',
      danger: true,
    });
    if (!ok) return;
    mark(table.id, true);
    try {
      const updated = await adminApi.resetTableCode(token, table.id);
      setTables((list) => list.map((t) => (t.id === table.id ? updated : t)));
      await refreshTables();
      toast.success(`${table.label} now uses code ${updated.code}. Print a new sticker.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not reset the code.'));
    } finally {
      mark(table.id, false);
    }
  };

  const remove = async (table: DiningTable) => {
    const ok = await confirm({
      title: `Delete ${table.label}?`,
      description: 'Tables with past orders are deactivated instead of removed, so order history stays intact.',
      confirmLabel: 'Delete table',
      danger: true,
    });
    if (!ok) return;
    mark(table.id, true);
    try {
      await adminApi.deleteTable(token, table.id);
      const fresh = await refreshTables();
      const still = fresh.find((t) => t.id === table.id);
      toast.success(still ? `${table.label} deactivated (it has order history).` : `${table.label} deleted.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the table.'));
    } finally {
      mark(table.id, false);
    }
  };

  const submitEditor = async (body: TableDraftBody): Promise<boolean> => {
    try {
      if (editor.table) {
        const updated = await adminApi.updateTable(token, editor.table.id, { label: body.label, area: body.area, seats: body.seats });
        setTables((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`${updated.label} saved.`);
      } else {
        const created = await adminApi.createTable(token, body);
        setTables((list) => [...list, created]);
        toast.success(`${created.label} added with code ${created.code}.`);
      }
      await refreshTables();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the table.'));
      return false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Tables & QR"
        description={`${activeCount} active table${activeCount === 1 ? '' : 's'}. Each QR opens that table's menu; stickers can be printed six to a page.`}
        actions={
          <>
            <Link href="/admin/tables/print" className="inline-flex h-10 items-center gap-2 rounded-full border border-line/15 px-4 text-sm font-semibold text-fg/80 transition hover:bg-fg/5 hover:text-fg">
              <Printer className="h-4 w-4" aria-hidden /> Print all
            </Link>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, table: null })}>
              Add table
            </Button>
          </>
        }
      />

      {loading && tables.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<QrCode className="h-5 w-5" />}
          title="No tables yet"
          description="Add your first table to get a QR code guests can scan."
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, table: null })}>
              Add table
            </Button>
          }
        />
      ) : (
        <motion.ul layout={!reduce} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {sorted.map((t) => (
              <motion.li key={t.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                <TableCard table={t} busy={busy.has(t.id)} onToggleActive={(tb, v) => void toggleActive(tb, v)} onReset={(tb) => void resetCode(tb)} onEdit={(tb) => setEditor({ open: true, table: tb })} onDelete={(tb) => void remove(tb)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <TableEditor open={editor.open} table={editor.table} onClose={() => setEditor((e) => ({ ...e, open: false }))} onSubmit={submitEditor} />
      {dialog}
    </div>
  );
}
