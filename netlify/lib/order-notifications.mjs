import { and, eq, lt, or } from 'drizzle-orm';
import { orderEmailDeliveries, orders } from '../../db/schema.js';
import { deliverEmailOnce, runPaidOrderNotifications } from './order-delivery.mjs';
import { createCustomerEmail, createMerchantEmail, createStatusEmail, sendOrderEmail } from './order-emails.mjs';

const getEmailConfiguration = () => {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const from = Netlify.env.get('ORDER_EMAIL_FROM');
  const merchantEmail = Netlify.env.get('ORDER_NOTIFICATION_EMAIL');
  const helpEmail = Netlify.env.get('ORDER_HELP_EMAIL') || merchantEmail;
  const helpPhone = Netlify.env.get('ORDER_HELP_PHONE');
  const siteUrl = Netlify.env.get('DEPLOY_PRIME_URL') || Netlify.env.get('URL');
  const logoUrl = siteUrl ? new URL('/assets/brand/delife-kitchen-logo.webp', siteUrl).href : '';
  return { apiKey, from, merchantEmail, help: { helpEmail, helpPhone }, branding: { logoUrl } };
};

const createDeliveryStore = database => ({
  claim: async ({ order, kind, statusKey, recipient, attemptedAt }) => {
    if (kind === 'customer' && statusKey === 'paid' && order.customerEmailSentAt) return false;
    if (kind === 'merchant' && statusKey === 'paid' && order.merchantEmailSentAt) return false;

    const [created] = await database.insert(orderEmailDeliveries).values({
      orderId: order.id,
      kind,
      statusKey,
      recipient,
      state: 'pending',
      attemptedAt,
      updatedAt: attemptedAt,
    }).onConflictDoNothing().returning();
    if (created) return true;

    const retryBefore = new Date(attemptedAt.getTime() - 10 * 60 * 1000);
    const [claimed] = await database.update(orderEmailDeliveries).set({
      state: 'pending',
      recipient,
      attemptedAt,
      lastError: null,
      updatedAt: attemptedAt,
    }).where(and(
      eq(orderEmailDeliveries.orderId, order.id),
      eq(orderEmailDeliveries.kind, kind),
      eq(orderEmailDeliveries.statusKey, statusKey),
      or(
        eq(orderEmailDeliveries.state, 'failed'),
        and(eq(orderEmailDeliveries.state, 'pending'), lt(orderEmailDeliveries.updatedAt, retryBefore)),
      ),
    )).returning();
    return Boolean(claimed);
  },
  markSent: async ({ order, kind, statusKey, sentAt }) => {
    await database.update(orderEmailDeliveries).set({
      state: 'sent',
      sentAt,
      lastError: null,
      updatedAt: sentAt,
    }).where(and(
      eq(orderEmailDeliveries.orderId, order.id),
      eq(orderEmailDeliveries.kind, kind),
      eq(orderEmailDeliveries.statusKey, statusKey),
    ));

    if (kind === 'customer' && statusKey === 'paid') {
      await database.update(orders).set({ customerEmailSentAt: sentAt, updatedAt: sentAt }).where(eq(orders.id, order.id));
    }
    if (kind === 'merchant' && statusKey === 'paid') {
      await database.update(orders).set({ merchantEmailSentAt: sentAt, updatedAt: sentAt }).where(eq(orders.id, order.id));
    }
  },
  markFailed: async ({ order, kind, statusKey, error, attemptedAt }) => {
    await database.update(orderEmailDeliveries).set({
      state: 'failed',
      lastError: error.slice(0, 500),
      attemptedAt,
      updatedAt: attemptedAt,
    }).where(and(
      eq(orderEmailDeliveries.orderId, order.id),
      eq(orderEmailDeliveries.kind, kind),
      eq(orderEmailDeliveries.statusKey, statusKey),
    ));
  },
});

const createTransport = ({ apiKey, from }) => ({
  send: ({ to, email, idempotencyKey }) => sendOrderEmail({ apiKey, from, to, email, idempotencyKey }),
});

const deliver = async ({ order, kind, statusKey, recipient, email, configuration, database }) => {
  const result = await deliverEmailOnce({
    order,
    kind,
    statusKey,
    recipient,
    email,
    store: createDeliveryStore(database),
    transport: createTransport(configuration),
  });
  if (result.error) console.error('Order email delivery failed', { reference: order.reference, kind, statusKey, error: result.error });
  return result;
};

export const sendPaidOrderNotifications = async (order, providedDatabase) => {
  const database = providedDatabase || (await import('../../db/index.js')).db;
  const configuration = getEmailConfiguration();
  if (!configuration.apiKey || !configuration.from) {
    console.error('Order email delivery is not configured');
    return { configured: false };
  }

  return runPaidOrderNotifications({
    order,
    sendMerchant: currentOrder => {
      if (!configuration.merchantEmail) {
        console.error('Merchant order email delivery is not configured');
        return { configured: false };
      }
      return deliver({
        order: currentOrder,
        kind: 'merchant',
        statusKey: 'paid',
        recipient: configuration.merchantEmail,
        email: createMerchantEmail(currentOrder, configuration.branding),
        configuration,
        database,
      });
    },
    sendCustomer: currentOrder => deliver({
      order: currentOrder,
      kind: 'customer',
      statusKey: 'paid',
      recipient: currentOrder.customerEmail,
      email: createCustomerEmail(currentOrder, configuration.help, configuration.branding),
      configuration,
      database,
    }),
  });
};

export const sendCustomerStatusNotification = async (order, status = order.status, providedDatabase) => {
  const database = providedDatabase || (await import('../../db/index.js')).db;
  const configuration = getEmailConfiguration();
  if (!configuration.apiKey || !configuration.from) {
    console.error('Customer status email delivery is not configured');
    return { configured: false };
  }

  return deliver({
    order,
    kind: 'customer',
    statusKey: status,
    recipient: order.customerEmail,
    email: createStatusEmail(order, status, configuration.help, configuration.branding),
    configuration,
    database,
  });
};
