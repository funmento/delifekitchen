import { catalog, customizationSignature, resolveCustomizations } from './catalog.mjs';
import { addCartItem, readCart, writeCart } from './cart.mjs';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const pathSlug = window.location.pathname.split('/').pop().replace('.html', '');
const productId = pathSlug === 'product' ? new URLSearchParams(window.location.search).get('slug') : pathSlug;
let product = catalog[productId];
const details = document.querySelector('.product-details');
const addButton = document.querySelector('.quick-checkout');
const priceLabel = document.querySelector('.product-price');

try {
  const response = await fetch(`/api/products?slug=${encodeURIComponent(productId)}`);
  if (response.ok) {
    const data = await response.json();
    product = data.product;
    catalog[productId] = product;
    document.title = `${product.name} | DeLife Kitchen`;
    document.querySelector('.product-details h1').textContent = product.name;
    document.querySelector('.product-description').textContent = product.fullDescription || product.shortDescription;
    document.querySelector('.product-category').textContent = product.category?.name || 'Delife Kitchen menu';
    document.querySelector('.product-breadcrumb span:last-child').textContent = product.name;
    const image = document.querySelector('.product-visual img');
    image.src = product.imageUrl;
    image.alt = `${product.name} prepared by DeLife Kitchen`;
  } else if (response.status === 404 || response.status === 410) {
    product = null;
  }
} catch {
  // Static product data remains available as a safe first-phase fallback.
}

if (!product && details) {
  details.innerHTML = '<p class="product-category">Menu update</p><h1>Currently unavailable</h1><p class="product-description">This dish is not available to order right now. Please return to the menu to choose another favourite.</p><a class="quick-checkout" href="../menu.html">Back to menu <span aria-hidden="true">↗</span></a>';
}

if (product?.soldOut && details && addButton) {
  addButton.removeAttribute('href');
  addButton.classList.add('is-disabled');
  addButton.setAttribute('aria-disabled', 'true');
  addButton.innerHTML = '<span class="add-label">Sold out</span>';
  priceLabel.textContent = currency.format(product.unitAmount / 100);
}

if (product && !product.soldOut && details && addButton) {
  const form = document.createElement('form');
  form.className = 'product-customizer';
  form.noValidate = true;
  form.innerHTML = '<div class="customizer-heading"><p>Make it yours</p><span>Required selections are marked</span></div>';

  const savedDraft = (() => {
    try {
      return JSON.parse(localStorage.getItem(`delifeOptions:${productId}`) || '{}');
    } catch {
      return {};
    }
  })();

  product.optionGroups.forEach(group => {
    const fieldset = document.createElement('fieldset');
    const instruction = group.selectionType === 'single'
      ? 'Choose 1'
      : group.maxSelections === group.options.length ? 'Choose any' : `Choose up to ${group.maxSelections}`;
    fieldset.dataset.groupId = group.id;
    fieldset.innerHTML = `
      <legend><span>${group.name}</span><small>${instruction}${group.required ? ' · Required' : ' · Optional'}</small></legend>
      <div class="option-list"></div>
      <p class="option-error" aria-live="polite"></p>`;

    const optionList = fieldset.querySelector('.option-list');
    group.options.forEach(option => {
      const input = document.createElement('input');
      input.type = group.selectionType === 'single' ? 'radio' : 'checkbox';
      input.name = group.id;
      input.value = option.id;
      input.id = `${productId}-${group.id}-${option.id}`;
      input.checked = Array.isArray(savedDraft[group.id]) && savedDraft[group.id].includes(option.id);

      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.append(input);
      label.insertAdjacentHTML('beforeend', `<span class="option-control" aria-hidden="true"></span><b>${option.name}</b><em>${option.priceAdjustment ? `+${currency.format(option.priceAdjustment / 100)}` : 'Included'}</em>`);
      optionList.append(label);
    });
    form.append(fieldset);
  });

  if (product.optionGroups.length) details.insertBefore(form, addButton);
  addButton.removeAttribute('href');
  addButton.setAttribute('role', 'button');
  addButton.setAttribute('tabindex', '0');
  addButton.innerHTML = '<span class="add-label">Add to cart</span><strong class="add-total"></strong>';

  const getRawSelections = () => product.optionGroups.map(group => ({
    groupId: group.id,
    selectionIds: [...form.querySelectorAll(`[name="${group.id}"]:checked`)].map(input => input.value),
  }));

  const validateGroup = (group, showError = false) => {
    const fieldset = form.querySelector(`[data-group-id="${group.id}"]`);
    const selected = fieldset.querySelectorAll('input:checked').length;
    const valid = selected >= group.minSelections && selected <= group.maxSelections;
    fieldset.classList.toggle('has-error', showError && !valid);
    fieldset.querySelector('.option-error').textContent = showError && !valid
      ? selected < group.minSelections ? `Choose at least ${group.minSelections}.` : `Choose no more than ${group.maxSelections}.`
      : '';
    return valid;
  };

  const update = ({ showErrors = false } = {}) => {
    product.optionGroups.forEach(group => {
      const checked = [...form.querySelectorAll(`[name="${group.id}"]:checked`)];
      if (group.selectionType === 'multi' && checked.length > group.maxSelections) {
        checked.at(-1).checked = false;
      }
    });

    const rawSelections = getRawSelections();
    const result = resolveCustomizations(productId, rawSelections);
    const draft = Object.fromEntries(rawSelections.map(group => [group.groupId, group.selectionIds]));
    localStorage.setItem(`delifeOptions:${productId}`, JSON.stringify(draft));

    product.optionGroups.forEach(group => validateGroup(group, showErrors));
    const selectedExtras = rawSelections.reduce((total, group) => {
      const config = product.optionGroups.find(item => item.id === group.groupId);
      return total + group.selectionIds.reduce((sum, id) => sum + (config.options.find(option => option.id === id)?.priceAdjustment || 0), 0);
    }, 0);
    const total = product.unitAmount + selectedExtras;
    priceLabel.textContent = currency.format(total / 100);
    addButton.querySelector('.add-total').textContent = currency.format(total / 100);
    addButton.classList.toggle('is-disabled', !result.valid);
    addButton.setAttribute('aria-disabled', String(!result.valid));
    return result;
  };

  form.addEventListener('change', () => update());
  addButton.addEventListener('click', event => {
    event.preventDefault();
    const result = update({ showErrors: true });
    if (!result.valid) {
      form.querySelector('.has-error input')?.focus();
      return;
    }

    const signature = customizationSignature(productId, result.selections);
    const item = {
      id: productId,
      signature,
      quantity: 1,
      customizations: getRawSelections(),
      unitAmount: result.unitAmount,
    };
    const cart = addCartItem(readCart(localStorage), item);
    writeCart(cart, localStorage);
    sessionStorage.removeItem('delifeOrder');
    window.location.assign('../checkout.html');
  });
  addButton.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      addButton.click();
    }
  });

  update();
}
