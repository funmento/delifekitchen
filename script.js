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
const productCheckout = document.querySelector('.quick-checkout');

if (productCheckout) {
  const productId = window.location.pathname.split('/').pop().replace('.html', '');
  productCheckout.href = `../checkout.html?item=${encodeURIComponent(productId)}`;
}

if (menuCards.length && quickOrder) {
  const order = new Map();
  let storedOrder = [];
  try {
    storedOrder = JSON.parse(sessionStorage.getItem('delifeOrder') || '[]');
    if (!Array.isArray(storedOrder)) storedOrder = [];
  } catch {
    sessionStorage.removeItem('delifeOrder');
  }
  const countLabel = quickOrder.querySelector('.quick-order-count');
  const totalLabel = quickOrder.querySelector('.quick-order-total');
  const clearButton = quickOrder.querySelector('.quick-order-clear');
  const checkoutLink = quickOrder.querySelector('.quick-order-checkout');
  const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  const updateOrder = () => {
    const items = [...order.values()];
    const itemCount = items.reduce((total, item) => total + item.quantity, 0);
    const orderTotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);

    quickOrder.hidden = itemCount === 0;
    countLabel.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
    totalLabel.textContent = currency.format(orderTotal);

    sessionStorage.setItem('delifeOrder', JSON.stringify(items));
  };

  menuCards.forEach((card, index) => {
    const name = card.querySelector('h2').textContent.trim();
    const price = Number(card.querySelector('.price').textContent.replace(/[^0-9.]/g, ''));
    const productLink = card.querySelector('.menu-card-link').getAttribute('href');
    const itemId = productLink.split('/').pop().replace('.html', '') || `menu-item-${index}`;
    const button = document.createElement('button');

    button.className = 'quick-add';
    button.type = 'button';
    button.innerHTML = '<span>Add to order</span><b aria-hidden="true">+</b>';
    button.setAttribute('aria-label', `Add ${name} to order`);

    const storedItem = storedOrder.find(item => item.id === itemId);
    if (storedItem) {
      order.set(itemId, { id: itemId, name, price, quantity: storedItem.quantity });
      button.classList.add('added');
      button.querySelector('span').textContent = `Add another · ${storedItem.quantity}`;
    }

    button.addEventListener('click', () => {
      const item = order.get(itemId) || { id: itemId, name, price, quantity: 0 };
      item.quantity += 1;
      order.set(itemId, item);
      button.classList.add('added');
      button.querySelector('span').textContent = `Add another · ${item.quantity}`;
      updateOrder();
    });

    card.querySelector(':scope > div').append(button);
  });

  clearButton.addEventListener('click', () => {
    order.clear();
    menuCards.forEach(card => {
      const button = card.querySelector('.quick-add');
      button.classList.remove('added');
      button.querySelector('span').textContent = 'Add to order';
    });
    updateOrder();
  });

  updateOrder();
}
