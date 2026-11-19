'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, History, UsersRound } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';
import { useAdmin } from '../admin-provider';
import { PageHeader } from '../page-header';
import { isManagerRole } from '../plan';
import { SegmentTabs, type SegmentTab } from '../finance/ui';
import { ActivityTab } from './activity-tab';
import { AttendanceTab } from './attendance-tab';
import { TeamTab } from './team-tab';

type Tab = 'team' | 'attendance' | 'activity';

const DESCRIPTION: Record<Tab, string> = {
  team: 'Who works here, their role, and who is on shift right now.',
  attendance: 'Clock in and out, and see hours worked.',
  activity: 'Who did what: bills, refunds, cancellations, price changes and more.',
};

export function StaffView() {
  const { staff } = useAdmin();
  const reduce = useReducedMotion();
  const manager = isManagerRole(staff.role);
  const [tab, setTab] = React.useState<Tab>('team');

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'attendance' || (t === 'activity' && manager) || t === 'team') setTab(t);
  }, [manager]);

  const change = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'team') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  const tabs: Array<SegmentTab<Tab>> = [
    { id: 'team', label: 'Team', icon: <UsersRound /> },
    { id: 'attendance', label: 'Attendance', icon: <Clock /> },
    ...(manager ? [{ id: 'activity' as const, label: 'Activity log', icon: <History /> }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Staff & attendance" description={DESCRIPTION[tab]} />
      <SegmentTabs tabs={tabs} value={tab} onChange={change} label="Staff sections" className="mb-5" />
      <motion.div
        key={tab}
        role="tabpanel"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        {tab === 'team' ? <TeamTab /> : tab === 'attendance' ? <AttendanceTab /> : manager ? <ActivityTab /> : <TeamTab />}
      </motion.div>
    </div>
  );
}
