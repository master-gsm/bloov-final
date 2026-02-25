import { Minus, Plus, Trash2, ShoppingCart, Tag } from 'lucide-react';
import type { POSCartItem, POSCustomer } from './types';

interface POSCartProps {
  items: POSCartItem[];
  customers: POSCustomer[];
  walkinName: string;
  walkinPhone: string;
  lookedUpCustomer: POSCustomer | null;
  isLookingUp: boolean;
  saleDiscount: number;
  taxRate: number;
  paymentMethod: string;
  isRTL: boolean;
  onUpdateQty: (index: number, qty: number) => void;
  onRemoveItem: (index: number) => void;
  onPhoneChange: (phone: string) => void;
  onDiscountChange: (val: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onCharge: () => void;
  submitting: boolean;
  error: string;
}

export function POSCart({
  items,
  customers,
  walkinName,
  walkinPhone,
  lookedUpCustomer,
  isLookingUp,
  saleDiscount,
  taxRate,
  paymentMethod,
  isRTL,
  onUpdateQty,
  onRemoveItem,
  onPhoneChange,
  onDiscountChange,
  onPaymentMethodChange,
  onCharge,
  submitting,
  error,
}: POSCartProps) {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxableAmount = subtotal - saleDiscount;
  const vatAmount = Math.round(taxableAmount * taxRate * 100) / 100;
  const total = taxableAmount + vatAmount;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const canCharge = items.length > 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Cart Header */}
      <div className="bg-gradient-to-r from-violet-700 to-purple-700 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 text-white" />
          <h2 className="text-lg font-bold text-white">
            {isRTL ? 'الفاتورة' : 'Order'}
          </h2>
          {items.length > 0 && (
            <span className="bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </div>
      </div>

      {/* Customer Phone */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <input
            type="tel"
            value={walkinPhone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder={isRTL ? 'رقم الجوال (اختياري)' : 'Phone (optional)'}
            className={`w-full py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${isRTL ? 'pr-4 pl-4 text-right' : 'pl-4 pr-4'}`}
            dir="ltr"
          />
          {isLookingUp && (
            <div className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {lookedUpCustomer && (
          <div className="mt-2 flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-1.5">
            <div className="w-2 h-2 bg-violet-500 rounded-full" />
            <span className="text-xs font-medium text-violet-700">
              {isRTL ? (lookedUpCustomer.name_ar || lookedUpCustomer.name) : lookedUpCustomer.name}
            </span>
          </div>
        )}
        {walkinName && !lookedUpCustomer && (
          <p className="mt-1 text-xs text-gray-500 px-1">{walkinName}</p>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
            <ShoppingCart className="w-16 h-16 mb-3" />
            <p className="text-base font-medium">{isRTL ? 'لا توجد منتجات' : 'Cart is empty'}</p>
            <p className="text-sm mt-1">{isRTL ? 'اضغط على منتج للإضافة' : 'Tap a product to add'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-900 flex-1 leading-tight line-clamp-2" dir={isRTL ? 'rtl' : 'ltr'}>
                    {isRTL ? item.product_name_ar : item.product_name}
                  </p>
                  <button
                    onClick={() => onRemoveItem(idx)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdateQty(idx, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors active:scale-95"
                    >
                      <Minus className="w-4 h-4 text-gray-700" />
                    </button>
                    <span className="w-10 text-center text-base font-bold text-gray-900">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(idx, item.quantity + 1)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-violet-100 hover:bg-violet-200 transition-colors active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-violet-700" />
                    </button>
                  </div>

                  <div className={`text-right ${isRTL ? 'text-left' : ''}`}>
                    <p className="text-sm font-bold text-gray-900">{fmt(item.total)} <span className="text-xs text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</span></p>
                    <p className="text-xs text-gray-400">{fmt(item.unit_price)} × {item.quantity}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discount */}
      {items.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="number"
              min="0"
              value={saleDiscount || ''}
              onChange={e => onDiscountChange(parseFloat(e.target.value) || 0)}
              placeholder={isRTL ? 'خصم (ر.س)' : 'Discount (SAR)'}
              className="flex-1 py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
        </div>
      )}

      {/* Totals */}
      {items.length > 0 && (
        <div className="px-4 pt-3 pb-1 border-t border-gray-100 flex-shrink-0 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-500">
            <span>{isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
            <span>{fmt(subtotal)} {isRTL ? 'ر.س' : 'SAR'}</span>
          </div>
          {saleDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{isRTL ? 'الخصم' : 'Discount'}</span>
              <span>- {fmt(saleDiscount)} {isRTL ? 'ر.س' : 'SAR'}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-500">
            <span>{isRTL ? `ضريبة (${(taxRate * 100).toFixed(0)}%)` : `VAT (${(taxRate * 100).toFixed(0)}%)`}</span>
            <span>{fmt(vatAmount)} {isRTL ? 'ر.س' : 'SAR'}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-1 border-t border-gray-200">
            <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
            <span className="text-violet-700">{fmt(total)} {isRTL ? 'ر.س' : 'SAR'}</span>
          </div>
        </div>
      )}

      {/* Payment Method */}
      <div className="px-4 py-3 flex-shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onPaymentMethodChange('cash')}
            className={`py-3 rounded-xl text-sm font-bold transition-all ${
              paymentMethod === 'cash'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isRTL ? 'نقدي' : 'Cash'}
          </button>
          <button
            onClick={() => onPaymentMethodChange('credit')}
            className={`py-3 rounded-xl text-sm font-bold transition-all ${
              paymentMethod === 'credit'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isRTL ? 'آجل' : 'Credit'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs flex-shrink-0">
          {error}
        </div>
      )}

      {/* Charge Button */}
      <div className="px-4 pb-4 flex-shrink-0">
        <button
          onClick={onCharge}
          disabled={!canCharge || submitting}
          className={`w-full py-5 rounded-2xl text-xl font-bold transition-all shadow-lg active:scale-98 ${
            canCharge && !submitting
              ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-violet-200'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isRTL ? 'جاري المعالجة...' : 'Processing...'}
            </span>
          ) : (
            <span>
              {isRTL ? 'تحصيل' : 'Charge'}{items.length > 0 ? ` · ${fmt(total)} ${isRTL ? 'ر.س' : 'SAR'}` : ''}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
