'use client';

import * as React from 'react';
import { planHas } from '@restaurant-os/shared';
import { useAdmin } from '../admin-provider';
import { PageHeader } from '../page-header';
import { errorMessage } from '../format';
import { UpgradeCard, isManagerRole, isPlanError } from '../plan';
import { OpsTabs, type TabDef } from '../inventory/ops-shared';
import { CouponsTab } from './coupons-tab';
import { HappyHoursTab } from './happy-hours-tab';
import { GiftCardsTab } from './gift-cards-tab';

const PROMO_POINTS = [
  'Coupon codes with limits, minimum orders and end dates',
  'Happy hours that discount the menu automatically',
  'Gift cards with a QR code, redeemed at the counter',
  'Every discount shows on the bill and in your reports',
];

type PromoTab = 'coupons' | 'happy' | 'gift';

export interface PromotionsContext {
  token: string;
  canEdit: boolean;
  /** For list loads: a 403 means the plan does not include promotions. Returns the message to show otherwise. */
  loadFailed: (e: unknown, fallback: string) => string | null;
}

export function PromotionsView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'promotions')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Promotions" description="Bring guests in on quiet days." />
        <UpgradeCard plan="growth" title="Fill the quiet hours" description="Coupons, happy hours and gift cards are part of the Growth plan." points={PROMO_POINTS} />
      </div>
    );
  }
  return <PromotionsInner />;
}

function PromotionsInner() {
  const { token, staff } = useAdmin();
  const canEdit = isManagerRole(staff.role);
  const [tab, setTab] = React.useState<PromoTab>('coupons');
  const [locked, setLocked] = React.useState<string | null>(null);

  const loadFailed = React.useCallback((e: unknown, fallback: string) => {
    if (isPlanError(e)) {
      setLocked(e.message);
      return null;
    }
    return errorMessage(e, fallback);
  }, []);

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Promotions" />
        <UpgradeCard plan="growth" title="Fill the quiet hours" description="Coupons, happy hours and gift cards are part of the Growth plan." message={locked} points={PROMO_POINTS} />
      </div>
    );
  }

  const tabs: Array<TabDef<PromoTab>> = [
    { id: 'coupons', label: 'Coupons' },
    { id: 'happy', label: 'Happy hours' },
    { id: 'gift', label: 'Gift cards' },
  ];

  const ctx: PromotionsContext = { token, canEdit, loadFailed };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Promotions"
        description={canEdit ? 'Coupons, happy hours and gift cards. Discounts apply before service charge and GST.' : 'You can see promotions. Only owners and managers can change them.'}
      />
      <OpsTabs tabs={tabs} value={tab} onChange={setTab} label="Promotion types" layoutId="promotions-tab" className="mb-4" />
      {tab === 'coupons' && <CouponsTab ctx={ctx} />}
      {tab === 'happy' && <HappyHoursTab ctx={ctx} />}
      {tab === 'gift' && <GiftCardsTab ctx={ctx} />}
    </div>
  );
}
