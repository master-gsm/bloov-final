export interface POSProduct {
  id: string;
  name: string;
  name_ar: string;
  sale_price: number;
  purchase_price: number;
  sku: string;
  type: string;
  classification: string | null;
  image_url?: string | null;
}

export interface POSCustomer {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  phone: string | null;
  tier?: string;
}

export interface POSEmployee {
  id: string;
  full_name: string;
  full_name_ar: string | null;
  employee_code: string;
  is_active: boolean | null;
}

export interface POSCartItem {
  product_id: string;
  product_name: string;
  product_name_ar: string;
  quantity: number;
  unit_price: number;
  purchase_price: number;
  discount: number;
  total: number;
}

export interface CustomerLoyalty {
  id: string;
  customer_id: string;
  points: number;
  total_earned: number;
  total_redeemed: number;
}
