import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, Tag, FileText, ChevronDown, ChevronUp, Truck, Building2, UserPlus } from 'lucide-react';
import type { POSCartItem, POSCustomer } from './types';

interface POSCartProps {
  items: POSCartItem[];
  customers: POSCustomer[];
  walkinName: string;
  walkinPhone: string;
  lookedUpCustomer: POSCustomer | null;
  isLookingUp: boolean;
  creatingCustomer: boolean;
  saleDiscount: number;
  saleNotes: string;
  saleSource: 'store' | 'salla' | 'external';
  buyerType: 'individual' | 'business';
  companyName: string;
  companyVatNumber: string;
  companyAddress: string;
  deliveryCharge: number;
  deliveryAddress: string;
  cardMessage: string;
  showDelivery: boolean;
  sallaShippingCost: number;
  sallaPaymentFee: number;
  taxRate: number;
  paymentMethod: string;
  isRTL: boolean;
  onUpdateQty: (index: number, qty: number) => void;
  onRemoveItem: (index: number) => void;
  onPhoneChange: (phone: string) => void;
  onWalkinNameChange: (name: string) => void;
  onAddNewCustomer: () => void;
  onDiscountChange: (val: number) => void;
  onNotesChange: (notes: string) => void;
  onSourceChange: (source: 'store' | 'salla' | 'external') => void;
  onBuyerTypeChange: (type: 'individual' | 'business') => void;
  onCompanyNameChange: (name: string) => void;
  onCompanyVatNumberChange: (vat: string) => void;
  onCompanyAddressChange: (addr: string) => void;
  onDeliveryChargeChange: (charge: number) => void;
  onDeliveryAddressChange: (addr: string) => void;
  onCardMessageChange: (msg: string) => void;
  onShowDeliveryChange: (show: boolean) => void;
  onSallaShippingCostChange: (cost: number) => void;
  onSallaPaymentFeeChange: (fee: number) => void;
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
  creatingCustomer,
  saleDiscount,
  saleNotes,
  saleSource,
  buyerType,
  companyName,
  companyVatNumber,
  companyAddress,
  deliveryCharge,
  deliveryAddress,
  cardMessage,
  showDelivery,
  sallaShippingCost,
  sallaPaymentFee,
  taxRate,
  paymentMethod,
  isRTL,
  onUpdateQty,
  onRemoveItem,
  onPhoneChange,
  onWalkinNameChange,
  onAddNewCustomer,
  onDiscountChange,
  onNotesChange,
  onSourceChange,
  onBuyerTypeChange,
  onCompanyNameChange,
  onCompanyVatNumberChange,
  onCompanyAddressChange,
  onDeliveryChargeChange,
  onDeliveryAddressChange,
  onCardMessageChange,
  onShowDeliveryChange,
  onSallaShippingCostChange,
  onSallaPaymentFeeChange,
  onPaymentMethodChange,
  onCharge,
  submitting,
  error,
}: POSCartProps) {
  const [showExtras, setShowExtras] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxableAmount = subtotal - saleDiscount + deliveryCharge;
  const vatAmount = Math.round(taxableAmount * taxRate * 100) / 100;
  const total = taxableAmount + vatAmount;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const canCharge = items.length > 0;
  const showOnlinePayment = saleSource === 'salla' || saleSource === 'external';

  const inputCls = `w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 ${isRTL ? 'text-right' : ''}`;
  const labelCls = 'text-xs font-medium text-gray-500 mb-1 block';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Cart Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-6 h-6 text-white" />
          <h2 className="text-lg font-bold text-white">
            {isRTL ? 'الفاتورة' : 'Order'}
          </h2>
          {items.length > 0 && (
            <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Customer Section */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="space-y-2">
            <div className="relative">
              <input
                type="tel"
                value={walkinPhone}
                onChange={e => onPhoneChange(e.target.value)}
                placeholder={isRTL ? 'رقم الجوال' : 'Phone number'}
                className={inputCls}
                dir="ltr"
              />
              {isLookingUp && (
                <div className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            {lookedUpCustomer && (
              <div className="flex items-center gap-2 bg-teal-50 rounded-xl px-3 py-2">
                <div className="w-2 h-2 bg-teal-500 rounded-full flex-shrink-0" />
                <span className="text-xs font-medium text-teal-700 flex-1">
                  {isRTL ? (lookedUpCustomer.name_ar || lookedUpCustomer.name) : lookedUpCustomer.name}
                </span>
                {lookedUpCustomer.tier && lookedUpCustomer.tier !== 'regular' && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-100 text-teal-600">
                    {lookedUpCustomer.tier}
                  </span>
                )}
              </div>
            )}
            {!lookedUpCustomer && (
              <>
                <input
                  type="text"
                  value={walkinName}
                  onChange={e => onWalkinNameChange(e.target.value)}
                  placeholder={isRTL ? 'اسم العميل' : 'Customer name'}
                  className={inputCls}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
                {walkinPhone.length >= 10 && walkinName.trim() && !isLookingUp && (
                  <button
                    onClick={onAddNewCustomer}
                    disabled={creatingCustomer}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl text-sm font-semibold text-teal-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {creatingCustomer ? (
                      <span className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {creatingCustomer
                      ? (isRTL ? 'جاري الإضافة...' : 'Adding...')
                      : (isRTL ? 'إضافة عميل جديد' : 'Add New Customer')
                    }
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Cart Items */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-gray-300 py-12">
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
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-teal-100 hover:bg-teal-200 transition-colors active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-teal-700" />
                    </button>
                  </div>
                  <div className={`text-right ${isRTL ? 'text-left' : ''}`}>
                    <p className="text-sm font-bold text-gray-900">{fmt(item.total)} <span className="text-xs text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</span></p>
                    <p className="text-xs text-gray-400">{fmt(item.unit_price)} x {item.quantity}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sale Details Section */}
        {items.length > 0 && (
          <div className="border-t border-gray-100">
            {/* Discount + Notes Row */}
            <div className="px-4 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleDiscount || ''}
                  onChange={e => onDiscountChange(parseFloat(e.target.value) || 0)}
                  placeholder={isRTL ? 'خصم (ر.س)' : 'Discount (SAR)'}
                  className="flex-1 py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-2" />
                <textarea
                  value={saleNotes}
                  onChange={e => onNotesChange(e.target.value)}
                  placeholder={isRTL ? 'ملاحظات' : 'Notes'}
                  rows={2}
                  className="flex-1 py-2 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  dir={isRTL ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            {/* Extra Details Toggle */}
            <div className="px-4 pb-2">
              <button
                onClick={() => setShowExtras(!showExtras)}
                className="w-full flex items-center justify-between py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span>{isRTL ? 'خيارات إضافية' : 'More Options'}</span>
                {showExtras ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showExtras && (
                <div className="space-y-3 pb-2">
                  {/* Sale Source */}
                  <div>
                    <label className={labelCls}>{isRTL ? 'مصدر البيع' : 'Sale Source'}</label>
                    <div className="flex gap-1">
                      {[
                        { value: 'store' as const, label: isRTL ? 'المحل' : 'Store' },
                        { value: 'external' as const, label: isRTL ? 'خارجي' : 'External' },
                        { value: 'salla' as const, label: 'Salla' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => onSourceChange(opt.value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                            saleSource === opt.value
                              ? 'bg-gray-800 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Salla Fields */}
                  {saleSource === 'salla' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>{isRTL ? 'شحن سلة' : 'Salla Shipping'}</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={sallaShippingCost || ''}
                          onChange={e => onSallaShippingCostChange(parseFloat(e.target.value) || 0)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{isRTL ? 'رسوم الدفع' : 'Payment Fee'}</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={sallaPaymentFee || ''}
                          onChange={e => onSallaPaymentFeeChange(parseFloat(e.target.value) || 0)}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}

                  {/* Buyer Type */}
                  <div>
                    <label className={labelCls}>{isRTL ? 'نوع العميل' : 'Buyer Type'}</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onBuyerTypeChange('individual')}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                          buyerType === 'individual'
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {isRTL ? 'فرد' : 'Individual'}
                      </button>
                      <button
                        onClick={() => onBuyerTypeChange('business')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                          buyerType === 'business'
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        {isRTL ? 'شركة' : 'Business'}
                      </button>
                    </div>
                  </div>

                  {/* Company Info */}
                  {buyerType === 'business' && (
                    <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => onCompanyNameChange(e.target.value)}
                        placeholder={isRTL ? 'اسم الشركة' : 'Company Name'}
                        className={inputCls}
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                      <input
                        type="text"
                        value={companyVatNumber}
                        onChange={e => onCompanyVatNumberChange(e.target.value)}
                        placeholder={isRTL ? 'الرقم الضريبي' : 'VAT Number'}
                        className={inputCls}
                        dir="ltr"
                      />
                      <input
                        type="text"
                        value={companyAddress}
                        onChange={e => onCompanyAddressChange(e.target.value)}
                        placeholder={isRTL ? 'عنوان الشركة' : 'Company Address'}
                        className={inputCls}
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                    </div>
                  )}

                  {/* Delivery Toggle */}
                  <div>
                    <button
                      onClick={() => onShowDeliveryChange(!showDelivery)}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                        showDelivery
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5" />
                      {isRTL ? 'توصيل' : 'Delivery'}
                    </button>
                  </div>

                  {/* Delivery Fields */}
                  {showDelivery && (
                    <div className="space-y-2 bg-gray-50 rounded-xl p-3">
                      <div>
                        <label className={labelCls}>{isRTL ? 'رسوم التوصيل' : 'Delivery Charge'}</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={deliveryCharge || ''}
                          onChange={e => onDeliveryChargeChange(parseFloat(e.target.value) || 0)}
                          className={inputCls}
                        />
                      </div>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={e => onDeliveryAddressChange(e.target.value)}
                        placeholder={isRTL ? 'عنوان التوصيل' : 'Delivery Address'}
                        className={inputCls}
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                      <input
                        type="text"
                        value={cardMessage}
                        onChange={e => onCardMessageChange(e.target.value)}
                        placeholder={isRTL ? 'رسالة البطاقة' : 'Card Message'}
                        className={inputCls}
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Section */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white">
        {/* Totals */}
        {items.length > 0 && (
          <div className="px-4 pt-3 pb-1 space-y-1.5">
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
            {deliveryCharge > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>{isRTL ? 'التوصيل' : 'Delivery'}</span>
                <span>+ {fmt(deliveryCharge)} {isRTL ? 'ر.س' : 'SAR'}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>{isRTL ? `ضريبة (${(taxRate * 100).toFixed(0)}%)` : `VAT (${(taxRate * 100).toFixed(0)}%)`}</span>
              <span>{fmt(vatAmount)} {isRTL ? 'ر.س' : 'SAR'}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>{isRTL ? 'الإجمالي' : 'Total'}</span>
              <span className="text-teal-700">{fmt(total)} {isRTL ? 'ر.س' : 'SAR'}</span>
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div className="px-4 py-3">
          <div className={`grid gap-1.5 ${showOnlinePayment ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {[
              { value: 'cash', label: isRTL ? 'نقدي' : 'Cash', color: 'bg-green-600' },
              { value: 'card', label: isRTL ? 'شبكة' : 'Card', color: 'bg-blue-600' },
              { value: 'transfer', label: isRTL ? 'تحويل' : 'Transfer', color: 'bg-sky-600' },
              { value: 'credit', label: isRTL ? 'آجل' : 'Credit', color: 'bg-amber-600' },
              ...(showOnlinePayment ? [{ value: 'online', label: isRTL ? 'إلكتروني' : 'Online', color: 'bg-cyan-600' }] : []),
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => onPaymentMethodChange(opt.value)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  paymentMethod === opt.value
                    ? `${opt.color} text-white shadow-md`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs">
            {error}
          </div>
        )}

        {/* Charge Button */}
        <div className="px-4 pb-4">
          <button
            onClick={onCharge}
            disabled={!canCharge || submitting}
            className={`w-full py-5 rounded-2xl text-xl font-bold transition-all shadow-lg active:scale-98 ${
              canCharge && !submitting
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-teal-200'
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
    </div>
  );
}
