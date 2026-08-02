import('/identity-flow.js');

const referenceBox = document.querySelector('#order-reference');
const referenceValue = document.querySelector('#order-reference-value');
const sessionId = new URLSearchParams(window.location.search).get('session_id');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const loadOrderReference = async () => {
  if (!sessionId) throw new Error('Check your confirmation email for your reference.');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`/api/order-status?session_id=${encodeURIComponent(sessionId)}`);
    if (response.ok) {
      const order = await response.json();
      referenceValue.textContent = order.reference;
      return;
    }
    if (response.status !== 404) break;
    await wait(700);
  }

  throw new Error('Check your confirmation email for your reference.');
};

loadOrderReference().catch(error => {
  referenceBox.classList.add('error');
  referenceValue.textContent = error.message;
});

localStorage.removeItem('delifeOrder');
sessionStorage.removeItem('delifeOrder');
