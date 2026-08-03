import '../identity-flow.js';

const state = {
  admin: null,
  report: null,
  orders: [],
  pagination: { page: 1, pages: 1, total: 0 },
  filters: new URLSearchParams(),
  lastPaidPollAt: null,
  seenPaidOrderIds: new Set(),
  newPaidOrderCount: 0,
  soundEnabled: false,
  deliverySettings: null,
};

const elements = {
  loginShell: document.querySelector('#login-shell'),
  appShell: document.querySelector('#app-shell'),
  loginError: document.querySelector('#login-error'),
  adminName: document.querySelector('#admin-name'),
  adminEmail: document.querySelector('#admin-email'),
  adminInitial: document.querySelector('#admin-initial'),
  dayPart: document.querySelector('#day-part'),
  todayLabel: document.querySelector('#today-label'),
  metricRevenue: document.querySelector('#metric-revenue'),
  metricOrders: document.querySelector('#metric-orders'),
  metricAverage: document.querySelector('#metric-average'),
  metricActive: document.querySelector('#metric-active'),
  metricRange: document.querySelector('#metric-range'),
  statusSummary: document.querySelector('#status-summary'),
  recentOrders: document.querySelector('#recent-orders'),
  salesChart: document.querySelector('#sales-chart'),
  chartEmpty: document.querySelector('#chart-empty'),
  reportFrom: document.querySelector('#report-from'),
  reportTo: document.querySelector('#report-to'),
  ordersList: document.querySelector('#orders-list'),
  orderTotal: document.querySelector('#order-total'),
  navOrderCount: document.querySelector('#nav-order-count'),
  pageLabel: document.querySelector('#page-label'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
  ordersNotice: document.querySelector('#orders-notice'),
  overviewNotice: document.querySelector('#overview-notice'),
  toast: document.querySelector('#toast'),
  sidebar: document.querySelector('.sidebar'),
  mobileMenu: document.querySelector('#mobile-menu'),
  newOrderAlert: document.querySelector('#new-order-alert'),
  newOrderAlertCount: document.querySelector('#new-order-alert-count'),
  viewNewOrders: document.querySelector('#view-new-orders'),
  toggleOrderSound: document.querySelector('#toggle-order-sound'),
  dismissOrderAlert: document.querySelector('#dismiss-order-alert'),
  deliverySettingsForm: document.querySelector('#delivery-settings-form'),
  settingsNotice: document.querySelector('#settings-notice'),
  activeDeliveryRule: document.querySelector('#active-delivery-rule'),
  settingsUpdatedAt: document.querySelector('#settings-updated-at'),
  radiusSettings: document.querySelector('#radius-settings'),
  prefixSettings: document.querySelector('#prefix-settings'),
  saveDeliverySettings: document.querySelector('#save-delivery-settings'),
};

const money = (amount, currency = 'gbp') => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: currency.toUpperCase(),
}).format((amount || 0) / 100);

const longDate = value => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const dateInputValue = date => date.toISOString().slice(0, 10);
const titleCase = value => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';

const showNotice = (element, message, error = false) => {
  element.textContent = message;
  element.classList.toggle('notice-error', error);
  element.hidden = false;
};

const clearNotice = element => { element.hidden = true; };

let toastTimer;
const showToast = message => {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3500);
};

const playOrderSound = () => {
  if (!state.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.36);
  oscillator.addEventListener('ended', () => context.close());
};

const renderNewOrderAlert = () => {
  elements.newOrderAlert.hidden = state.newPaidOrderCount < 1;
  elements.newOrderAlertCount.textContent = state.newPaidOrderCount === 1
    ? '1 new paid order'
    : `${state.newPaidOrderCount} new paid orders`;
};

const api = async (path, options) => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  if (response.status === 401) {
    elements.appShell.hidden = true;
    elements.loginShell.hidden = false;
    throw new Error('Your admin session has expired. Sign in again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const setupDates = () => {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  elements.reportFrom.value = dateInputValue(from);
  elements.reportTo.value = dateInputValue(today);
  elements.todayLabel.textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(today);
  const hour = today.getHours();
  elements.dayPart.textContent = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
};

const showLoginError = () => {
  const error = new URLSearchParams(window.location.search).get('error');
  const messages = {
    credentials: 'Sign-in failed. Check your email and password.',
    access: 'This account does not have admin access.',
    unavailable: 'Sign-in is temporarily unavailable. Please try again.',
    method: 'Please use the sign-in form below.',
  };
  if (messages[error]) showNotice(elements.loginError, messages[error], true);
};

const switchView = (view, updateHistory = false) => {
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
  elements.sidebar.classList.remove('is-open');
  elements.mobileMenu.setAttribute('aria-expanded', 'false');
  if (view === 'orders' && !state.orders.length) loadOrders();
  if (view === 'settings' && !state.deliverySettings) loadDeliverySettings();
  if (updateHistory) window.history.pushState({}, '', view === 'settings' ? '/admin/settings' : '/admin/');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const setRestrictionFields = mode => {
  elements.radiusSettings.hidden = mode !== 'radius';
  elements.prefixSettings.hidden = mode !== 'prefixes';
};

const renderDeliverySettings = settings => {
  state.deliverySettings = settings;
  const form = elements.deliverySettingsForm.elements;
  form.deliveryEnabled.checked = settings.deliveryEnabled;
  form.collectionEnabled.checked = settings.collectionEnabled;
  form.deliveryRestrictionMode.value = settings.deliveryRestrictionMode;
  form.baseDeliveryPostcode.value = settings.baseDeliveryPostcode || '';
  form.deliveryRadiusMiles.value = settings.deliveryRadiusMiles;
  form.allowedPostcodePrefixes.value = settings.allowedPostcodePrefixes.join(', ');
  form.deliveryUnavailableMessage.value = settings.deliveryUnavailableMessage;
  elements.activeDeliveryRule.textContent = settings.orderingDisabled ? 'Online ordering is temporarily disabled.' : settings.activeRule;
  elements.settingsUpdatedAt.textContent = settings.updatedAt ? `Last updated ${longDate(settings.updatedAt)}` : '';
  setRestrictionFields(settings.deliveryRestrictionMode);
};

const loadDeliverySettings = async () => {
  clearNotice(elements.settingsNotice);
  try {
    const data = await api('/api/admin/delivery-settings');
    renderDeliverySettings(data.settings);
  } catch (error) {
    showNotice(elements.settingsNotice, error.message, true);
  }
};

const saveDeliverySettings = async event => {
  event.preventDefault();
  clearNotice(elements.settingsNotice);
  const formData = new FormData(elements.deliverySettingsForm);
  const deliveryEnabled = formData.get('deliveryEnabled') === 'on';
  const collectionEnabled = formData.get('collectionEnabled') === 'on';
  let confirmOrderingDisabled = false;
  if (!deliveryEnabled && !collectionEnabled) {
    confirmOrderingDisabled = window.confirm('Turn off both delivery and collection and temporarily disable ordering?');
    if (!confirmOrderingDisabled) return;
  }

  elements.saveDeliverySettings.disabled = true;
  try {
    const data = await api('/api/admin/delivery-settings', {
      method: 'PUT',
      body: JSON.stringify({
        deliveryEnabled,
        collectionEnabled,
        deliveryRestrictionMode: formData.get('deliveryRestrictionMode'),
        baseDeliveryPostcode: formData.get('baseDeliveryPostcode'),
        deliveryRadiusMiles: formData.get('deliveryRadiusMiles'),
        allowedPostcodePrefixes: formData.get('allowedPostcodePrefixes'),
        deliveryUnavailableMessage: formData.get('deliveryUnavailableMessage'),
        confirmOrderingDisabled,
      }),
    });
    renderDeliverySettings(data.settings);
    showNotice(elements.settingsNotice, 'Delivery settings saved. Checkout is using the updated rules.');
    showToast('Delivery settings saved');
  } catch (error) {
    showNotice(elements.settingsNotice, error.message, true);
  } finally {
    elements.saveDeliverySettings.disabled = false;
  }
};

const renderStatusSummary = statuses => {
  elements.statusSummary.replaceChildren();
  const total = Math.max(1, statuses.reduce((sumValue, item) => sumValue + item.orderCount, 0));
  const ordered = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'];
  const statusMap = new Map(statuses.map(item => [item.status, item.orderCount]));

  ordered.forEach(status => {
    const count = statusMap.get(status) || 0;
    const row = document.createElement('div');
    row.className = 'status-row';
    const head = document.createElement('div');
    head.className = 'status-row-head';
    const name = document.createElement('span');
    name.textContent = status === 'pending' ? 'Pending payment' : status;
    const value = document.createElement('strong');
    value.textContent = String(count);
    head.append(name, value);
    const track = document.createElement('div');
    track.className = 'status-track';
    const fill = document.createElement('div');
    fill.className = 'status-fill';
    fill.style.width = `${Math.max(count ? 5 : 0, (count / total) * 100)}%`;
    track.append(fill);
    row.append(head, track);
    elements.statusSummary.append(row);
  });
};

const renderChart = daily => {
  elements.salesChart.replaceChildren();
  elements.chartEmpty.hidden = daily.length > 0;
  elements.salesChart.hidden = daily.length === 0;
  if (!daily.length) return;

  const svgNs = 'http://www.w3.org/2000/svg';
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 16, bottom: 35, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(...daily.map(item => item.revenue), 100);
  const peak = Math.ceil(maximum / 1000) * 1000;
  const x = index => padding.left + (daily.length === 1 ? plotWidth / 2 : (index / (daily.length - 1)) * plotWidth);
  const y = value => padding.top + plotHeight - (value / peak) * plotHeight;

  const defs = document.createElementNS(svgNs, 'defs');
  const gradient = document.createElementNS(svgNs, 'linearGradient');
  gradient.id = 'sales-gradient';
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('x2', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('y2', '1');
  [['0%', '#e96f3640'], ['100%', '#e96f3600']].forEach(([offset, color]) => {
    const stop = document.createElementNS(svgNs, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.append(stop);
  });
  defs.append(gradient);
  elements.salesChart.append(defs);

  [0, .25, .5, .75, 1].forEach(ratio => {
    const line = document.createElementNS(svgNs, 'line');
    const lineY = padding.top + plotHeight * ratio;
    line.setAttribute('x1', String(padding.left));
    line.setAttribute('x2', String(width - padding.right));
    line.setAttribute('y1', String(lineY));
    line.setAttribute('y2', String(lineY));
    line.setAttribute('class', 'chart-grid');
    elements.salesChart.append(line);

    const label = document.createElementNS(svgNs, 'text');
    label.setAttribute('x', String(padding.left - 10));
    label.setAttribute('y', String(lineY + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'chart-label');
    label.textContent = money(peak * (1 - ratio)).replace('.00', '');
    elements.salesChart.append(label);
  });

  const points = daily.map((item, index) => `${x(index)},${y(item.revenue)}`).join(' ');
  const area = document.createElementNS(svgNs, 'path');
  const firstX = x(0);
  const lastX = x(daily.length - 1);
  area.setAttribute('d', `M ${firstX} ${padding.top + plotHeight} L ${points.replaceAll(',', ' ')} L ${lastX} ${padding.top + plotHeight} Z`);
  area.setAttribute('class', 'chart-area');
  elements.salesChart.append(area);

  const line = document.createElementNS(svgNs, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('class', 'chart-line');
  elements.salesChart.append(line);

  const labelStep = Math.max(1, Math.ceil(daily.length / 6));
  daily.forEach((item, index) => {
    const dot = document.createElementNS(svgNs, 'circle');
    dot.setAttribute('cx', String(x(index)));
    dot.setAttribute('cy', String(y(item.revenue)));
    dot.setAttribute('r', daily.length > 40 ? '2' : '4');
    dot.setAttribute('class', 'chart-dot');
    const title = document.createElementNS(svgNs, 'title');
    title.textContent = `${item.date}: ${money(item.revenue)} from ${item.orderCount} order${item.orderCount === 1 ? '' : 's'}`;
    dot.append(title);
    elements.salesChart.append(dot);

    if (index % labelStep === 0 || index === daily.length - 1) {
      const label = document.createElementNS(svgNs, 'text');
      label.setAttribute('x', String(x(index)));
      label.setAttribute('y', String(height - 8));
      label.setAttribute('text-anchor', index === 0 ? 'start' : index === daily.length - 1 ? 'end' : 'middle');
      label.setAttribute('class', 'chart-label');
      label.textContent = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00Z`));
      elements.salesChart.append(label);
    }
  });
};

const createStatusPill = status => {
  const pill = document.createElement('span');
  pill.className = `status-pill status-${status}`;
  pill.textContent = status === 'pending' ? 'Pending payment' : status;
  return pill;
};

const renderRecentOrders = orders => {
  elements.recentOrders.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement('div');
    empty.className = 'orders-empty';
    empty.textContent = 'No orders have arrived yet.';
    elements.recentOrders.append(empty);
    return;
  }

  orders.slice(0, 5).forEach(order => {
    const row = document.createElement('div');
    row.className = 'recent-row';
    const reference = document.createElement('div');
    const referenceStrong = document.createElement('strong');
    referenceStrong.textContent = order.reference;
    const referenceDate = document.createElement('small');
    referenceDate.textContent = longDate(order.createdAt);
    reference.append(referenceStrong, referenceDate);
    const customer = document.createElement('div');
    const customerStrong = document.createElement('strong');
    customerStrong.textContent = order.customer.name;
    const customerEmail = document.createElement('small');
    customerEmail.textContent = order.customer.email;
    customer.append(customerStrong, customerEmail);
    const status = createStatusPill(order.status);
    const total = document.createElement('strong');
    total.textContent = money(order.amountTotal, order.currency);
    row.append(reference, customer, status, total);
    elements.recentOrders.append(row);
  });
};

const loadReport = async () => {
  clearNotice(elements.overviewNotice);
  const params = new URLSearchParams({ from: elements.reportFrom.value, to: elements.reportTo.value });
  try {
    const report = await api(`/api/admin/sales-report?${params}`);
    state.report = report;
    elements.metricRevenue.textContent = money(report.summary.revenue, report.currency);
    elements.metricOrders.textContent = report.summary.orderCount.toLocaleString('en-GB');
    elements.metricAverage.textContent = money(report.summary.averageOrder, report.currency);
    const active = report.statuses.filter(item => ['paid', 'preparing', 'ready'].includes(item.status)).reduce((sumValue, item) => sumValue + item.orderCount, 0);
    elements.metricActive.textContent = active.toLocaleString('en-GB');
    elements.metricRange.textContent = `${elements.reportFrom.value} — ${elements.reportTo.value}`;
    renderStatusSummary(report.statuses);
    renderChart(report.daily);
  } catch (error) {
    showNotice(elements.overviewNotice, error.message, true);
  }
};

const customizationText = item => (item.customizations || []).flatMap(group =>
  (group.selections || []).map(selection => `${group.groupName}: ${selection.name}`)
).join(' · ');

const deliveryFor = (order, kind, status) => order.emailDeliveries.find(delivery =>
  delivery.kind === kind && delivery.status === status
);

const emailStateLabel = (sentAt, delivery) => {
  if (sentAt) return `Sent ${longDate(sentAt)}`;
  if (delivery?.state === 'failed') return 'Delivery failed — retry available';
  if (delivery?.state === 'pending') return 'Sending';
  return 'Not sent';
};

const createOrderCard = order => {
  const card = document.createElement('article');
  card.className = 'order-card';

  const main = document.createElement('div');
  main.className = 'order-main';
  const reference = document.createElement('div');
  reference.className = 'order-reference';
  const referenceStrong = document.createElement('strong');
  referenceStrong.textContent = order.reference;
  const referenceDate = document.createElement('span');
  referenceDate.textContent = longDate(order.createdAt);
  reference.append(referenceStrong, referenceDate);

  const customer = document.createElement('div');
  customer.className = 'order-customer';
  const customerStrong = document.createElement('strong');
  customerStrong.textContent = order.customer.name;
  const customerEmail = document.createElement('span');
  customerEmail.textContent = order.customer.email;
  customer.append(customerStrong, customerEmail);

  const meta = document.createElement('div');
  meta.className = 'order-meta';
  const itemCount = document.createElement('span');
  itemCount.textContent = `${order.items.reduce((sumValue, item) => sumValue + item.quantity, 0)} item${order.items.length === 1 ? '' : 's'}`;
  const fulfilment = document.createElement('span');
  fulfilment.textContent = titleCase(order.fulfilment);
  meta.append(itemCount, fulfilment);

  const amount = document.createElement('strong');
  amount.className = 'order-amount';
  amount.textContent = money(order.amountTotal, order.currency);
  const pill = createStatusPill(order.status);
  const toggle = document.createElement('button');
  toggle.className = 'icon-button order-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', `Show details for ${order.reference}`);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '⌄';
  toggle.addEventListener('click', () => {
    const isOpen = card.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  main.append(reference, customer, meta, amount, pill, toggle);

  const detail = document.createElement('div');
  detail.className = 'order-detail';
  const itemsSection = document.createElement('section');
  const itemsTitle = document.createElement('h3');
  itemsTitle.className = 'detail-title';
  itemsTitle.textContent = 'Order items';
  const itemList = document.createElement('div');
  itemList.className = 'item-list';
  order.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const quantity = document.createElement('span');
    quantity.className = 'item-quantity';
    quantity.textContent = `${item.quantity}×`;
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name;
    copy.append(name);
    const customizations = customizationText(item);
    if (customizations) {
      const small = document.createElement('small');
      small.textContent = customizations;
      copy.append(small);
    }
    const total = document.createElement('span');
    total.textContent = money(item.lineTotal, order.currency);
    row.append(quantity, copy, total);
    itemList.append(row);
  });
  itemsSection.append(itemsTitle, itemList);

  const detailsSection = document.createElement('section');
  const detailsTitle = document.createElement('h3');
  detailsTitle.className = 'detail-title';
  detailsTitle.textContent = 'Customer & fulfilment';
  const details = document.createElement('dl');
  details.className = 'customer-details';
  const fields = [
    ['Phone', order.customer.phone],
    ['Method', titleCase(order.fulfilment)],
    ['Address', [order.deliveryAddress, order.postcode].filter(Boolean).join(', ') || '—'],
    ['Delivery validation', order.deliveryValidationResult ? titleCase(order.deliveryValidationResult) : '—'],
    ['Delivery rule', order.deliveryRestrictionMode ? titleCase(order.deliveryRestrictionMode) : '—'],
    ['Delivery distance', Number.isFinite(order.deliveryDistanceMiles) ? `${order.deliveryDistanceMiles.toFixed(1)} miles` : '—'],
    ['Notes', order.notes || '—'],
    ['Paid', order.paidAt ? longDate(order.paidAt) : 'Not yet'],
    ['Prep time', order.estimatedPrepMinutes ? `${order.estimatedPrepMinutes} minutes` : 'Not set'],
  ];
  fields.forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    wrapper.append(term, description);
    details.append(wrapper);
  });
  detailsSection.append(detailsTitle, details);

  const prepControls = document.createElement('div');
  prepControls.className = 'prep-controls';
  const prepLabel = document.createElement('label');
  const prepLabelText = document.createElement('span');
  prepLabelText.textContent = 'Estimated preparation time';
  const prepSelect = document.createElement('select');
  prepSelect.setAttribute('aria-label', `Estimated preparation time for ${order.reference}`);
  [null, 15, 20, 25, 30, 45, 60].forEach(minutes => {
    const option = document.createElement('option');
    option.value = minutes || '';
    option.textContent = minutes ? `${minutes} minutes` : 'Not set';
    option.selected = order.estimatedPrepMinutes === minutes;
    prepSelect.append(option);
  });
  prepLabel.append(prepLabelText, prepSelect);
  const savePrep = document.createElement('button');
  savePrep.type = 'button';
  savePrep.className = 'button button-secondary';
  savePrep.textContent = 'Save prep time';
  savePrep.addEventListener('click', () => updateOrder(order, {
    estimatedPrepMinutes: prepSelect.value || null,
  }, savePrep, 'Preparation time saved.'));
  prepControls.append(prepLabel, savePrep);
  detailsSection.append(prepControls);

  const customerPaidDelivery = deliveryFor(order, 'customer', 'paid');
  const merchantPaidDelivery = deliveryFor(order, 'merchant', 'paid');
  const currentStatusDelivery = deliveryFor(order, 'customer', order.status);
  const emailStatus = document.createElement('div');
  emailStatus.className = 'email-status';
  const emailTitle = document.createElement('h3');
  emailTitle.className = 'detail-title';
  emailTitle.textContent = 'Email delivery';
  const customerEmailState = document.createElement('p');
  customerEmailState.innerHTML = '<strong>Customer confirmation</strong>';
  customerEmailState.append(document.createTextNode(emailStateLabel(order.customerEmailSentAt, customerPaidDelivery)));
  const merchantEmailState = document.createElement('p');
  merchantEmailState.innerHTML = '<strong>Admin notification</strong>';
  merchantEmailState.append(document.createTextNode(emailStateLabel(order.merchantEmailSentAt, merchantPaidDelivery)));
  const statusEmailState = document.createElement('p');
  statusEmailState.innerHTML = `<strong>${titleCase(order.status)} update</strong>`;
  statusEmailState.append(document.createTextNode(emailStateLabel(currentStatusDelivery?.sentAt, currentStatusDelivery)));
  emailStatus.append(emailTitle, customerEmailState, merchantEmailState, statusEmailState);
  detailsSection.append(emailStatus);

  const notifyLabel = document.createElement('label');
  notifyLabel.className = 'notify-choice';
  const notifyCheckbox = document.createElement('input');
  notifyCheckbox.type = 'checkbox';
  notifyCheckbox.checked = true;
  notifyLabel.append(notifyCheckbox, document.createTextNode('Email the customer when status changes'));
  detailsSection.append(notifyLabel);

  if (order.allowedStatuses.length) {
    const actions = document.createElement('div');
    actions.className = 'status-actions';
    order.allowedStatuses.forEach(status => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button ${status === 'cancelled' ? 'button-secondary' : 'button-primary'}`;
      button.textContent = status === 'cancelled' ? 'Cancel order' : `Mark ${status}`;
      button.addEventListener('click', () => updateStatus(order, status, notifyCheckbox.checked, button));
      actions.append(button);
    });
    detailsSection.append(actions);
  }

  if (['paid', 'preparing', 'ready', 'completed', 'cancelled'].includes(order.status)) {
    const sendUpdate = document.createElement('button');
    sendUpdate.type = 'button';
    sendUpdate.className = 'button button-quiet send-update';
    sendUpdate.textContent = currentStatusDelivery?.state === 'sent' ? `${titleCase(order.status)} email sent` : 'Send customer update';
    sendUpdate.disabled = currentStatusDelivery?.state === 'sent' || currentStatusDelivery?.state === 'pending';
    sendUpdate.addEventListener('click', () => updateOrder(order, { sendCustomerUpdate: true }, sendUpdate, 'Customer update queued.'));
    detailsSection.append(sendUpdate);
  }

  detail.append(itemsSection, detailsSection);
  card.append(main, detail);
  return card;
};

const renderOrders = () => {
  elements.ordersList.replaceChildren();
  elements.orderTotal.textContent = state.pagination.total.toLocaleString('en-GB');
  elements.navOrderCount.textContent = state.pagination.total > 99 ? '99+' : String(state.pagination.total);
  elements.pageLabel.textContent = `Page ${state.pagination.page} of ${state.pagination.pages}`;
  elements.previousPage.disabled = state.pagination.page <= 1;
  elements.nextPage.disabled = state.pagination.page >= state.pagination.pages;

  if (!state.orders.length) {
    const empty = document.createElement('div');
    empty.className = 'orders-empty';
    empty.textContent = 'No orders match these filters.';
    elements.ordersList.append(empty);
    return;
  }
  state.orders.forEach(order => elements.ordersList.append(createOrderCard(order)));
};

const loadOrders = async (page = state.pagination.page) => {
  clearNotice(elements.ordersNotice);
  const params = new URLSearchParams(state.filters);
  params.set('page', String(page));
  try {
    const data = await api(`/api/admin/orders?${params}`);
    state.orders = data.orders;
    state.pagination = data.pagination;
    renderOrders();
    renderRecentOrders(data.orders);
  } catch (error) {
    showNotice(elements.ordersNotice, error.message, true);
  }
};

const updateOrder = async (order, changes, button, successMessage) => {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Updating…';
  try {
    await api('/api/admin/orders', {
      method: 'PATCH',
      body: JSON.stringify({ id: order.id, ...changes }),
    });
    showToast(`${order.reference}: ${successMessage}`);
    await Promise.all([loadOrders(), loadReport()]);
  } catch (error) {
    showNotice(elements.ordersNotice, error.message, true);
    button.disabled = false;
    button.textContent = original;
  }
};

const updateStatus = (order, status, notifyCustomer, button) => updateOrder(
  order,
  { status, notifyCustomer },
  button,
  `Order is now ${status}${notifyCustomer ? '; customer update queued' : ''}.`,
);

const refreshAll = async () => Promise.all([loadReport(), loadOrders(1)]);

const pollForPaidOrders = async () => {
  if (!state.lastPaidPollAt || document.hidden) return;
  const paidAfter = state.lastPaidPollAt;
  state.lastPaidPollAt = new Date().toISOString();
  try {
    const data = await api(`/api/admin/orders?paidAfter=${encodeURIComponent(paidAfter)}`);
    const newOrders = data.orders.filter(order => order.paidAt && !state.seenPaidOrderIds.has(order.id));
    data.orders.forEach(order => state.seenPaidOrderIds.add(order.id));
    if (!newOrders.length) return;
    state.newPaidOrderCount += newOrders.length;
    renderNewOrderAlert();
    playOrderSound();
    await Promise.all([loadOrders(1), loadReport()]);
  } catch (error) {
    console.error('New order polling failed', error.message);
  }
};

const bindEvents = () => {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view, true)));
  document.querySelectorAll('[data-go-orders]').forEach(button => button.addEventListener('click', () => switchView('orders')));
  document.querySelector('#refresh-dashboard').addEventListener('click', refreshAll);
  document.querySelector('#report-range').addEventListener('submit', event => { event.preventDefault(); loadReport(); });
  document.querySelector('#order-filters').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.filters = new URLSearchParams();
    for (const [key, value] of form.entries()) if (String(value).trim()) state.filters.set(key, String(value).trim());
    loadOrders(1);
  });
  document.querySelector('#order-filters').addEventListener('reset', () => {
    window.setTimeout(() => { state.filters = new URLSearchParams(); loadOrders(1); }, 0);
  });
  elements.previousPage.addEventListener('click', () => loadOrders(state.pagination.page - 1));
  elements.nextPage.addEventListener('click', () => loadOrders(state.pagination.page + 1));
  elements.mobileMenu.addEventListener('click', () => {
    const isOpen = elements.sidebar.classList.toggle('is-open');
    elements.mobileMenu.setAttribute('aria-expanded', String(isOpen));
  });
  elements.viewNewOrders.addEventListener('click', () => {
    state.newPaidOrderCount = 0;
    renderNewOrderAlert();
    state.filters = new URLSearchParams();
    switchView('orders');
    loadOrders(1);
  });
  elements.dismissOrderAlert.addEventListener('click', () => {
    state.newPaidOrderCount = 0;
    renderNewOrderAlert();
  });
  elements.toggleOrderSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    elements.toggleOrderSound.textContent = state.soundEnabled ? 'Sound enabled' : 'Enable sound';
    if (state.soundEnabled) playOrderSound();
  });
  elements.deliverySettingsForm.addEventListener('submit', saveDeliverySettings);
  elements.deliverySettingsForm.elements.deliveryRestrictionMode.forEach(input => input.addEventListener('change', event => setRestrictionFields(event.target.value)));
  window.addEventListener('popstate', () => switchView(window.location.pathname === '/admin/settings' ? 'settings' : 'overview'));
};

const start = async () => {
  showLoginError();
  setupDates();
  bindEvents();

  try {
    const session = await api('/api/admin/session');
    state.admin = session.admin;
    elements.adminName.textContent = session.admin.name || 'Admin';
    elements.adminEmail.textContent = session.admin.email;
    elements.adminInitial.textContent = (session.admin.name || session.admin.email || 'A').charAt(0).toUpperCase();
    elements.loginShell.hidden = true;
    elements.appShell.hidden = false;
    state.lastPaidPollAt = new Date().toISOString();
    await refreshAll();
    switchView(window.location.pathname === '/admin/settings' ? 'settings' : 'overview');
    window.setInterval(pollForPaidOrders, 20000);
  } catch {
    elements.loginShell.hidden = false;
    elements.appShell.hidden = true;
  }
};

start();
