import { useState } from 'react';
import { Search, Package } from 'lucide-react';
import type { POSProduct } from './types';

interface POSProductGridProps {
  products: POSProduct[];
  isRTL: boolean;
  onAddProduct: (product: POSProduct) => void;
}

const CATEGORY_LABELS: Record<string, { en: string; ar: string; color: string }> = {
  all:              { en: 'All',            ar: 'الكل',          color: 'bg-gray-800 text-white' },
  natural_flowers:  { en: 'Natural',        ar: 'طبيعي',         color: 'bg-green-600 text-white' },
  artificial_flowers:{ en: 'Artificial',   ar: 'اصطناعي',       color: 'bg-blue-600 text-white' },
  preserved:        { en: 'Preserved',      ar: 'محفوظ',         color: 'bg-amber-600 text-white' },
  vases:            { en: 'Vases',          ar: 'مزهريات',       color: 'bg-teal-600 text-white' },
  wrapping:         { en: 'Wrapping',       ar: 'تغليف',         color: 'bg-pink-600 text-white' },
  ribbons:          { en: 'Ribbons',        ar: 'شرائط',         color: 'bg-rose-600 text-white' },
  additions_gifts:  { en: 'Gifts',          ar: 'هدايا',         color: 'bg-violet-600 text-white' },
  services:         { en: 'Services',       ar: 'خدمات',         color: 'bg-slate-600 text-white' },
};

function getProductColor(type: string): string {
  const colors: Record<string, string> = {
    natural_flowers:   'from-green-50 to-green-100 border-green-200',
    artificial_flowers:'from-blue-50 to-blue-100 border-blue-200',
    preserved:         'from-amber-50 to-amber-100 border-amber-200',
    vases:             'from-teal-50 to-teal-100 border-teal-200',
    wrapping:          'from-pink-50 to-pink-100 border-pink-200',
    ribbons:           'from-rose-50 to-rose-100 border-rose-200',
    additions_gifts:   'from-violet-50 to-violet-100 border-violet-200',
    services:          'from-slate-50 to-slate-100 border-slate-200',
  };
  return colors[type] || 'from-gray-50 to-gray-100 border-gray-200';
}

function getProductDot(type: string): string {
  const dots: Record<string, string> = {
    natural_flowers:    'bg-green-500',
    artificial_flowers: 'bg-blue-500',
    preserved:          'bg-amber-500',
    vases:              'bg-teal-500',
    wrapping:           'bg-pink-500',
    ribbons:            'bg-rose-500',
    additions_gifts:    'bg-violet-500',
    services:           'bg-slate-500',
  };
  return dots[type] || 'bg-gray-400';
}

export function POSProductGrid({ products, isRTL, onAddProduct }: POSProductGridProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const categories = ['all', ...Array.from(new Set(products.map(p => p.type).filter(Boolean)))];

  const filtered = products.filter(p => {
    const matchesSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.name_ar.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || p.type === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Search & Categories */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-3 flex-shrink-0">
        <div className="relative">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isRTL ? 'ابحث عن منتج...' : 'Search products...'}
            className={`w-full py-3 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ${isRTL ? 'pr-11 pl-4 text-right' : 'pl-11 pr-4'}`}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        <div className={`flex gap-2 overflow-x-auto pb-1 scrollbar-hide ${isRTL ? 'flex-row-reverse' : ''}`}>
          {categories.map(cat => {
            const label = CATEGORY_LABELS[cat];
            const isActive = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? (label?.color || 'bg-gray-800 text-white') + ' shadow-md scale-105'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isRTL ? (label?.ar || cat) : (label?.en || cat)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Package className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">{isRTL ? 'لا توجد منتجات' : 'No products found'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(product => (
              <button
                key={product.id}
                onClick={() => onAddProduct(product)}
                className={`relative bg-gradient-to-br ${getProductColor(product.type)} border-2 rounded-2xl p-3 text-left active:scale-95 transition-all duration-150 hover:shadow-lg hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400 group`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${getProductDot(product.type)}`} />
                  <span className="text-xs text-gray-400 font-mono truncate max-w-[60px]">{product.sku}</span>
                </div>

                <div className="min-h-[2.5rem] mb-3">
                  <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2" dir={isRTL ? 'rtl' : 'ltr'}>
                    {isRTL ? product.name_ar : product.name}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-violet-700">
                    {product.sale_price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-gray-500">{isRTL ? 'ر.س' : 'SAR'}</span>
                </div>

                <div className="absolute inset-0 rounded-2xl bg-violet-600 opacity-0 group-active:opacity-10 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
