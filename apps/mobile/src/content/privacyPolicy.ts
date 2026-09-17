/**
 * content/privacyPolicy.ts
 * ----------------------------------------------------------------------------
 * Sample Privacy Policy copy shown in the sign-up screen's policy modal.
 * Placeholder text only — swap in the reviewed/legal-approved copy when it's
 * ready. Keeping it in its own file (separate from screen code) so future
 * revisions don't touch signup.tsx.
 */

export type PolicySection = {
  heading: string;
  body: string;
};

export const PRIVACY_POLICY_TITLE = 'Privacy Policy';
export const PRIVACY_POLICY_EFFECTIVE_DATE = 'September 17, 2026';

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    heading: '1. Information We Collect',
    body:
      'We collect the information you provide when you create an account, ' +
      'such as your name, birthday, phone number, and optional email address. ' +
      'During identity verification, we may also collect a government-issued ID ' +
      'and a selfie photo for verification purposes.',
  },
  {
    heading: '2. How We Use Your Information',
    body:
      'Your information is used to create and secure your account, verify your ' +
      'identity, process your cooperative savings transactions, and communicate ' +
      'with you about your account. We do not sell your personal information.',
  },
  {
    heading: '3. How We Protect Your Information',
    body:
      'We use encryption in transit and at rest, and restrict access to your ' +
      'personal information to authorized personnel who need it to operate ' +
      'KapitPondo.',
  },
  {
    heading: '4. Sharing of Information',
    body:
      'We do not share your personal information with third parties except as ' +
      'required to provide our services (such as identity verification ' +
      'providers), to comply with the law, or with your consent.',
  },
  {
    heading: '5. Your Rights',
    body:
      'You may request to review, update, or delete your personal information ' +
      'at any time by contacting your cooperative administrator or KapitPondo ' +
      'support.',
  },
  {
    heading: '6. Changes to This Policy',
    body:
      'We may update this policy from time to time. We will notify you of any ' +
      'material changes through the app.',
  },
];
