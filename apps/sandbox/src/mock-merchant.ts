/**
 * Mock Merchant Server
 *
 * Simulates a merchant that accepts agent transactions.
 * In production, this would be an actual merchant's API.
 */

export interface MerchantProduct {
  id: string;
  name: string;
  price: number;
  currency: 'USD';
  category: string;
  merchantUrl: string;
}

export interface MerchantOrder {
  orderId: string;
  product: MerchantProduct;
  status: 'confirmed' | 'processing' | 'shipped';
  createdAt: string;
}

const CATALOG: MerchantProduct[] = [
  {
    id: 'prod_001',
    name: 'Sony WH-1000XM5 Headphones',
    price: 278.0,
    currency: 'USD',
    category: 'electronics',
    merchantUrl: 'https://mock-merchant.agentgate.dev/products/prod_001',
  },
  {
    id: 'prod_002',
    name: 'The Pragmatic Programmer (Book)',
    price: 42.99,
    currency: 'USD',
    category: 'books',
    merchantUrl: 'https://mock-merchant.agentgate.dev/products/prod_002',
  },
  {
    id: 'prod_003',
    name: 'Organic Coffee Beans (2lb)',
    price: 24.5,
    currency: 'USD',
    category: 'groceries',
    merchantUrl: 'https://mock-merchant.agentgate.dev/products/prod_003',
  },
  {
    id: 'prod_004',
    name: 'Premium Noise-Cancelling Earbuds',
    price: 149.99,
    currency: 'USD',
    category: 'electronics',
    merchantUrl: 'https://mock-merchant.agentgate.dev/products/prod_004',
  },
  {
    id: 'prod_005',
    name: 'Standing Desk Converter',
    price: 350.0,
    currency: 'USD',
    category: 'electronics',
    merchantUrl: 'https://mock-merchant.agentgate.dev/products/prod_005',
  },
];

const orders: MerchantOrder[] = [];

export class MockMerchant {
  getCatalog(): MerchantProduct[] {
    return CATALOG;
  }

  getProduct(id: string): MerchantProduct | undefined {
    return CATALOG.find((p) => p.id === id);
  }

  search(query: string): MerchantProduct[] {
    const q = query.toLowerCase();
    return CATALOG.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }

  placeOrder(product: MerchantProduct): MerchantOrder {
    const order: MerchantOrder = {
      orderId: `order_${Date.now()}`,
      product,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    orders.push(order);
    return order;
  }

  getOrders(): MerchantOrder[] {
    return orders;
  }
}
