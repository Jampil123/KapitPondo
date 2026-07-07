import { ACCOUNT_STATUS, type AccountStatus } from '@kapitpondo/shared';

type AccountBadgeProps = {
  status: AccountStatus;
};

const intentClasses: Record<NonNullable<ReturnType<typeof getBadgeMeta>['intent']>, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  primary: 'bg-brand/10 text-brand-dark',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

function getBadgeMeta(status: AccountStatus) {
  return ACCOUNT_STATUS[status] ?? { label: status, intent: 'neutral' as const };
}

export function AccountBadge({ status }: AccountBadgeProps) {
  const meta = getBadgeMeta(status);
  const classes = intentClasses[meta.intent] ?? 'bg-surface-alt text-muted';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>
      {meta.label}
    </span>
  );
}
