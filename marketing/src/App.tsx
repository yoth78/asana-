import { FormEvent, useEffect, useState } from 'react';

const appUrl = () =>
  (import.meta.env.VITE_APP_URL || 'https://app.cashmereet.com').replace(/\/$/, '');

const apiBase = () =>
  (import.meta.env.VITE_API_BASE || import.meta.env.VITE_APP_URL || '').replace(/\/$/, '');

export default function App() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const signupHref = `${appUrl()}/#/signup`;
  const loginHref = `${appUrl()}/#/login`;

  const onNewsletter = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch(`${apiBase()}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'marketing-site' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not subscribe');
      setStatus('ok');
      setMessage('You are on the list. We will be in touch.');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="page">
      <header className={`topnav ${scrolled ? 'topnav--solid' : ''}`}>
        <a className="brand" href="#top" aria-label="TeamFlow home">
          TeamFlow
        </a>
        <nav className="topnav__links" aria-label="Primary">
          <a href="#product">Product</a>
          <a href="#updates">Updates</a>
          <a href={loginHref}>Sign in</a>
          <a className="btn btn--nav" href={signupHref}>
            Start free
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-label="Hero">
          <div className="hero__media" aria-hidden="true">
            <img
              className="hero__img"
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2400&q=80"
              alt=""
            />
            <div className="hero__veil" />
          </div>

          <div className="hero__content">
            <p className="hero__brand reveal reveal--1">TeamFlow</p>
            <h1 className="hero__title reveal reveal--2">Work that stays clear when the team grows.</h1>
            <p className="hero__lede reveal reveal--3">
              Projects, tasks, and departments in one workspace — built for companies that need
              accountability without ceremony.
            </p>
            <div className="hero__cta reveal reveal--4">
              <a className="btn btn--primary" href={signupHref}>
                Create your workspace
              </a>
              <a className="btn btn--ghost" href={loginHref}>
                Sign in
              </a>
            </div>
          </div>
        </section>

        <section id="product" className="section section--split">
          <div className="section__inner">
            <div className="section__copy">
              <h2>One place for the work, not another pile of tabs.</h2>
              <p>
                TeamFlow keeps projects, owners, and deadlines in a shared company workspace. Invite
                people by email, switch between companies you belong to, and keep chat where your
                plan allows it.
              </p>
            </div>
            <figure className="section__visual">
              <img
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80"
                alt="Team collaborating around a table with laptops"
              />
            </figure>
          </div>
        </section>

        <section className="section section--list">
          <div className="section__inner section__inner--narrow">
            <h2>What you get</h2>
            <ul className="feature-list">
              <li>
                <strong>Company workspaces</strong>
                <span>Multi-tenant by design — each company keeps its own members and data.</span>
              </li>
              <li>
                <strong>Projects &amp; tasks</strong>
                <span>List, board, calendar, and timeline views for the same work.</span>
              </li>
              <li>
                <strong>Departments &amp; roles</strong>
                <span>Super admins, department admins, and members with clear permissions.</span>
              </li>
              <li>
                <strong>Invites that prove the inbox</strong>
                <span>New people set a password; existing users confirm with a code — no hijacks.</span>
              </li>
            </ul>
            <a className="text-link" href={signupHref}>
              Open the app →
            </a>
          </div>
        </section>

        <section id="updates" className="section section--newsletter">
          <div className="section__inner section__inner--narrow">
            <h2>Product updates</h2>
            <p>Occasional notes on what we ship. No spam, no drip campaigns.</p>
            <form className="newsletter" onSubmit={onNewsletter}>
              <label className="sr-only" htmlFor="newsletter-email">
                Email
              </label>
              <input
                id="newsletter-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={status === 'loading'}
              />
              <button className="btn btn--primary" type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Sending…' : 'Subscribe'}
              </button>
            </form>
            {message && (
              <p className={`form-note ${status === 'error' ? 'form-note--error' : 'form-note--ok'}`}>
                {message}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__brand">TeamFlow</p>
          <div className="footer__links">
            <a href={signupHref}>Sign up</a>
            <a href={loginHref}>Sign in</a>
            <a href={`${appUrl()}/#/privacy`}>Privacy</a>
            <a href={`${appUrl()}/#/terms`}>Terms</a>
          </div>
          <p className="footer__copy">© {new Date().getFullYear()} TeamFlow</p>
        </div>
      </footer>
    </div>
  );
}
