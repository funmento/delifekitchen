import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createDeliveryAgentHandler } from '../lib/delivery-agent.mjs';
import { sendCustomerStatusNotification } from '../lib/order-notifications.mjs';

const createStore = (database, ordersTable) => ({
  findByTokenHash: async tokenHash => {
    const [order] = await database.select().from(ordersTable).where(eq(ordersTable.deliveryTokenHash, tokenHash)).limit(1);
    return order || null;
  },
  complete: async ({ order, tokenHash, deliveredAt, deliveryCompletionNote, allowedStatuses }) => {
    const [completed] = await database.update(ordersTable).set({
      status: 'completed',
      deliveredAt,
      deliveryCompletionNote,
      deliveryTokenHash: null,
      updatedAt: deliveredAt,
    }).where(and(
      eq(ordersTable.id, order.id),
      eq(ordersTable.deliveryTokenHash, tokenHash),
      eq(ordersTable.fulfilment, 'delivery'),
      inArray(ordersTable.status, allowedStatuses),
      isNull(ordersTable.deliveredAt),
    )).returning();
    return completed || null;
  },
});

export const createDeliveryOrderHandler = ({ database = null, ordersTable = null, notifyCompleted = null } = {}) => async req => {
  let activeDatabase = database;
  let activeOrdersTable = ordersTable;
  if (!activeDatabase || !activeOrdersTable) {
    const [databaseModule, schemaModule] = await Promise.all([
      import('../../db/index.js'),
      import('../../db/schema.js'),
    ]);
    activeDatabase ||= databaseModule.db;
    activeOrdersTable ||= schemaModule.orders;
  }

  return createDeliveryAgentHandler({
    store: createStore(activeDatabase, activeOrdersTable),
    notifyCompleted: notifyCompleted || (order => sendCustomerStatusNotification(order, 'completed', activeDatabase)),
  })(req);
};

export default createDeliveryOrderHandler();

export const config = {
  path: '/api/delivery/:token',
};
