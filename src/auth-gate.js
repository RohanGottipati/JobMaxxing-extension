import { getInstantSession } from './auth/session.js';
import { MSG, send } from './messages.js';

export async function getSession() {
  return send(MSG.GET_SESSION);
}

export async function signIn(email, password) {
  return send(MSG.SIGN_IN, { email, password });
}

export async function signOut() {
  return send(MSG.SIGN_OUT);
}

export function bindAuthForm({ onHydrate, onSignedIn }) {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginError = document.getElementById('login-error');
  const signInBtn = document.getElementById('btn-sign-in');
  const signOutBtn = document.getElementById('btn-sign-out');
  const sessionLabel = document.getElementById('session-label');

  function showLogin() {
    if (loginView) loginView.style.display = '';
    if (appView) appView.style.display = 'none';
    if (sessionLabel) {
      sessionLabel.textContent = '';
      sessionLabel.removeAttribute('title');
    }
  }

  function showApp(displayName, email) {
    if (loginView) loginView.style.display = 'none';
    if (appView) appView.style.display = '';
    if (sessionLabel) {
      sessionLabel.textContent = displayName || 'Signed in';
      if (email) sessionLabel.title = email;
      else sessionLabel.removeAttribute('title');
    }
  }

  async function refresh() {
    let instant = { signedIn: false };
    try {
      instant = await getInstantSession();
      if (instant.signedIn) {
        showApp(instant.displayName, instant.email);
        await onHydrate?.();
      } else {
        showLogin();
      }

      const session = await getSession();
      if (session?.error) throw new Error(session.error);
      if (session?.signedIn) {
        showApp(session.displayName, session.email);
        await onSignedIn?.();
        return true;
      }
      showLogin();
      return false;
    } catch (error) {
      if (instant.signedIn) return true;
      showLogin();
      if (loginError) {
        loginError.textContent =
          error instanceof Error ? error.message : 'Could not reach the extension background.';
        loginError.style.display = 'block';
      }
      return false;
    }
  }

  async function handleSignIn(event) {
    event?.preventDefault();
    if (loginError) loginError.style.display = 'none';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return;

    const previousLabel = signInBtn?.textContent;
    if (signInBtn) {
      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in…';
    }

    try {
      const res = await signIn(email, password);
      if (res?.error) throw new Error(res.error);
      await refresh();
    } catch (error) {
      if (loginError) {
        loginError.textContent = error instanceof Error ? error.message : 'Sign in failed';
        loginError.style.display = 'block';
      }
    } finally {
      if (signInBtn) {
        signInBtn.disabled = false;
        signInBtn.textContent = previousLabel || 'Sign in';
      }
    }
  }

  loginView?.addEventListener('submit', handleSignIn);
  signInBtn?.addEventListener('click', (event) => {
    if (loginView?.tagName !== 'FORM') void handleSignIn(event);
  });

  signOutBtn?.addEventListener('click', async () => {
    try {
      await signOut();
    } catch {
      // Clear local UI even if background is unavailable.
    }
    showLogin();
  });

  void refresh();
  return refresh;
}
