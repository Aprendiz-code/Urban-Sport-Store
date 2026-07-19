import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth.js';
import { env } from '../src/config/env.js';
const prisma = new PrismaClient();
const main = async () => {
    const customerRole = await prisma.role.upsert({
        where: { name: 'CUSTOMER' },
        update: {},
        create: { name: 'CUSTOMER' },
    });
    const adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' },
    });
    const adminPasswordHash = await hashPassword(env.seedAdminPassword);
    const adminUser = await prisma.user.upsert({
        where: { email: env.seedAdminEmail },
        update: {},
        create: {
            name: env.seedAdminName,
            email: env.seedAdminEmail,
            passwordHash: adminPasswordHash,
            userRoles: { create: { roleId: adminRole.id } },
        },
    });
    await prisma.userRole.upsert({
        where: { userId_roleId: { userId: adminUser.id, roleId: customerRole.id } },
        update: {},
        create: { userId: adminUser.id, roleId: customerRole.id },
    });
    const categories = [
        { name: 'Running', slug: 'running', description: 'Shoes for runners' },
        { name: 'Training', slug: 'training', description: 'Versatile training gear' },
        { name: 'Lifestyle', slug: 'lifestyle', description: 'Everyday apparel' },
    ];
    for (const category of categories) {
        await prisma.category.upsert({ where: { slug: category.slug }, update: {}, create: category });
    }
    const brands = [
        { name: 'Nike', slug: 'nike', description: 'Performance footwear' },
        { name: 'Adidas', slug: 'adidas', description: 'Sport culture' },
        { name: 'Puma', slug: 'puma', description: 'Bold athletic gear' },
    ];
    for (const brand of brands) {
        await prisma.brand.upsert({ where: { slug: brand.slug }, update: {}, create: brand });
    }
    const categoryIds = await prisma.category.findMany({ select: { id: true } });
    const brandIds = await prisma.brand.findMany({ select: { id: true } });
    const products = [
        { name: 'Air Max 90', slug: 'air-max-90', sku: 'SKU-001', price: 129.99, compareAtPrice: 159.99, stock: 15, categoryId: categoryIds[0].id, brandId: brandIds[0].id },
        { name: 'Ultraboost 23', slug: 'ultraboost-23', sku: 'SKU-002', price: 149.99, compareAtPrice: 179.99, stock: 20, categoryId: categoryIds[0].id, brandId: brandIds[1].id },
        { name: 'Future Rider', slug: 'future-rider', sku: 'SKU-003', price: 89.99, compareAtPrice: 109.99, stock: 10, categoryId: categoryIds[1].id, brandId: brandIds[2].id },
        { name: 'Classic tee', slug: 'classic-tee', sku: 'SKU-004', price: 29.99, stock: 30, categoryId: categoryIds[2].id, brandId: brandIds[0].id },
        { name: 'Training jacket', slug: 'training-jacket', sku: 'SKU-005', price: 79.99, stock: 12, categoryId: categoryIds[1].id, brandId: brandIds[1].id },
    ];
    for (const product of products) {
        await prisma.product.upsert({
            where: { sku: product.sku },
            update: {},
            create: { ...product, status: 'ACTIVE' },
        });
    }
    const createdProducts = await prisma.product.findMany({ select: { id: true, sku: true } });
    for (const product of createdProducts) {
        await prisma.productImage.upsert({
            where: { id: `${product.id}-img` },
            update: {},
            create: { productId: product.id, url: 'https://placehold.co/600x600', isPrimary: true, sortOrder: 0 },
        });
    }
    const coupon = await prisma.coupon.upsert({
        where: { code: 'WELCOME10' },
        update: {},
        create: { code: 'WELCOME10', type: 'PERCENTAGE', value: 10, minimumAmount: 50, totalLimit: 100, perUserLimit: 2, startsAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), isActive: true },
    });
    const customer = await prisma.user.upsert({
        where: { email: 'customer@urbansportstore.dev' },
        update: {},
        create: { name: 'Customer Demo', email: 'customer@urbansportstore.dev', passwordHash: await hashPassword('Customer123!'), userRoles: { create: { roleId: customerRole.id } } },
    });
    await prisma.address.upsert({
        where: { id: 'demo-address' },
        update: {},
        create: { id: 'demo-address', userId: customer.id, fullName: 'Customer Demo', line1: '123 Main St', city: 'Bogotá', state: 'Cundinamarca', postalCode: '110111', country: 'CO', phone: '3000000000' },
    });
    const product1 = await prisma.product.findUnique({ where: { sku: 'SKU-001' } });
    if (product1) {
        const cart = await prisma.cart.upsert({ where: { userId: customer.id }, update: {}, create: { userId: customer.id } });
        await prisma.cartItem.upsert({ where: { id: `${cart.id}-item` }, update: {}, create: { id: `${cart.id}-item`, cartId: cart.id, productId: product1.id, quantity: 1 } });
    }
    if (coupon) {
        await prisma.couponUsage.createMany({ data: [{ couponId: coupon.id, userId: customer.id }], skipDuplicates: true });
    }
    const order = await prisma.order.create({ data: { userId: customer.id, subtotal: 129.99, discountAmount: 12.99, taxAmount: 18.72, total: 135.72, status: 'PAID' } });
    await prisma.orderItem.create({ data: { orderId: order.id, productId: product1.id, productName: 'Air Max 90', productSku: 'SKU-001', unitPrice: 129.99, quantity: 1, discountAmount: 12.99, taxAmount: 18.72, lineTotal: 135.72 } });
    await prisma.payment.create({ data: { orderId: order.id, provider: 'simulated', amount: 135.72, idempotencyKey: `seed-${order.id}`, status: 'COMPLETED' } });
    await prisma.inventoryMovement.createMany({ data: [{ productId: product1.id, type: 'OUT', quantity: 1, reason: 'Seed order' }] });
};
main()
    .catch((e) => console.error(e))
    .finally(async () => prisma.$disconnect());
