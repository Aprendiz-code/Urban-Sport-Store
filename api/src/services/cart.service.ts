import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';

export class CartService {
  async getCart(userId: string) {
    let cart = await prisma.cart.findUnique({ where: { userId }, include: { items: { include: { product: true } } } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId }, include: { items: { include: { product: true } } } });
    }
    return cart;
  }

  async addItem(userId: string, payload: { productId: string; quantity: number }) {
    const cart = await this.getCart(userId);
    const product = await prisma.product.findUnique({ where: { id: payload.productId } });

    if (!product || product.deletedAt || product.status !== 'ACTIVE') {
      throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'Product unavailable');
    }
    if (product.stock < payload.quantity) {
      throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    }

    const existingItem = cart.items.find((item) => item.productId === payload.productId);
    if (existingItem) {
      return prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + payload.quantity } });
    }

    return prisma.cartItem.create({ data: { cartId: cart.id, productId: payload.productId, quantity: payload.quantity } });
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await this.getCart(userId);
    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new HttpError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found');

    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || product.deletedAt || product.status !== 'ACTIVE') throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'Product unavailable');
    if (quantity <= 0) {
      return prisma.cartItem.delete({ where: { id: item.id } });
    }
    if (product.stock < quantity) throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Insufficient stock');

    return prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getCart(userId);
    const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new HttpError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found');
    return prisma.cartItem.delete({ where: { id: item.id } });
  }

  async clear(userId: string) {
    const cart = await this.getCart(userId);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { ok: true };
  }
}
