export type PolicySection = {
  heading: string;
  body: string;
};

export const PRIVACY_POLICY_TITLE = 'Terms of Service and Privacy Policy';
export const PRIVACY_POLICY_EFFECTIVE_DATE = 'September 2026';

export const PRIVACY_POLICY_INTRO =
  "Welcome to KapitPondo: A Community-Based Sinking Fund Ledger and Contribution Monitoring System. KapitPondo respects the privacy of its users. This Privacy Policy explains how the application collects, uses, stores, and protects user information when using the KapitPondo mobile application and web-based system.\n\nBy using KapitPondo, you agree to the terms described in this policy.";

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    heading: '1. Information We Collect',
    body:
      'KapitPondo may collect the following information:\n\n' +
      '• Account Information — name, email address, contact number, and account credentials.\n' +
      '• Member Information — group membership details and assigned user role.\n' +
      '• Financial Information — contribution records, loan requests, loan payments, penalties, expenses, and fund balances.\n' +
      '• Payment Information — payment references, transaction details, and uploaded proof of payment.\n' +
      '• Uploaded Files — documents, receipts, or images submitted as proof of transactions.\n' +
      '• System Information — basic information needed to operate, secure, and maintain the application.',
  },
  {
    heading: '2. How We Use Information',
    body:
      'The information collected by KapitPondo is used to:\n\n' +
      '• Create and manage user accounts.\n' +
      '• Verify and manage group membership.\n' +
      '• Record and monitor contributions and payments.\n' +
      '• Process loan requests and payments.\n' +
      '• Maintain accurate financial records.\n' +
      '• Generate financial reports and transaction history.\n' +
      '• Send important system notifications.\n' +
      '• Maintain security and prevent unauthorized access.\n' +
      '• Improve the functionality and performance of the system.',
  },
  {
    heading: '3. Financial and Payment Information',
    body:
      'KapitPondo uses transaction information to maintain accurate records of contributions, loans, payments, and other fund activities. Payment references and uploaded proofs may be reviewed by authorized group officers for verification.\n\n' +
      'KapitPondo does not intentionally collect unnecessary payment information. Users should avoid submitting passwords, PINs, or other confidential payment credentials as payment proof.',
  },
  {
    heading: '4. Information Sharing',
    body:
      "KapitPondo does not sell or rent users' personal information.\n\n" +
      "Information may be accessible to authorized users based on their assigned roles. For example, group officers may access information necessary to manage the group's financial records, while members may access their own contribution, loan, and payment information.\n\n" +
      'Information may also be disclosed when required by applicable laws, regulations, or legitimate legal requests.',
  },
  {
    heading: '5. Data Security',
    body:
      'KapitPondo uses appropriate security measures to help protect user information from unauthorized access, alteration, disclosure, or loss. Access to system information is controlled through user accounts and role-based permissions.\n\n' +
      'However, no electronic system can guarantee complete security. Users are responsible for keeping their account credentials confidential and should immediately report suspected unauthorized access.',
  },
  {
    heading: '6. Data Retention',
    body:
      "KapitPondo retains information only for as long as necessary to provide the system's services, maintain financial records, support auditing, and comply with applicable requirements.\n\n" +
      "Transaction records may need to be retained for accountability and record-keeping purposes even after a user's account is no longer active.",
  },
  {
    heading: '7. User Rights',
    body:
      'Users may have the right to:\n\n' +
      '• Access their personal information.\n' +
      '• Request correction of inaccurate information.\n' +
      '• Ask about how their information is being used.\n' +
      '• Request deletion of information when applicable.\n' +
      '• Withdraw consent where applicable.\n' +
      '• Report concerns regarding the handling of their personal information.\n\n' +
      'Some information may not be immediately deleted when it is required for legitimate record-keeping, auditing, security, or legal purposes.',
  },
  {
    heading: '8. Cookies and Similar Technologies',
    body:
      'The web version of KapitPondo may use cookies or similar technologies when necessary for login sessions, security, and system functionality. These technologies help the application operate properly and provide a better user experience.',
  },
  {
    heading: '9. Third-Party Services',
    body:
      'KapitPondo may use third-party services for functions such as authentication, database management, file storage, payment processing, notifications, OCR, or other system features. These services may process information according to their own privacy policies and applicable data protection requirements.',
  },
  {
    heading: "10. Children's Privacy",
    body:
      'KapitPondo is intended for users who are legally permitted to use the application and manage financial transactions. The system does not knowingly collect personal information from children without appropriate authorization.',
  },
  {
    heading: '11. Changes to This Privacy Policy',
    body:
      'This Privacy Policy may be updated when necessary to reflect changes in the KapitPondo system, features, or applicable requirements. Users will be informed of significant changes through appropriate system notifications or announcements.',
  },
  {
    heading: '12. Contact Us',
    body:
      'For questions, concerns, or requests regarding this Privacy Policy or the handling of personal information, users may contact the KapitPondo system administrators through the official contact information provided within the application.',
  },
];
