import React from 'react';
import { Link } from 'react-router-dom';
import '../components/auth/Auth.css';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <nav className="legal-nav">
          <Link to="/login" className="legal-brand">
            Teamflow
          </Link>
          <div className="legal-nav-links">
            <Link to="/terms">Terms</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </nav>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 10 September 2026</p>

        <p>
          This Privacy Policy describes how Teamflow (&quot;we&quot;, &quot;us&quot;) collects, uses, and
          shares information when you use our workspace software and related services (the
          &quot;Service&quot;).
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> name, email address, password hash (we do not store
            plaintext passwords), and optional profile details you add.
          </li>
          <li>
            <strong>Workspace data:</strong> projects, tasks, messages, files, and other content you
            or your teammates create in a workspace you join or own.
          </li>
          <li>
            <strong>Authentication data:</strong> if you sign in with Google, we receive basic profile
            information Google shares (such as email and name) to create or link your account.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser type, and basic usage logs needed to
            operate, secure, and debug the Service.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>Provide, maintain, and improve the Service</li>
          <li>Authenticate users and protect accounts (including email verification codes)</li>
          <li>Send service emails such as invitations and security notices</li>
          <li>Prevent abuse, spam, and unauthorized access</li>
          <li>Comply with legal obligations</li>
        </ul>

        <h2>3. How we share information</h2>
        <p>
          We do not sell your personal information. We may share data with infrastructure providers
          that help us run the Service (for example hosting, email delivery, and databases), under
          contracts that limit how they use the data. We may also share information if required by
          law, or to protect the rights and safety of users and the Service.
        </p>
        <p>
          Workspace content is visible to other members of that workspace according to roles and
          permissions set by workspace admins.
        </p>

        <h2>4. Data retention</h2>
        <p>
          We keep account and workspace data while your account or workspace remains active. You or
          a workspace admin may request deletion of workspace content or accounts subject to our
          operational and legal retention needs.
        </p>

        <h2>5. Security</h2>
        <p>
          We use industry-standard measures such as encrypted transport (HTTPS in production),
          hashed passwords, and access controls. No method of transmission or storage is completely
          secure, so we cannot guarantee absolute security.
        </p>

        <h2>6. Your choices</h2>
        <ul>
          <li>Update profile details in Settings</li>
          <li>Leave a workspace or ask an admin to remove your membership</li>
          <li>Contact us to request account deletion where applicable</li>
        </ul>

        <h2>7. Children</h2>
        <p>
          The Service is not directed to children under 16. We do not knowingly collect personal
          information from children under 16.
        </p>

        <h2>8. Changes</h2>
        <p>
          We may update this policy from time to time. We will post the updated version on this page
          and revise the &quot;Last updated&quot; date.
        </p>

        <h2>9. Contact</h2>
        <p>
          For privacy questions, contact the workspace owner who invited you, or the Teamflow
          operator at the support email published on the Service.
        </p>

        <p className="legal-note">
          
        </p>
      </div>
    </div>
  );
};
