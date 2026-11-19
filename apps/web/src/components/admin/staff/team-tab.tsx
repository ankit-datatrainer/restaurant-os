'use client';

import * as React from 'react';
import { Check, Copy, MessageCircle, Pencil, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { toast } from 'sonner';
import type { StaffInvite, StaffMember, StaffRole } from '@restaurant-os/shared';
import { STAFF_ROLES, STAFF_ROLE_LABEL, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Sheet, Skeleton } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { isManagerRole } from '../plan';
import { ErrorNote } from '../finance/ui';
import { clockTime, onShiftChange } from './shift';

const ROLE_HINT: Record<StaffRole, string> = {
  owner: 'Everything, including staff roles, backups and plan',
  manager: 'Runs the floor, menu, accounts and invites',
  kitchen: 'Kitchen board and orders',
  waiter: 'Orders, floor, counter POS and billing',
};

function joinUrl(code: string): string {
  return `${window.location.origin}/admin/join?code=${encodeURIComponent(code)}`;
}

function daysLeft(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

function expiresLabel(iso: string): string {
  const d = daysLeft(iso);
  if (d <= 0) return 'Expires today';
  return d === 1 ? 'Expires in 1 day' : `Expires in ${d} days`;
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error('Could not copy. Select the text and copy it yourself.');
  }
}

export function TeamTab() {
  const { token, staff: me } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const isOwner = me.role === 'owner';
  const canInvite = isManagerRole(me.role);
  const [members, setMembers] = React.useState<StaffMember[] | null>(null);
  const [invites, setInvites] = React.useState<StaffInvite[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const loadMembers = React.useCallback(async () => {
    try {
      setMembers(await adminApi.staff(token));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your team.'));
      setMembers((m) => m ?? []);
    }
  }, [token]);

  const loadInvites = React.useCallback(async () => {
    if (!canInvite) return;
    try {
      setInvites(await adminApi.staffInvites(token));
    } catch {
      setInvites((i) => i ?? []);
    }
  }, [token, canInvite]);

  React.useEffect(() => {
    void loadMembers();
    void loadInvites();
  }, [loadMembers, loadInvites]);

  // Clocking in from the topbar updates "On shift" here too.
  React.useEffect(() => onShiftChange(() => void loadMembers()), [loadMembers]);

  const saveMember = async (m: StaffMember, patch: { role?: StaffRole; display_name?: string }) => {
    setBusyId(m.id);
    try {
      const updated = await adminApi.updateStaff(token, m.id, patch);
      setMembers((list) => (list ?? []).map((x) => (x.id === m.id ? { ...x, ...updated } : x)));
      setEditingId(null);
      toast.success(`${updated.display_name} saved.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the change.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: StaffMember) => {
    const ok = await confirm({
      title: `Remove ${m.display_name}?`,
      description: 'They are signed out of this restaurant straight away. Their past shifts and activity stay in the records. You can invite them again later.',
      confirmLabel: 'Remove from team',
      danger: true,
    });
    if (!ok) return;
    setBusyId(m.id);
    try {
      await adminApi.removeStaff(token, m.id);
      setMembers((list) => (list ?? []).filter((x) => x.id !== m.id));
      toast.success(`${m.display_name} removed from the team.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove them.'));
    } finally {
      setBusyId(null);
    }
  };

  const cancelInvite = async (inv: StaffInvite) => {
    const ok = await confirm({
      title: `Cancel invite ${inv.code}?`,
      description: 'The code stops working. Anyone you sent it to will need a new one.',
      confirmLabel: 'Cancel invite',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteStaffInvite(token, inv.id);
      setInvites((list) => (list ?? []).filter((x) => x.id !== inv.id));
      toast.success('Invite cancelled.');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not cancel the invite.'));
    }
  };

  return (
    <div className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted sm:flex-1">
          {members ? (error ? '' : `${members.length} ${members.length === 1 ? 'person' : 'people'} on the team.`) : 'Loading your team…'}
          {!isOwner && ' Only the owner can change roles or remove people.'}
        </p>
        {canInvite && (
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)} className="self-start">
            Invite someone
          </Button>
        )}
      </div>

      {members === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : members.length === 0 ? (
        error ? null : <EmptyState icon={<UsersRound className="h-5 w-5" />} title="No team members yet" description="Invite your managers, kitchen and floor staff with a code." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              isMe={m.user_id === me.user_id}
              canEdit={isOwner}
              editing={editingId === m.id}
              busy={busyId === m.id}
              onEdit={() => setEditingId(m.id)}
              onCancel={() => setEditingId(null)}
              onSave={(patch) => void saveMember(m, patch)}
              onRemove={() => void remove(m)}
            />
          ))}
        </ul>
      )}

      {canInvite && (
        <Card>
          <CardHeader title="Pending invites" description="Codes that have not been used yet. Each works once and expires after 7 days." />
          <CardBody className="pt-4">
            {invites === null ? (
              <Skeleton className="h-14 w-full rounded-xl" />
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted">No pending invites.</p>
            ) : (
              <ul className="divide-y divide-line/10">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <span className="tnum font-mono text-lg font-semibold tracking-[0.12em]">{inv.code}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{inv.display_name || 'Anyone with the code'}</span>
                      <span className="text-muted"> · {STAFF_ROLE_LABEL[inv.role]} · {expiresLabel(inv.expires_at)}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copyText(joinUrl(inv.code), 'Join link')}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg/80 transition hover:bg-fg/5"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden /> Link
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelInvite(inv)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-rose transition hover:bg-rose-soft"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden /> Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {canInvite && (
        <InviteSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          canInviteOwner={isOwner}
          onCreated={(inv) => setInvites((list) => [inv, ...(list ?? []).filter((x) => x.id !== inv.id)])}
        />
      )}
      {dialog}
    </div>
  );
}

function MemberCard({
  member: m,
  isMe,
  canEdit,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  member: StaffMember;
  isMe: boolean;
  canEdit: boolean;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { role?: StaffRole; display_name?: string }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = React.useState(m.display_name);
  const [role, setRole] = React.useState<StaffRole>(m.role);
  const [nameError, setNameError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (editing) {
      setName(m.display_name);
      setRole(m.role);
      setNameError(null);
    }
  }, [editing, m.display_name, m.role]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setNameError('Add a name.');
      return;
    }
    const patch: { role?: StaffRole; display_name?: string } = {};
    if (n !== m.display_name) patch.display_name = n;
    if (role !== m.role) patch.role = role;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  };

  return (
    <li className="rounded-2xl border border-line/10 bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold',
            m.open_shift ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-fg/70',
          )}
          aria-hidden
        >
          {initials(m.display_name) || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-semibold">{m.display_name}</span>
            {isMe && <span className="font-mono text-2xs uppercase tracking-[0.12em] text-muted">You</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={m.role === 'owner' ? 'ink' : m.role === 'manager' ? 'ember' : 'neutral'}>{STAFF_ROLE_LABEL[m.role]}</Badge>
            {m.open_shift ? (
              <Badge tone="mint" dot>
                On shift since {clockTime(m.open_shift.clock_in)}
              </Badge>
            ) : (
              <Badge tone="neutral">Off shift</Badge>
            )}
          </div>
        </div>
        {canEdit && !editing && (
          <div className="-mr-1.5 -mt-1 flex shrink-0">
            <button type="button" onClick={onEdit} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg" aria-label={`Edit ${m.display_name}`} title="Rename or change role">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!isMe && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose disabled:opacity-40"
                aria-label={`Remove ${m.display_name}`}
                title="Remove from team"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-line/10 pt-4" noValidate>
          <Input label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={nameError ?? undefined} autoFocus />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} hint={ROLE_HINT[role]}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          {isMe && role !== 'owner' && m.role === 'owner' && <p className="text-xs text-[#8a5a00]">You are changing your own role. You will lose owner access once you save.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy} leftIcon={<Check className="h-4 w-4" />}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-xs text-muted">
          <span className="tnum font-mono font-semibold text-fg">{(Math.round(m.hours_7d * 10) / 10).toFixed(1)} h</span> worked in the last 7 days
        </p>
      )}
    </li>
  );
}

function InviteSheet({
  open,
  onClose,
  canInviteOwner,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  canInviteOwner: boolean;
  onCreated: (inv: StaffInvite) => void;
}) {
  const { token, restaurant } = useAdmin();
  const [role, setRole] = React.useState<StaffRole>('waiter');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [invite, setInvite] = React.useState<StaffInvite | null>(null);

  React.useEffect(() => {
    if (open) {
      setInvite(null);
      setRole('waiter');
      setName('');
    }
  }, [open]);

  const roles = STAFF_ROLES.filter((r) => canInviteOwner || r !== 'owner');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const inv = await adminApi.createStaffInvite(token, { role, display_name: name.trim() || undefined });
      setInvite(inv);
      onCreated(inv);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the invite.'));
    } finally {
      setBusy(false);
    }
  };

  const link = invite ? joinUrl(invite.code) : '';
  const message = invite
    ? `${invite.display_name ? `Hi ${invite.display_name}, you're` : "You're"} invited to join ${restaurant.name} on Restaurant OS as ${STAFF_ROLE_LABEL[invite.role]}. Open ${link} and create your account. Invite code: ${invite.code} (valid for 7 days).`
    : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={invite ? 'Invite ready' : 'Invite someone'}
      description={invite ? 'Share the code or the link. It works once and expires in 7 days.' : 'They create their own login with the code. Nobody shares passwords.'}
      footer={
        invite ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInvite(null)}>
              Invite another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={busy} leftIcon={<UserPlus className="h-4 w-4" />}>
              Create invite
            </Button>
          </div>
        )
      }
    >
      {invite ? (
        <div className="grid gap-4 pb-2">
          <div className="rounded-3xl bg-ink p-5 text-center text-paper">
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-paper/60">Invite code</p>
            <p className="tnum mt-2 select-all font-mono text-[34px] font-semibold tracking-[0.18em] sm:text-[40px]">{invite.code}</p>
            <p className="mt-2 text-sm text-paper/70">
              {invite.display_name ? `${invite.display_name} · ` : ''}
              {STAFF_ROLE_LABEL[invite.role]} · {expiresLabel(invite.expires_at)}
            </p>
            <button
              type="button"
              onClick={() => void copyText(invite.code, 'Code')}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-paper/20 px-4 text-[13px] font-semibold text-paper transition hover:bg-paper/10"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy code
            </button>
          </div>

          <div className="grid gap-1.5">
            <p className="text-[13px] font-semibold text-fg/80">Join link</p>
            <div className="flex items-center gap-2 rounded-xl border border-line/15 bg-sunk/50 p-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80" title={link}>
                {link}
              </span>
              <Button size="sm" variant="outline" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyText(link, 'Link')}>
                Copy
              </Button>
            </div>
          </div>

          <Button href={whatsappLink(null, message)} external variant="success" leftIcon={<MessageCircle className="h-4 w-4" />}>
            Share on WhatsApp
          </Button>
          <p className="text-xs text-muted">WhatsApp opens with the message ready; pick the person and tap send. Nothing is sent automatically.</p>
        </div>
      ) : (
        <form id="invite-form" onSubmit={create} className="grid gap-4 pb-2" noValidate>
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} hint={ROLE_HINT[role]}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Input label="Their name (optional)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Priya" hint="Helps you tell pending invites apart. They type their own name when they join." />
        </form>
      )}
    </Sheet>
  );
}
