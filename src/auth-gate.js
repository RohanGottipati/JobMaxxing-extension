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

  async function refresh() {
    const session = await getSession();
    if (session?.signedIn) {
      loginView.style.display = 'none';
      appView.style.display = '';
      if (sessionLabel) sessionLabel.textContent = session.email ?? 'Signed in';
      onSignedIn?.();
      return true;
    }
    loginView.style.display = '';
    appView.style.display = 'none';
    if (sessionLabel) sessionLabel.textContent = 'Sign in required';
    return false;
  }

  signInBtn?.addEventListener('click', async () => {
    loginError.style.display = 'none';
    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const res = await signIn(email, password);
      if (res?.error) throw new Error(res.error);
      await refresh();
    } catch (error) {
      loginError.textContent = error.message ?? 'Sign in failed';
      loginError.style.display = 'block';
    }
  });

  signOutBtn?.addEventListener('click', async () => {
    await signOut();
    await refresh();
  });

  return refresh;
}
