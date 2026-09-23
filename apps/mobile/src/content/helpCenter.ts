export interface HelpItem {
  q: string;
  a: string;
}

export interface HelpSection {
  heading: string;
  items: HelpItem[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    heading: 'Getting started',
    items: [
      {
        q: 'What is KapitPondo?',
        a: 'KapitPondo is a digital paluwagan / cooperative fund manager. It records and verifies money that moves outside the app — cash, bank, or e-wallet transfers — but never holds or moves funds itself. Every contribution, loan, or payout is a claim that must be backed by proof and explicitly approved by someone other than the person who recorded it.',
      },
      {
        q: 'How do I join a group?',
        a: 'Ask your group\'s Organizer or Treasurer for its join code, then use "Join a group by code" from Profile. Your request goes in as Pending until an officer approves it — you\'ll be added as a Member once they do.',
      },
      {
        q: 'What can I do before my identity is verified?',
        a: 'You can join groups and contribute right away. Verification is only required to request a loan, create your own group, or be appointed Treasurer or Auditor — actions that carry more trust. Check the verification card at the top of Profile for your current status.',
      },
    ],
  },
  {
    heading: 'Contributions & cycles',
    items: [
      {
        q: 'What is a "cycle"?',
        a: 'A cycle is one round of your group\'s fund — it sets the contribution frequency, the amount owed per head, and any penalty for late payments. Your Treasurer configures each cycle before it opens.',
      },
      {
        q: 'What counts as proof of a contribution?',
        a: 'A photo of the receipt, bank transfer confirmation, or e-wallet (e.g. GCash) screenshot for the exact amount you paid. Your Treasurer records the posting from that proof, and your group\'s Auditor reviews and approves it before it counts toward your standing.',
      },
      {
        q: 'Why does my contribution still say "Submitted" and not "Posted"?',
        a: 'A contribution moves from Submitted to Approved (Posted) only after an Auditor reviews the proof — this is deliberate: the person recording a transaction is never the same person approving it.',
      },
    ],
  },
  {
    heading: 'Loans',
    items: [
      {
        q: 'How do I request a loan?',
        a: 'From your group, go to Loans and submit a request with the amount and purpose. Loan authorization is decided by the group Organizer; once approved, disbursement is recorded separately by the Treasurer — the same segregation of duties used for every other trust-bearing action.',
      },
      {
        q: 'Why do I need to be verified to request a loan?',
        a: 'Loans are an outflow, so KapitPondo requires identity verification first — it\'s the one control point that confirms who is actually borrowing before any group funds move.',
      },
    ],
  },
  {
    heading: 'Roles & governance',
    items: [
      {
        q: 'What does each group role do?',
        a: 'Organizer — governance, lending decisions, and finalizing cycles. Treasurer — records money movement (contributions, repayments, disbursements). Auditor — verifies and approves the Treasurer\'s postings and proofs. Member — joins, contributes, and requests or repays loans.',
      },
      {
        q: 'Why can\'t the Treasurer also approve their own postings?',
        a: 'That\'s KapitPondo\'s core control rule: the person who records a transaction can never be the one who approves it. It\'s why Treasurer and Auditor are always different people in a healthy group.',
      },
    ],
  },
  {
    heading: 'Verification & security',
    items: [
      {
        q: 'What does verifying my identity unlock?',
        a: 'Requesting a loan, creating your own group, and being appointed Treasurer or Auditor. You can see your current status and what\'s still needed at the top of your Profile.',
      },
      {
        q: 'My ID or selfie photo won\'t display — what do I do?',
        a: 'Pull down to refresh My Submission first — this is usually a slow signed-image load, not a lost photo. If it still won\'t show after that, use Send Feedback below with the "Bug report" category and mention the screen.',
      },
      {
        q: 'Where can I review what KapitPondo collects about me?',
        a: 'Read the full Privacy Policy under Profile → Privacy & security. It covers exactly what\'s collected, why, and how long it\'s kept.',
      },
    ],
  },
];
