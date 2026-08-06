const state = { products: [], categories: [], selected: null };
const $ = selector => document.querySelector(selector);
const fallbackImage = '/assets/brand/delife-kitchen-icon.png';
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
const escape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};
const notice = (message, error = false) => {
  const node = $('#notice');
  node.textContent = message;
  node.className = `notice ${error ? 'notice-error' : 'notice-success'}`;
  node.hidden = false;
  setTimeout(() => node.hidden = true, 5000);
};
const categories = () => state.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder);
const setImagePreview = (url, label = 'Current image') => {
  const preview = $('#image-preview');
  preview.src = url || fallbackImage;
  preview.onerror = () => { preview.onerror = null; preview.src = fallbackImage; };
  $('#image-preview-label').textContent = label;
};
const refreshSelects = () => {
  const options = categories().map(category => `<option value="${category.id}">${escape(category.name)}${category.active ? '' : ' (hidden)'}</option>`).join('');
  $('#category-filter').innerHTML = '<option value="">All categories</option>' + options;
  $('#product-form [name=categoryId]').innerHTML = '<option value="">Uncategorised</option>' + options;
};
const renderProducts = () => {
  const query = $('#search').value.toLowerCase();
  const filtered = state.products.filter(product => (!query || `${product.name} ${product.slug}`.toLowerCase().includes(query)) && (!$('#category-filter').value || String(product.categoryId) === $('#category-filter').value) && (!$('#active-filter').value || String(product.active) === $('#active-filter').value) && (!$('#stock-filter').value || String(product.soldOut) === $('#stock-filter').value));
  $('#product-list').innerHTML = filtered.length ? filtered.map(product => `<article class="product-row"><img src="${escape(product.imageUrl || fallbackImage)}" alt=""><div><h3>${escape(product.name)}</h3><div class="product-meta"><span>${escape(product.category?.name || 'Uncategorised')}</span><strong>${money(product.price)}</strong><span>Order ${product.sortOrder}</span></div><div class="status-line"><span class="status ${product.active ? '' : 'off'}">${product.active ? 'Active' : 'Hidden'}</span>${product.soldOut ? '<span class="status sold">Sold out</span>' : '<span class="status">In stock</span>'}</div></div><button class="button button-secondary" data-edit-product="${product.id}" type="button">Edit</button></article>`).join('') : '<div class="empty-state">No products match these filters.</div>';
};
const renderCategories = () => {
  $('#category-list').innerHTML = categories().map(category => `<div class="category-row"><div><strong>${escape(category.name)}</strong><div class="product-meta">${escape(category.slug)} · order ${category.sortOrder} · ${category.active ? 'visible' : 'hidden'}</div></div><button class="mini-button" data-edit-category="${category.id}">Edit</button></div>`).join('');
};
const renderOptions = product => {
  $('#option-editor').hidden = !product;
  $('#option-groups').innerHTML = product ? product.optionGroups.map(group => `<div class="option-group"><div class="option-head"><div><strong>${escape(group.name)}</strong><div class="product-meta">${group.required ? 'Required' : 'Optional'} · ${group.minSelections}–${group.maxSelections} selections · order ${group.sortOrder}</div></div><div class="mini-actions"><button class="mini-button" data-add-option="${group.databaseId}">Add option</button><button class="mini-button" data-edit-group="${group.databaseId}">Edit</button></div></div>${group.options.map(option => `<div class="option-row"><span>${escape(option.name)} · ${option.priceAdjustment ? `+${money(option.priceAdjustment)}` : 'included'} · ${option.active ? 'active' : 'disabled'} · order ${option.sortOrder}</span><button class="mini-button" data-edit-option="${option.databaseId}" data-group="${group.databaseId}">Edit</button></div>`).join('')}</div>`).join('') : ' ';
};
const editProduct = product => {
  state.selected = product || null;
  const form = $('#product-form');
  form.reset();
  form.elements.id.value = product?.id || '';
  for (const key of ['name', 'slug', 'shortDescription', 'fullDescription', 'imageUrl', 'sortOrder']) form.elements[key].value = product?.[key] ?? '';
  form.price.value = product ? product.price / 100 : '';
  form.categoryId.value = product?.categoryId || '';
  form.active.checked = product?.active ?? true;
  form.soldOut.checked = product?.soldOut ?? false;
  form.featured.checked = product?.featured ?? false;
  $('#editor-title').textContent = product ? 'Edit product' : 'Add a product';
  setImagePreview(product?.imageUrl, product?.imageUrl ? 'Current product image' : 'No image selected');
  renderOptions(product);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const uploadImage = file => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  const progress = $('#upload-progress');
  const progressBar = $('#upload-progress-bar');
  const progressText = $('#upload-progress-text');
  const form = new FormData();
  form.append('image', file);
  form.append('slug', $('#product-form').elements.slug.value || $('#product-form').elements.name.value || 'product');
  progress.hidden = false;
  progressBar.value = 0;
  progressText.textContent = 'Uploading…';
  request.open('POST', '/api/admin/product-images');
  request.upload.addEventListener('progress', event => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    progressBar.value = percent;
    progressText.textContent = `${percent}%`;
  });
  request.addEventListener('load', () => {
    let data = {};
    try { data = JSON.parse(request.responseText || '{}'); } catch {}
    if (request.status < 200 || request.status >= 300) reject(new Error(data.error || 'The image could not be uploaded.'));
    else resolve(data);
  });
  request.addEventListener('error', () => reject(new Error('The image upload was interrupted.')));
  request.addEventListener('loadend', () => { progress.hidden = true; $('#upload-image').disabled = false; });
  request.send(form);
});
const simplePrompt = async (resource, current = {}, extra = {}) => {
  const name = prompt(`${resource} name`, current.name || '');
  if (name === null || !name.trim()) return;
  const body = { resource, name, ...extra };
  if (resource === 'category') {
    body.slug = prompt('Slug', current.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    body.description = prompt('Description', current.description || '');
    body.sortOrder = Number(prompt('Display order', current.sortOrder ?? 0));
    body.active = confirm('Keep this category active?');
  } else if (resource === 'group') {
    body.required = confirm('Is this group required?');
    body.minSelections = Number(prompt('Minimum selections', current.minSelections ?? 0));
    body.maxSelections = Number(prompt('Maximum selections', current.maxSelections ?? 1));
    body.sortOrder = Number(prompt('Display order', current.sortOrder ?? 0));
    body.key = current.key;
  } else {
    body.priceAdjustment = Math.round(Number(prompt('Price adjustment in pounds', ((current.priceAdjustment || 0) / 100).toFixed(2))) * 100);
    body.sortOrder = Number(prompt('Display order', current.sortOrder ?? 0));
    body.active = confirm('Keep this option active?');
    body.key = current.key;
  }
  if (current.databaseId || current.id) body.id = current.databaseId || current.id;
  await api('/api/admin/products', { method: body.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
  await load();
  notice(`${name} saved.`);
};
const load = async () => {
  const data = await api('/api/admin/products');
  state.products = data.products;
  state.categories = data.categories || [];
  refreshSelects();
  renderProducts();
  renderCategories();
  if (state.selected) {
    state.selected = state.products.find(product => product.id === state.selected.id) || null;
    renderOptions(state.selected);
  }
};

$('#product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form);
  body.resource = 'product';
  body.price = Math.round(Number(body.price) * 100);
  body.categoryId = body.categoryId ? Number(body.categoryId) : null;
  body.sortOrder = Number(body.sortOrder);
  body.active = event.currentTarget.active.checked;
  body.soldOut = event.currentTarget.soldOut.checked;
  body.featured = event.currentTarget.featured.checked;
  try {
    await api('/api/admin/products', { method: body.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    await load();
    editProduct(state.products.find(product => product.slug === body.slug));
    notice('Product saved.');
  } catch (error) {
    notice(error.message, true);
  }
});
$('#upload-image').addEventListener('click', () => $('#image-file').click());
$('#image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!allowedImageTypes.has(file.type)) return notice('Choose a JPG, PNG or WebP image.', true);
  if (file.size > 5 * 1024 * 1024) return notice('Images must be 5MB or smaller.', true);
  const previousUrl = $('#product-form').elements.imageUrl.value;
  const localPreview = URL.createObjectURL(file);
  setImagePreview(localPreview, 'Selected image preview');
  $('#upload-image').disabled = true;
  try {
    const uploaded = await uploadImage(file);
    $('#product-form').elements.imageUrl.value = uploaded.imageUrl;
    setImagePreview(uploaded.imageUrl, 'Uploaded image — save product to apply');
    notice('Image uploaded. Save the product to apply it.');
  } catch (error) {
    $('#product-form').elements.imageUrl.value = previousUrl;
    setImagePreview(previousUrl, previousUrl ? 'Current product image' : 'No image selected');
    notice(error.message, true);
  } finally {
    URL.revokeObjectURL(localPreview);
    event.target.value = '';
  }
});
$('#product-form').elements.imageUrl.addEventListener('input', event => setImagePreview(event.target.value, event.target.value ? 'Image URL preview' : 'No image selected'));
document.addEventListener('click', async event => {
  try {
    const productId = event.target.dataset.editProduct;
    if (productId) editProduct(state.products.find(product => product.id === Number(productId)));
    if (event.target.id === 'new-product' || event.target.id === 'cancel-edit') editProduct(null);
    if (event.target.id === 'add-category') await simplePrompt('category');
    if (event.target.dataset.editCategory) await simplePrompt('category', categories().find(item => item.id === Number(event.target.dataset.editCategory)));
    if (event.target.id === 'add-group' && state.selected) await simplePrompt('group', {}, { productId: state.selected.id });
    if (event.target.dataset.editGroup) await simplePrompt('group', state.selected.optionGroups.find(item => item.databaseId === Number(event.target.dataset.editGroup)), { productId: state.selected.id });
    if (event.target.dataset.addOption) await simplePrompt('option', {}, { groupId: Number(event.target.dataset.addOption) });
    if (event.target.dataset.editOption) {
      const group = state.selected.optionGroups.find(item => item.databaseId === Number(event.target.dataset.group));
      await simplePrompt('option', group.options.find(item => item.databaseId === Number(event.target.dataset.editOption)), { groupId: group.databaseId });
    }
  } catch (error) {
    notice(error.message, true);
  }
});
['search', 'category-filter', 'active-filter', 'stock-filter'].forEach(id => $(`#${id}`).addEventListener('input', renderProducts));
(async () => {
  try {
    const session = await api('/api/admin/session');
    $('#admin-name').textContent = session.admin.name || 'Admin';
    $('#admin-email').textContent = session.admin.email;
    $('#admin-initial').textContent = (session.admin.name || session.admin.email || 'A')[0].toUpperCase();
    $('#product-app').hidden = false;
    await load();
  } catch {
    $('#access-denied').hidden = false;
  }
})();
