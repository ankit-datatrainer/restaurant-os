'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PiggyBank, ReceiptText, Scale, Wallet } from 'lucide-react';
import { planHas } from '@restaurant-os/shared';
import { EASE_OUT } from '@/lib/motion';
import { useAdmin } from '../admin-provider';
import { PageHeader } from '../page-header';
import { UpgradeCard, isManagerRole } from '../plan';
import { BudgetsTab } from './budgets-tab';
import { CashCloseTab } from './cash-close-tab';
import { ExpensesTab } from './expenses-tab';
import { PnlTab } from './pnl-tab';
import { RoleNote, SegmentTabs, type SegmentTab } from './ui';

type Tab = 'cash' | 'expenses' | 'budgets' | 'pnl';
const TAB_IDS: Tab[] = ['cash', 'expenses', 'budgets', 'pnl'];

const FINANCE_POINTS = [
  'Log every expense by category, vendor and payment mode',
  'Monthly budgets with an early warning at 80%',
  'A plain profit & loss statement for any period',
  'Food cost from recipes, without double counting purchases',
];

/** Remember the tab in ?tab= so a refresh or a shared link opens the same view. */
function useTabParam(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = React.useState<Tab>('cash');
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TAB_IDS.includes(t)) setTab(t);
  }, []);
  const change = React.useCallback((t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'cash') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);
  return [tab, change];
}

export function FinanceView() {
  const { restaurant, staff } = useAdmin();
  const reduce = useReducedMotion();
  const [tab, setTab] = useTabParam();
  const hasFinance = planHas(restaurant.plan, 'finance');

  if (!isManagerRole(staff.role)) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Cash & accounts" />
        <RoleNote title="Only owners and managers can see the accounts">
          Cash close, expenses and profit & loss are kept to owners and managers. Ask your manager if you need something from here.
        </RoleNote>
      </div>
    );
  }

  const tabs: Array<SegmentTab<Tab>> = [
    { id: 'cash', label: 'Cash close', icon: <Wallet /> },
    { id: 'expenses', label: 'Expenses', icon: <ReceiptText />, locked: !hasFinance },
    { id: 'budgets', label: 'Budgets', icon: <PiggyBank />, locked: !hasFinance },
    { id: 'pnl', label: 'Profit & loss', icon: <Scale />, locked: !hasFinance },
  ];

  const upgrade = (
    <UpgradeCard
      title="Know what you actually made"
      description="Expenses, budgets and profit & loss are part of the Growth plan. Daily cash close stays in every plan."
      points={FINANCE_POINTS}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Cash & accounts"
        description={
          tab === 'cash'
            ? 'Count the drawer at the end of the day and record any difference.'
            : tab === 'expenses'
              ? 'Everything you spend, by day and category.'
              : tab === 'budgets'
                ? 'Monthly limits per category, with spending so far.'
                : 'Sales, costs and what is left, for any period.'
        }
      />
      <SegmentTabs tabs={tabs} value={tab} onChange={setTab} label="Accounts sections" className="mb-5" />
      <motion.div
        key={tab}
        role="tabpanel"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        {tab === 'cash' ? <CashCloseTab /> : !hasFinance ? upgrade : tab === 'expenses' ? <ExpensesTab /> : tab === 'budgets' ? <BudgetsTab /> : <PnlTab />}
      </motion.div>
    </div>
  );
}
