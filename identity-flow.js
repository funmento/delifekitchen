const hashParams = new URLSearchParams(window.location.hash.slice(1));
const inviteToken = hashParams.get('invite_token');
const recoveryToken = hashParams.get('recovery_token');

if (inviteToken || recoveryToken) {
  const flow = inviteToken ? 'invite' : 'recovery';
  const token = inviteToken || recoveryToken;

  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/identity-flow.css';
  document.head.append(stylesheet);

  const dialog = document.createElement('div');
  dialog.className = 'identity-flow';
  dialog.innerHTML = `
    <section class="identity-flow-card" role="dialog" aria-modal="true" aria-labelledby="identity-flow-title">
      <a class="identity-flow-brand" href="/" aria-label="Delife Kitchen home">D</a>
      <p class="identity-flow-eyebrow">Kitchen Desk</p>
      <h1 id="identity-flow-title">${flow === 'invite' ? 'Create your password' : 'Reset your password'}</h1>
      <p class="identity-flow-copy">${flow === 'invite' ? 'Set a password to finish accepting your team invitation.' : 'Choose a new password for your Delife Kitchen account.'}</p>
      <div class="identity-flow-notice" role="alert" hidden></div>
      <form class="identity-flow-form">
        <label>
          <span>New password</span>
          <input type="password" name="password" autocomplete="new-password" minlength="6" maxlength="300" required autofocus>
        </label>
        <label>
          <span>Confirm password</span>
          <input type="password" name="confirmation" autocomplete="new-password" minlength="6" maxlength="300" required>
        </label>
        <button type="submit">${flow === 'invite' ? 'Finish account setup' : 'Save new password'} <span aria-hidden="true">↗</span></button>
      </form>
    </section>`;
  document.body.append(dialog);

  const form = dialog.querySelector('.identity-flow-form');
  const notice = dialog.querySelector('.identity-flow-notice');
  const submit = form.querySelector('button');
  form.elements.password.focus();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    notice.hidden = true;

    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('confirmation') || '');

    if (password !== confirmation) {
      notice.textContent = 'The passwords do not match.';
      notice.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.firstChild.textContent = flow === 'invite' ? 'Setting up account… ' : 'Saving password… ';

    try {
      const response = await fetch('/api/identity/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, token, password }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(result.error || 'This link could not be completed.');

      window.location.replace('/admin/login');
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : 'This link could not be completed.';
      notice.hidden = false;
      submit.disabled = false;
      submit.firstChild.textContent = flow === 'invite' ? 'Finish account setup ' : 'Save new password ';
    }
  });
}
