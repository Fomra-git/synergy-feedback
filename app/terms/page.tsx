import type { Metadata } from "next";
import Link from "next/link";
import { LegalArticle, SiteShell } from "@/components/legal/site-shell";
import { getLegalContext, LEGAL_LAST_UPDATED } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Terms of Service — Synergy Feedback" },
  description: "Terms that apply to using Synergy Feedback, the feedback and forms service of Synergy Wellness.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const { orgName, contactEmail, appUrl } = await getLegalContext();
  const contact = contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <>your nearest {orgName} branch</>;

  return (
    <SiteShell orgName={orgName}>
      <LegalArticle title="Terms of Service" updated={LEGAL_LAST_UPDATED}>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern the use of <strong>Synergy Feedback</strong>, the feedback and
          forms application operated by {orgName} at <a href={appUrl}>{appUrl}</a> (the &ldquo;Service&rdquo;). By using the
          Service you agree to these Terms. If you do not agree, please do not use the Service.
        </p>

        <h2>1. The Service</h2>
        <p>
          Synergy Feedback lets {orgName} create forms, share them with patients and visitors through links and QR codes,
          collect responses, and review them. Authorised staff can optionally copy responses to Google Sheets and receive email
          notifications.
        </p>

        <h2>2. Not for medical emergencies</h2>
        <p>
          Forms are for feedback and administrative information only. They are not monitored in real time and must not be
          used to report a medical emergency or to request urgent care. In an emergency, call your local emergency number.
          Nothing in the Service is medical advice.
        </p>

        <h2>3. Respondents</h2>
        <ul>
          <li>You can fill in a published form without creating an account.</li>
          <li>Please provide accurate information and only submit information you are entitled to share.</li>
          <li>Do not upload files that contain malware or content that is unlawful, abusive or infringes others&rsquo; rights.</li>
          <li>How we handle your information is described in our <Link href="/privacy">Privacy Policy</Link>.</li>
        </ul>

        <h2>4. Staff accounts</h2>
        <ul>
          <li>Administrator accounts are created only by {orgName}. Public sign-up is not available.</li>
          <li>You are responsible for keeping your password confidential and for activity under your account. Tell us immediately if you suspect unauthorised access.</li>
          <li>Use patient information only for legitimate {orgName} purposes and in line with our policies and applicable law.</li>
          <li>We may suspend or remove access at any time, for example when a staff member leaves.</li>
        </ul>

        <h2>5. Google Sheets integration</h2>
        <p>
          If you connect a Google account, you authorise the Service to access it as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link> (section 3). Your use of Google services remains subject to Google&rsquo;s
          own terms. You can disconnect at any time; disconnecting never deletes your spreadsheets. You are responsible for who
          you share connected spreadsheets with.
        </p>

        <h2>6. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>attempt to gain unauthorised access to the Service, other accounts or data;</li>
          <li>interfere with or disrupt the Service, including by sending automated or excessive submissions;</li>
          <li>use the Service to send spam or to collect information unrelated to {orgName}&rsquo;s services;</li>
          <li>reverse engineer or copy the Service except as permitted by law.</li>
        </ul>

        <h2>7. Availability</h2>
        <p>
          We aim to keep the Service available but do not guarantee uninterrupted operation. Third-party services we rely on
          (such as hosting, database, email or Google) may occasionally be unavailable. Submissions are stored in our database
          first, so a temporary Google Sheets outage does not cause responses to be lost.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          The Service, its design and content (excluding respondents&rsquo; submissions) belong to {orgName} or its licensors.
          Respondents keep any rights they have in what they submit and give {orgName} permission to use it for the purposes
          described in our Privacy Policy.
        </p>

        <h2>9. Disclaimer and limitation of liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent permitted by law, {orgName}
          is not liable for indirect, incidental or consequential losses arising from use of the Service. Nothing in these
          Terms limits liability that cannot be limited by law.
        </p>

        <h2>10. Governing law</h2>
        <p>These Terms are governed by the laws of India. The courts at Chennai, Tamil Nadu have jurisdiction over any dispute.</p>

        <h2>11. Changes</h2>
        <p>
          We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date above shows when they last changed.
          Continued use of the Service after a change means you accept the updated Terms.
        </p>

        <h2>12. Contact</h2>
        <p>Questions about these Terms can be sent to {contact}.</p>
      </LegalArticle>
    </SiteShell>
  );
}
