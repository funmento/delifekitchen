export const deliverEmailOnce = async ({
  order,
  kind,
  statusKey,
  recipient,
  email,
  store,
  transport,
  now = () => new Date(),
}) => {
  const claimed = await store.claim({ order, kind, statusKey, recipient, attemptedAt: now() });
  if (!claimed) return { sent: false, duplicate: true };

  try {
    await transport.send({
      to: recipient,
      email,
      idempotencyKey: `${order.reference}-${kind}-${statusKey}`,
    });
    const sentAt = now();
    await store.markSent({ order, kind, statusKey, sentAt });
    return { sent: true, sentAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email delivery error';
    await store.markFailed({ order, kind, statusKey, error: message, attemptedAt: now() });
    return { sent: false, error: message };
  }
};

export const runPaidOrderNotifications = async ({ order, sendMerchant, sendCustomer }) => {
  const [merchant, customer] = await Promise.all([
    sendMerchant(order),
    sendCustomer(order),
  ]);
  return { merchant, customer };
};
