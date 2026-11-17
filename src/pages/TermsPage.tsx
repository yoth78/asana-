import React from 'react';
import { Link } from 'react-router-dom';
import '../components/auth/Auth.css';

export const TermsPage: React.FC = () => {
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <nav className="legal-nav">
          <Link to="/login" className="legal-brand">
            Teamflow
          </Link>
          <div className="legal-nav-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </nav>

        <h1>Terms and Conditions</h1>
        <p className="legal-updated">Last updated: 10 September 2026</p>

        <p>
          These Terms and Conditions (&quot;Terms&quot;) govern access to and use of Teamflow (the
          &quot;Service&quot;). By creating an account, joining a workspace, or using the Service,
          you agree to these Terms.
        </p>

        <h2>1. The Service</h2>
        <p>
          Teamflow provides workspace software for teams to manage projects, tasks, chat, and related
          collaboration features. Features may change as we improve the product.
        </p>

        <h2>2. Accounts and workspaces</h2>
        <ul>
          <li>You must provide accurate account information and keep credentials secure.</li>
          <li>
            When you create a workspace you become responsible for that workspace&apos;s members,
            content, and configuration (including invites and roles).
          </li>
          <li>
            You must be authorized to use any email or Google account you connect to the Service.
          </li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Break the law or infringe others&apos; rights</li>
          <li>Upload malware or attempt to disrupt or probe the Service</li>
          <li>Abuse signup, invitations, or email verification to spam or overload systems</li>
          <li>Access another workspace or account without permission</li>
          <li>Resell the Service except under a written agreement with us</li>
        </ul>

        <h2>4. Your content</h2>
        <p>
          You retain ownership of content you submit. You grant us a limited license to host, store,
          process, and display that content solely to operate the Service for you and your
          workspace. Workspace admins control membership and may access content according to
          workspace permissions.
        </p>

        <h2>5. Third-party services</h2>
        <p>
          The Service may integrate with third parties such as Google sign-in or email providers.
          Their terms and privacy policies apply to those services.
        </p>

        <h2>6. Availability and changes</h2>
        <p>
          We aim for reliable uptime but do not guarantee uninterrupted access. We may modify or
          discontinue features with reasonable notice when practical.
        </p>

        <h2>7. Disclaimers</h2>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
          any kind, express or implied, to the fullest extent permitted by law. We do not warrant
          that the Service will be error-free or meet every business requirement.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Teamflow and its operators will not be liable for
          indirect, incidental, special, consequential, or punitive damages, or any loss of profits,
          data, or goodwill, arising from your use of the Service.
        </p>

        <h2>9. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          violate these Terms or if needed to protect the Service or other users.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These Terms are governed by the laws applicable in the operator&apos;s principal place of
          business, unless mandatory local consumer law says otherwise.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these Terms can be sent to the support contact published on the Service.
        </p>

        <p className="legal-note">
          
        </p>
      </div>
    </div>
  );
};
