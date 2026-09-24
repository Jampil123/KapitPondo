// key must exactly match a string in the eligibility API's `reasons` array.
export const ELIGIBILITY_CHECKS: { key: string; passTitle: string; failTitle: string; sub: string }[] = [
  { key: 'Member is not verified', passTitle: 'Account verified', failTitle: 'Account not verified', sub: 'Submit a valid ID from your profile. Usually reviewed within a couple of days.' },
  { key: 'Every head already has a loan in progress', passTitle: 'A head is free for a loan', failTitle: 'Every head already has a loan', sub: 'Each head can carry one loan. Settle one, or add a head, before requesting another.' },
  { key: 'Member has an unresolved late-contribution penalty', passTitle: 'No unresolved penalty', failTitle: 'An unresolved late-payment penalty', sub: 'Settle the overdue contribution behind it — the Organizer reviews the penalty separately.' },
];
