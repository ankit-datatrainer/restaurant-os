'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import type { Ingredient, Supplier } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { PageHeader } from '../page-header';
import { errorMessage } from '../format';
import { UpgradeCard, isManagerRole, isPlanError } from '../plan';
import { ErrorNote, OpsTabs, isLow, type TabDef } from './ops-shared';
import { StockTab } from './stock-tab';
import { RecipesTab } from './recipes-tab';
import { PurchaseOrdersTab } from './purchase-orders-tab';
import { SuppliersTab } from './suppliers-tab';
import { HistoryTab } from './history-tab';

const INVENTORY_POINTS = [
  'Live stock levels with low-stock alerts',
  'Recipes that deduct stock as the kitchen accepts orders',
  'Food cost and food-cost % for every dish',
  'Purchase orders and supplier contacts in one place',
  'Waste and stock counts, with a full history',
];

type InvTab = 'stock' | 'recipes' | 'purchase' | 'suppliers' | 'history';

export interface InventoryContext {
  token: string;
  canEdit: boolean;
  ingredients: Ingredient[] | null;
  suppliers: Supplier[] | null;
  reloadIngredients: () => Promise<void>;
  reloadSuppliers: () => Promise<void>;
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[] | null>>;
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[] | null>>;
  /** For list loads: a 403 means the plan does not include inventory. Returns the message to show otherwise. */
  loadFailed: (e: unknown, fallback: string) => string | null;
}

export function InventoryView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'inventory')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Inventory" description="Know what is in the store room before you run out." />
        <UpgradeCard plan="premium" title="Stop guessing what is in stock" description="Inventory, recipes and purchasing are part of the Premium plan." points={INVENTORY_POINTS} />
      </div>
    );
  }
  return <InventoryInner />;
}

function InventoryInner() {
  const { token, staff } = useAdmin();
  const canEdit = isManagerRole(staff.role);
  const [tab, setTab] = React.useState<InvTab>('stock');
  const [ingredients, setIngredients] = React.useState<Ingredient[] | null>(null);
  const [suppliers, setSuppliers] = React.useState<Supplier[] | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const loadFailed = React.useCallback((e: unknown, fallback: string) => {
    if (isPlanError(e)) {
      setLocked(e.message);
      return null;
    }
    return errorMessage(e, fallback);
  }, []);

  const reloadIngredients = React.useCallback(async () => {
    try {
      setIngredients(await adminApi.ingredients(token));
      setError(null);
    } catch (e) {
      setError(loadFailed(e, 'Could not load your ingredients.'));
      setIngredients((prev) => prev ?? []);
    }
  }, [token, loadFailed]);

  const reloadSuppliers = React.useCallback(async () => {
    try {
      setSuppliers(await adminApi.suppliers(token));
    } catch (e) {
      setError(loadFailed(e, 'Could not load your suppliers.'));
      setSuppliers((prev) => prev ?? []);
    }
  }, [token, loadFailed]);

  React.useEffect(() => {
    void reloadIngredients();
    void reloadSuppliers();
  }, [reloadIngredients, reloadSuppliers]);

  const lowCount = (ingredients ?? []).filter((i) => i.is_active && isLow(i)).length;

  const tabs: Array<TabDef<InvTab>> = [
    { id: 'stock', label: 'Stock', count: lowCount, tone: 'rose' },
    { id: 'recipes', label: 'Recipes & food cost', short: 'Recipes' },
    { id: 'purchase', label: 'Purchase orders', short: 'Purchases' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'history', label: 'History' },
  ];

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Inventory" />
        <UpgradeCard plan="premium" title="Stop guessing what is in stock" description="Inventory, recipes and purchasing are part of the Premium plan." message={locked} points={INVENTORY_POINTS} />
      </div>
    );
  }

  const ctx: InventoryContext = {
    token,
    canEdit,
    ingredients,
    suppliers,
    reloadIngredients,
    reloadSuppliers,
    setIngredients,
    setSuppliers,
    loadFailed,
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Inventory"
        description={
          canEdit
            ? 'Stock levels, recipes, purchases and suppliers. Stock goes down by itself as the kitchen accepts orders.'
            : 'You can see stock levels. Only owners and managers can change them.'
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            loading={refreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => {
              setRefreshing(true);
              await Promise.all([reloadIngredients(), reloadSuppliers()]);
              setRefreshKey((k) => k + 1);
              setRefreshing(false);
            }}
          >
            Refresh
          </Button>
        }
      />

      <OpsTabs tabs={tabs} value={tab} onChange={setTab} label="Inventory sections" layoutId="inventory-tab" className="mb-4" />

      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      <div key={`${tab}-${refreshKey}`}>
        {tab === 'stock' && <StockTab ctx={ctx} />}
        {tab === 'recipes' && <RecipesTab ctx={ctx} />}
        {tab === 'purchase' && <PurchaseOrdersTab ctx={ctx} />}
        {tab === 'suppliers' && <SuppliersTab ctx={ctx} />}
        {tab === 'history' && <HistoryTab ctx={ctx} />}
      </div>
    </div>
  );
}
