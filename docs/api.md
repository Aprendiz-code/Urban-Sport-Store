# API Guide

Base URL: /api/v1

## Authentication
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/forgot-password
- POST /auth/reset-password
- GET /auth/me

## Catalog
- GET /products
- GET /products/:slug
- GET /products/featured
- GET /products/search
- GET /categories
- GET /categories/:slug
- GET /brands

## Cart, Orders and Payments
- GET /cart
- POST /cart/items
- PATCH /cart/items/:itemId
- DELETE /cart/items/:itemId
- DELETE /cart
- POST /coupons/validate
- POST /orders
- GET /orders
- GET /orders/:orderId
- PATCH /orders/:orderId/cancel
- POST /payments/create-session
- POST /payments/confirm-simulated

## Admin
- GET /admin/dashboard
- POST /admin/products
- PATCH /admin/products/:productId
- DELETE /admin/products/:productId
- POST /admin/categories
- PATCH /admin/categories/:categoryId
- DELETE /admin/categories/:categoryId
- POST /admin/brands
- PATCH /admin/brands/:brandId
- POST /admin/inventory/movements
- GET /admin/inventory/low-stock
- PATCH /admin/orders/:orderId/status
- POST /admin/coupons
- PATCH /admin/coupons/:couponId
- DELETE /admin/coupons/:couponId
- GET /admin/reports/sales
- GET /admin/reports/inventory
