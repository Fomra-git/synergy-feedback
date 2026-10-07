import type { Metadata } from "next";
import Link from "next/link";
import { LegalArticle, SiteShell } from "@/components/legal/site-shell";
import { getLegalContext, LEGAL_LAST_UPDATED } from "@/lib/legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy — Synergy Feedback" },
  description: "How Synergy Feedback collects, uses, stores and protects information, including data received from Google APIs.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPolicyPage() {
  const { orgName, contactEmail, website, appUrl } = await getLegalContext();
  const contact = contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <>your nearest {orgName} branch</>
  );

  return (
    <SiteShell orgName={orgName}>
      <LegalArticle title="Privacy Policy" updated={LEGAL_LAST_UPDATED}>
        <p>
          This Privacy Policy explains how {orgName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, stores and protects
          information through <strong>Synergy Feedback</strong>, our feedback and forms application available at{" "}
          <a href={appUrl}>{appUrl}</a> (the &ldquo;Service&rdquo;). It applies to patients and visitors who fill in our forms
          (&ldquo;respondents&rdquo;) and to our staff who manage forms (&ldquo;administrators&rdquo;).
        </p>

        <h2>1. Information we collect</h2>
        <h3>From respondents</h3>
        <ul>
          <li>
            <strong>Your answers.</strong> The information you choose to enter in a form, such as your name, phone number,
            email address, the branch or treatment you received, ratings, comments, and any files or signature you provide.
            Some forms may ask about your health or treatment experience.
          </li>
          <li>
            <strong>Submission details.</strong> A submission reference number (for example SW-20261006-000123) and the date
            and time of submission.
          </li>
          <li>
            <strong>Technical information.</strong> To protect our forms from abuse we keep a one-way, salted hash of your IP
            address (we never store your actual IP address), your browser&rsquo;s user-agent string and the page that linked to
            the form.
          </li>
        </ul>
        <h3>From administrators</h3>
        <ul>
          <li>Your name, email address, role and the branches you manage.</li>
          <li>A record of administrative actions (for example creating, publishing or deleting forms) kept for security and accountability.</li>
          <li>If you connect Google Sheets, the Google account information described in section 3.</li>
        </ul>
        <h3>Cookies</h3>
        <p>
          Public forms do not use advertising or analytics cookies. Administrators&rsquo; browsers store strictly necessary,
          secure cookies that keep them signed in. If CAPTCHA protection is enabled, Cloudflare Turnstile may process limited
          device information to tell people and bots apart.
        </p>

        <h2>2. How we use information</h2>
        <ul>
          <li>To receive, review and respond to your feedback and to improve our physiotherapy and wellness services.</li>
          <li>To notify authorised staff that a new submission has arrived.</li>
          <li>To keep a copy of submissions in a Google Sheet when a clinic has connected one to a form.</li>
          <li>To produce internal statistics (for example the number of responses per branch).</li>
          <li>To secure the Service, prevent spam and abuse, and meet our legal obligations.</li>
        </ul>
        <p>We do not sell personal information and we do not use it for advertising.</p>

        <h2>3. Google user data</h2>
        <p>
          Administrators may connect a Google account so that each form&rsquo;s submissions are copied to a Google Sheet. This
          section explains exactly what we access and why. Respondents never sign in with Google and never give us access to
          their Google account.
        </p>
        <h3>What we access</h3>
        <ul>
          <li>
            <strong>Basic profile (openid, email).</strong> Your Google account email address, used only to show which account
            is connected.
          </li>
          <li>
            <strong>Google Sheets (spreadsheets).</strong> Used to create a new spreadsheet when you ask us to, to read the
            title and worksheet names of the spreadsheet you connect, to write the header row, to append a new row for each
            submission, and to read the &ldquo;Submission ID&rdquo; column of the connected sheet so that a retried sync never
            adds a duplicate row. We do not read or change any other content of your spreadsheets.
          </li>
          <li>
            <strong>Google Drive file metadata (drive.metadata.readonly), if enabled.</strong> Used only to show you a
            searchable list of your spreadsheets (names, IDs and last-modified dates) so you can pick one to connect. We do
            not open, download, change or delete any Drive files.
          </li>
        </ul>
        <h3>How we store and protect it</h3>
        <p>
          The access and refresh tokens Google issues are encrypted with AES-256-GCM and stored on our servers. They are never
          sent to web browsers and are used only by our server to perform the actions above. The spreadsheet always remains
          owned by your Google account; we never delete spreadsheets, including when a form is disconnected.
        </p>
        <h3>How we use and share it</h3>
        <p>
          Synergy Feedback&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to
          the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, we use Google user data only to provide the Google Sheets
          integration you set up; we do not use it for advertising, we do not sell it, we do not use it to train artificial
          intelligence or machine learning models, and we do not transfer it to others except as needed to provide this
          feature, to comply with the law, or with your explicit consent. Our staff do not read Google user data unless you
          ask us to help with a problem, it is necessary for security, or the law requires it.
        </p>
        <h3>Revoking access and deletion</h3>
        <ul>
          <li>Disconnect a sheet at any time in the form&rsquo;s Settings → Integrations. The spreadsheet and its data stay in your Google Drive.</li>
          <li>
            A super administrator can remove a connected Google account under Integrations → Google Sheets. This revokes our
            access with Google and deletes the stored tokens.
          </li>
          <li>
            You can also revoke access from your Google account at{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.
          </li>
        </ul>

        <h2>4. Who we share information with</h2>
        <p>We share information only with service providers that help us run the Service, under contracts that protect it:</p>
        <ul>
          <li><strong>Supabase</strong> — database, file storage and staff sign-in.</li>
          <li><strong>Vercel</strong> — hosting of the application.</li>
          <li><strong>Google</strong> — only when a clinic connects a Google Sheet to a form.</li>
          <li><strong>Resend</strong> — delivery of notification emails to staff (by default these emails do not include your answers).</li>
          <li><strong>Cloudflare</strong> — CAPTCHA protection, if enabled.</li>
        </ul>
        <p>We may also disclose information if required by law or to protect the rights, safety and security of our patients, staff and services.</p>

        <h2>5. Security</h2>
        <p>
          Data is transmitted over HTTPS. Access to submissions is limited to authorised staff and enforced by database access
          rules. Uploaded files are stored privately and shown to staff only through short-lived links. Google tokens are
          encrypted. No method of transmission or storage is completely secure, but we work to protect your information.
        </p>

        <h2>6. How long we keep information</h2>
        <p>
          We keep submissions for as long as they are needed for the purposes in section 2 or as required by law. Authorised
          staff can archive or permanently delete submissions. When a submission is deleted from Synergy Feedback, any copy
          already written to a connected Google Sheet must be removed from that sheet separately.
        </p>

        <h2>7. Your rights</h2>
        <p>
          Subject to applicable law, including India&rsquo;s Digital Personal Data Protection Act, 2023, you may ask to access,
          correct or erase your personal information, withdraw consent, or raise a grievance. Please contact us at {contact}{" "}
          and include your submission reference number if you have it. We will respond within a reasonable time.
        </p>

        <h2>8. Children</h2>
        <p>Forms for patients under 18 should be completed by, or with the consent of, a parent or guardian.</p>

        <h2>9. Changes to this policy</h2>
        <p>We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above shows when it last changed.</p>

        <h2>10. Contact us</h2>
        <p>
          {orgName}
          <br />
          {contactEmail ? "Email: " : "Contact: "}
          {contact}
          {website ? (
            <>
              <br />
              Website: <a href={website}>{website}</a>
            </>
          ) : null}
        </p>
        <p>
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalArticle>
    </SiteShell>
  );
}
