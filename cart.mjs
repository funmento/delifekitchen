export const CART_STORAGE_KEY = 'delifeOrder';

export const readCart = storage => {
  if (!storage) return [];
  try {
    const cart = JSON.parse(storage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(cart) ? cart : [];
  } catch {
    storage.removeItem(CART_STORAGE_KEY);
    return [];
  }
};

export const writeCart = (items, storage) => {
  storage?.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  return items;
};

export const addCartItem = (cart, item) => {
  const existing = cart.find(cartItem => cartItem.signature === item.signature);
  if (existing) {
    existing.quantity = Math.min((Number(existing.quantity) || 0) + item.quantity, 20);
    return cart;
  }
  return [...cart, item];
};
