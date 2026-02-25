import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
  loading = false,
}: PaginationProps) {
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const goToFirstPage = () => onPageChange(1);
  const goToLastPage = () => onPageChange(totalPages);
  const goToNextPage = () => onPageChange(Math.min(currentPage + 1, totalPages));
  const goToPrevPage = () => onPageChange(Math.max(currentPage - 1, 1));

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Items info */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          {isRTL
            ? `عرض ${startItem.toLocaleString('ar-SA')} - ${endItem.toLocaleString('ar-SA')} من ${totalItems.toLocaleString('ar-SA')}`
            : `Showing ${startItem.toLocaleString()} - ${endItem.toLocaleString()} of ${totalItems.toLocaleString()}`}
        </span>

        {/* Page size selector */}
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-gray-700">
              {isRTL ? 'عدد الصفوف:' : 'Rows:'}
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={loading}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-2">
        {/* First page */}
        <button
          type="button"
          onClick={goToFirstPage}
          disabled={currentPage === 1 || loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={isRTL ? 'الصفحة الأولى' : 'First page'}
        >
          {isRTL ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
        </button>

        {/* Previous page */}
        <button
          type="button"
          onClick={goToPrevPage}
          disabled={currentPage === 1 || loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={isRTL ? 'الصفحة السابقة' : 'Previous page'}
        >
          {isRTL ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        {/* Page indicator */}
        <span className="px-4 py-2 text-sm text-gray-700 bg-gray-50 rounded-md min-w-[120px] text-center">
          {isRTL
            ? `صفحة ${currentPage.toLocaleString('ar-SA')} من ${totalPages.toLocaleString('ar-SA')}`
            : `Page ${currentPage.toLocaleString()} of ${totalPages.toLocaleString()}`}
        </span>

        {/* Next page */}
        <button
          type="button"
          onClick={goToNextPage}
          disabled={currentPage === totalPages || loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={isRTL ? 'الصفحة التالية' : 'Next page'}
        >
          {isRTL ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>

        {/* Last page */}
        <button
          type="button"
          onClick={goToLastPage}
          disabled={currentPage === totalPages || loading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={isRTL ? 'الصفحة الأخيرة' : 'Last page'}
        >
          {isRTL ? <ChevronsLeft className="w-5 h-5" /> : <ChevronsRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
