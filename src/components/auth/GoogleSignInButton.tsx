import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

type Props = {
  intent: 'login' | 'signup';
  companyName?: string;
  disabled?: boolean;
  onCredential: (idToken: string) => Promise<void> | void;
};

const SCRIPT_ID = 'google-gsi-client';

const loadGoogleScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Script tag may already be loaded (React Strict Mode / HMR). Waiting only for
      // `load` hangs forever if that event already fired.
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      const onLoad = () => {
        if (window.google?.accounts?.id) resolve();
        else reject(new Error('Google script loaded without API'));
      };
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google')), {
        once: true
      });
      // Poll briefly in case load already completed.
      let tries = 0;
      const timer = window.setInterval(() => {
        tries += 1;
        if (window.google?.accounts?.id) {
          window.clearInterval(timer);
          existing.removeEventListener('load', onLoad);
          resolve();
        } else if (tries > 40) {
          window.clearInterval(timer);
          reject(new Error('Timed out waiting for Google'));
        }
      }, 50);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error('Google script loaded without API'));
    };
    script.onerror = () => reject(new Error('Failed to load Google'));
    document.head.appendChild(script);
  });

export const GoogleSignInButton: React.FC<Props> = ({
  intent,
  companyName,
  disabled,
  onCredential
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const companyNameRef = useRef(companyName);
  const [status, setStatus] = useState<'loading' | 'ready' | 'off' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    companyNameRef.current = companyName;
  }, [companyName]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/google-status');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.enabled || !data.clientId) {
          setStatus('off');
          return;
        }

        await loadGoogleScript();
        if (cancelled) return;

        // Wait one frame so hostRef is mounted (we always render the host div now).
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled || !hostRef.current || !window.google?.accounts?.id) {
          if (!cancelled) setStatus('error');
          return;
        }

        hostRef.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: data.clientId,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) return;
            if (intent === 'signup' && !String(companyNameRef.current || '').trim()) {
              return;
            }
            setBusy(true);
            try {
              await onCredentialRef.current(response.credential);
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });

        window.google.accounts.id.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: intent === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          width: 340
        });
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [intent]);

  if (status === 'off') return null;

  return (
    <div className={`google-btn-wrap ${disabled || busy ? 'is-disabled' : ''}`}>
      {status === 'loading' && <p className="auth-divider-label">Loading Google…</p>}
      {status === 'error' && (
        <p className="auth-divider-label">
          Google sign-in unavailable. Check that `http://127.0.0.1:3000` is an Authorized JavaScript
          origin in Google Cloud.
        </p>
      )}
      {/* Always mount the host so renderButton has a target (was the stuck-loading bug). */}
      <div
        ref={hostRef}
        style={{
          display: status === 'ready' ? 'flex' : 'none',
          justifyContent: 'center',
          width: '100%'
        }}
      />
      {(disabled || busy) && status === 'ready' && <div className="google-btn-overlay" aria-hidden />}
    </div>
  );
};
