/**
 * features/signoff/signoff.ts
 * ----------------------------------------------------------------------------
 * The two-step money flow (migration 0075), from the signed-in officer's side:
 * every record still waiting on a sign-off, which step it's at, and whether
 * that step is theirs. The rules mirror the SQL helpers
 * (money_in_confirm_role / money_in_verify_role / loan_duty_role) — the server
 * is the one that enforces them; this only decides what to show whom.
 *
 *   Money in:  submitted ─confirm─▶ confirmed ─verify─▶ posted
 *   Loans:     approved ─(review, officer loans)─▶ release ─verify release─▶ posted
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '../../hooks/useApi';
import { useActiveGroup } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';
import { listMembers } from '../../api/groups';
import { useContributions } from '../contributions/contributions.hooks';
import { useLoans, useRepayments } from '../lending/lending.hooks';
import { useReversalRequests } from '../ledger/ledger.hooks';
import type { Money } from '../../lib/money';
import type { ProofReading } from '../../api/contributions';

export type Role = 'owner' | 'treasurer' | 'auditor' | 'member';
export type SignoffAction = 'confirm' | 'verify' | 'review' | 'release' | 'verify_release';
export type SignoffKind = 'contribution' | 'repayment' | 'reversal' | 'loan';

export const ROLE_NAME: Record<Role, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

export const ACTION_LABEL: Record<SignoffAction, string> = {
  confirm: 'Confirm',
  verify: 'Verify',
  review: 'Review',
  release: 'Release',
  verify_release: 'Verify release',
};

// Same rules as 0075's SQL helpers.
export const confirmRole = (payer: Role): Role => (payer === 'treasurer' ? 'owner' : 'treasurer');
export const verifyRole = (payer: Role, recorder: Role, hasAuditor: boolean): Role => (payer === 'auditor' || recorder === 'auditor' || !hasAuditor ? 'owner' : 'auditor');
export const loanRole = {
  review: (b: Role): Role => (b === 'auditor' ? 'treasurer' : 'auditor'),
  release: (b: Role): Role => (b === 'treasurer' ? 'owner' : 'treasurer'),
  verify: (b: Role): Role => (b === 'auditor' ? 'owner' : 'auditor'),
};

export interface SignoffItem {
  key: string;
  kind: SignoffKind;
  id: string;
  /** The step the record is waiting for. */
  action: SignoffAction;
  /** The role that step belongs to. */
  role: Role;
  /** True when the signed-in officer can take this step now. */
  mine: boolean;
  /** Set when it's this role's step but this person is barred (their own money, or they did the other step). */
  blockedReason: string | null;
  name: string;
  /** "Contribution", "Loan repayment", "Loan release"... */
  label: string;
  amount: Money | null;
  /** When the record reached this step — oldest first in queues. */
  since: string;
  proofUrl?: string | null;
  note?: string | null;
  walkIn?: boolean;
  /** The signed-in officer is the payer / borrower — shown locked, routed to someone else. */
  own: boolean;
  /** Name of the person whose step it is (for "Routed to Ben Aquino (Organizer)"). */
  holder: string | null;
  /** Money in only — what the detail page compares against the proof. */
  recordedBy?: string | null;
  recordedAt?: string;
  method?: string | null;
  reference?: string | null;
  reading?: ProofReading | null;
  /** The payer's membership (heads, for the "matches what is due" check). */
  membershipId?: string | null;
  /** Contributions: which cycle it's for. */
  cycleId?: string | null;
}

/** Everything waiting on a sign-off in the group, each marked with whose step it is. */
export function useSignoffQueue(groupId: string) {
  const { member } = useAuth();
  const { membership } = useActiveGroup();
  const contribs = useContributions(groupId, {});
  const repayments = useRepayments(groupId);
  const reversals = useReversalRequests(groupId);
  const loans = useLoans(groupId);
  const membersFn = useCallback(() => listMembers(groupId), [groupId]);
  const members = useQuery(membersFn, [groupId], { table: 'memberships', filter: `group_id=eq.${groupId}` });

  const items = useMemo((): SignoffItem[] => {
    const me = member?.id ?? null;
    const myRole = (membership?.role ?? 'member') as Role;
    const roleById = new Map((members.data ?? []).filter((m) => m.status === 'active').map((m) => [m.member_id, m.role as Role]));
    const hasAuditor = [...roleById.values()].includes('auditor');
    const roleOf = (memberId?: string | null): Role => (memberId ? roleById.get(memberId) ?? 'member' : 'member');
    const holderOf = (role: Role) => (members.data ?? []).find((m) => m.status === 'active' && m.role === role)?.members?.full_name ?? null;
    const withHolder = <T extends { role: Role }>(who: T) => ({ ...who, holder: holderOf(who.role) });

    // Whose step, and whether I can take it. `barred` = people who may not act on this record.
    const decide = (role: Role, barred: (string | null | undefined)[], barredWhy: string) => {
      const isMyRole = myRole === role;
      const blocked = isMyRole && !!me && barred.includes(me);
      return { role, mine: isMyRole && !blocked, blockedReason: blocked ? barredWhy : null };
    };

    const out: SignoffItem[] = [];

    (contribs.data ?? []).forEach((c) => {
      if (c.status !== 'submitted' && c.status !== 'confirmed') return;
      const payer = c.memberships?.member_id ?? null;
      const payerRole = roleOf(payer);
      const confirming = c.status === 'submitted';
      const who = confirming
        ? decide(confirmRole(payerRole), [payer, c.recorded_by], 'Your own or recorded by you')
        : decide(verifyRole(payerRole, roleOf(c.recorded_by), hasAuditor), [payer, c.recorded_by, c.confirmed_by], 'You paid, recorded or confirmed it');
      out.push({
        key: `c-${c.id}`, kind: 'contribution', id: c.id, action: confirming ? 'confirm' : 'verify', ...withHolder(who), own: payer === me,
        name: c.memberships?.members?.full_name ?? 'Member', label: 'Contribution', amount: c.amount,
        since: (confirming ? c.created_at : c.confirmed_at) ?? c.created_at, proofUrl: c.proof_signed_url, walkIn: c.is_walk_in,
        recordedBy: c.recorder?.full_name ?? null, recordedAt: c.created_at, method: c.payment_method, reference: c.external_reference,
        reading: c.proof_reading ?? null, membershipId: c.membership_id, cycleId: c.cycle_id,
      });
    });

    (repayments.data ?? []).forEach((p) => {
      if (p.status !== 'submitted' && p.status !== 'confirmed') return;
      const borrower = p.loans?.membership?.member_id ?? null;
      const borrowerRole = roleOf(borrower);
      const confirming = p.status === 'submitted';
      const who = confirming
        ? decide(confirmRole(borrowerRole), [borrower, p.recorded_by], 'Your own loan or recorded by you')
        : decide(verifyRole(borrowerRole, roleOf(p.recorded_by), hasAuditor), [borrower, p.recorded_by, p.confirmed_by], 'Your loan, or you recorded or confirmed it');
      out.push({
        key: `p-${p.id}`, kind: 'repayment', id: p.id, action: confirming ? 'confirm' : 'verify', ...withHolder(who), own: borrower === me,
        name: p.loans?.membership?.members?.full_name ?? 'Member', label: 'Loan repayment', amount: p.amount,
        since: (confirming ? p.created_at : p.confirmed_at) ?? p.created_at, proofUrl: p.proof_signed_url, walkIn: p.is_walk_in,
        recordedBy: p.recorder?.full_name ?? null, recordedAt: p.created_at, method: p.payment_method, reference: p.external_reference,
        reading: p.proof_reading ?? null, membershipId: p.loans?.membership_id ?? null,
      });
    });

    // Reversals: Treasurer starts, Auditor verifies, Organizer finalizes — only the verify step is queued here.
    (reversals.data ?? []).forEach((r) => {
      if (r.status !== 'pending_verification') return;
      const owner = r.entry?.membership_id ? (members.data ?? []).find((m) => m.id === r.entry!.membership_id)?.member_id ?? null : null;
      const who = decide('auditor', [owner], 'This entry is yours');
      out.push({
        key: `r-${r.id}`, kind: 'reversal', id: r.id, action: 'verify', ...withHolder(who), own: owner === me,
        name: r.entry?.description ?? r.entry?.entry_type.replace(/_/g, ' ') ?? 'Ledger entry', label: 'Reversal',
        amount: r.entry ? r.entry.amount : null, since: r.initiated_at, note: r.reason,
      });
    });

    (loans.data ?? []).forEach((l) => {
      const borrower = l.membership?.member_id ?? null;
      const b = roleOf(borrower);
      const amount = l.approved_principal ?? l.principal;
      const name = l.membership?.members?.full_name ?? 'Member';
      if (l.status === 'approved' && l.review_required && !l.reviewed_at) {
        out.push({ key: `lr-${l.id}`, kind: 'loan', id: l.id, action: 'review', ...withHolder(decide(loanRole.review(b), [borrower, l.approved_by], 'Your loan, or you approved it')), own: borrower === me, name, label: 'Officer loan', amount, since: l.approved_at ?? l.applied_at, note: l.purpose });
      } else if (l.status === 'approved') {
        out.push({ key: `ll-${l.id}`, kind: 'loan', id: l.id, action: 'release', ...withHolder(decide(loanRole.release(b), [borrower], 'This is your loan')), own: borrower === me, name, label: 'Loan to release', amount, since: l.reviewed_at ?? l.approved_at ?? l.applied_at, note: l.purpose });
      } else if (l.disbursed_at && !l.disbursed_ledger_entry_id) {
        out.push({ key: `lv-${l.id}`, kind: 'loan', id: l.id, action: 'verify_release', ...withHolder(decide(loanRole.verify(b), [borrower, l.disbursed_by], 'Your loan, or you released it')), own: borrower === me, name, label: 'Loan release', amount, since: l.disbursed_at });
      }
    });

    return out.sort((a, b) => (a.since < b.since ? -1 : 1));
  }, [contribs.data, repayments.data, reversals.data, loans.data, members.data, member?.id, membership?.role]);

  const refetch = useCallback(() => {
    contribs.refetch(); repayments.refetch(); reversals.refetch(); loans.refetch();
  }, [contribs, repayments, reversals, loans]);

  const loading = contribs.loading || repayments.loading || reversals.loading || loans.loading || members.loading;
  const members_ = members.data ?? [];
  return { items, mine: items.filter((i) => i.mine), own: items.filter((i) => i.own), members: members_, loading, refetch };
}

/** Who confirms and who verifies a payer's own submission — for the member's Progress steps ("Confirmed by the Treasurer"). */
export function signoffRoles(payerRole: string | null | undefined): { confirmer: string; verifier: string } {
  const payer = (payerRole ?? 'member') as Role;
  return { confirmer: ROLE_NAME[confirmRole(payer)], verifier: ROLE_NAME[verifyRole(payer, payer, true)] };
}

/**
 * The member's Progress steps for a submission in the two-step flow:
 * submitted ✓ → confirmed by the {confirmer} (✓ once status is 'confirmed') →
 * verified by the {verifier} and posted.
 */
export function progressSteps(
  record: { status: string; created_at: string; confirmed_at?: string | null },
  roles: { confirmer: string; verifier: string },
  postedSub: string,
  fmt: (iso: string | null | undefined) => string,
) {
  const confirmed = record.status === 'confirmed';
  return [
    { done: true, now: false, title: 'You submitted your proof', sub: fmt(record.created_at) },
    confirmed
      ? { done: true, now: false, title: `Confirmed by the ${roles.confirmer}`, sub: fmt(record.confirmed_at ?? null) }
      : { done: false, now: true, title: `The ${roles.confirmer} is checking it arrived`, sub: 'Checked against the amount and reference number' },
    confirmed
      ? { done: false, now: true, title: `The ${roles.verifier} is verifying`, sub: `Posted to the ledger once verified · ${postedSub.charAt(0).toLowerCase()}${postedSub.slice(1)}` }
      : { done: false, now: false, title: `Verified by the ${roles.verifier} and posted`, sub: postedSub },
  ];
}

/**
 * A borrower's loan journey, in the words of their own "My loan" screen: who
 * decides, who reviews (officer loans only), who releases. Mirrors 0075's
 * loan_duty_role table.
 */
export function loanChain(borrowerRole: string | null | undefined) {
  const b = (borrowerRole ?? 'member') as Role;
  const officer = b === 'owner' || b === 'treasurer' || b === 'auditor';
  return {
    approver: ROLE_NAME[b === 'owner' ? 'treasurer' : 'owner'],
    reviewer: officer ? ROLE_NAME[loanRole.review(b)] : null,
    releaser: ROLE_NAME[loanRole.release(b)],
  };
}
