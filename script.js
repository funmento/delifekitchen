const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  document.querySelectorAll('nav a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

const menuCards = document.querySelectorAll('.menu-card');
const quickOrder = document.querySelector('.quick-order');
if (menuCards.length && quickOrder) {
  let storedOrder = [];
  try {
    storedOrder = JSON.parse(localStorage.getItem('delifeOrder') || '[]');
    if (!Array.isArray(storedOrder)) storedOrder = [];
  } catch {
    localStorage.removeItem('delifeOrder');
  }
  const countLabel = quickOrder.querySelector('.quick-order-count');
  const totalLabel = quickOrder.querySelector('.quick-order-total');
  const clearButton = quickOrder.querySelector('.quick-order-clear');
  const checkoutLink = quickOrder.querySelector('.quick-order-checkout');
  const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  const updateOrder = () => {
    const itemCount = storedOrder.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    const orderTotal = storedOrder.reduce((total, item) => total + ((Number(item.unitAmount) || 0) * (Number(item.quantity) || 0)), 0);

    quickOrder.hidden = itemCount === 0;
    countLabel.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
    totalLabel.textContent = currency.format(orderTotal / 100);
  };

  menuCards.forEach((card, index) => {
    const name = card.querySelector('h2').textContent.trim();
    const productLink = card.querySelector('.menu-card-link').getAttribute('href');
    const itemId = productLink.split('/').pop().replace('.html', '') || `menu-item-${index}`;
    const button = document.createElement('button');

    button.className = 'quick-add';
    button.type = 'button';
    button.innerHTML = '<span>Customize</span><b aria-hidden="true">→</b>';
    button.setAttribute('aria-label', `Customize ${name}`);

    const storedQuantity = storedOrder.filter(item => item.id === itemId).reduce((total, item) => total + item.quantity, 0);
    if (storedQuantity) {
      button.classList.add('added');
      button.querySelector('span').textContent = `Customize another · ${storedQuantity}`;
    }

    button.addEventListener('click', () => {
      window.location.assign(productLink);
    });

    card.querySelector(':scope > div').append(button);
  });

  clearButton.addEventListener('click', () => {
    storedOrder = [];
    localStorage.removeItem('delifeOrder');
    menuCards.forEach(card => {
      const button = card.querySelector('.quick-add');
      button.classList.remove('added');
      button.querySelector('span').textContent = 'Customize';
    });
    updateOrder();
  });

  updateOrder();
}
