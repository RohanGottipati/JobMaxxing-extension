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

export function bindAuthForm({ onSignedIn }) {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginError = document.getElementById('login-error');
  const signInBtn = document.getElementById('btn-sign-in');
  const signOutBtn = document.getElementById('btn-sign-out');
  const sessionLabel = document.getElementById('session-label');

  function showLogin(message = '') {
    if (loginView) loginView.style.display = '';
    if (appView) appView.style.display = 'none';
    if (sessionLabel) sessionLabel.textContent = message || 'Sign in required';
  }

  function showApp(email) {
    if (loginView) loginView.style.display = 'none';
    if (appView) appView.style.display = '';
    if (sessionLabel) sessionLabel.textContent = email ?? 'Signed in';
  }

  async function refresh() {
    try {
      const session = await getSession();
      if (session?.error) throw new Error(session.error);
      if (session?.signedIn) {
        showApp(session.email);
        await onSignedIn?.();
        return true;
      }
      showLogin();
      return false;
    } catch (error) {
      showLogin('Extension unavailable');
      if (loginError) {
        loginError.textContent =
          error instanceof Error ? error.message : 'Could not reach the extension background.';
        loginError.style.display = 'block';
      }
      return false;
    }
  }

  signInBtn?.addEventListener('click', async () => {
    if (loginError) loginError.style.display = 'none';
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const res = await signIn(email, password);
      if (res?.error) throw new Error(res.error);
      await refresh();
    } catch (error) {
      if (loginError) {
        loginError.textContent = error instanceof Error ? error.message : 'Sign in failed';
        loginError.style.display = 'block';
      }
    }
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
