import { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBranch } from '../../contexts/BranchContext';

interface Partner {
  id: string;
  name: string;
  name_ar: string;
}

interface ImportRow {
  date: string;
  partner: string;
  type: string;
  description: string;
  amount: number;
  _rowIndex: number;
  _isValid: boolean;
  _errors: string[];
  _partnerId?: string;
}

interface ImportModalProps {
  partners: Partner[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExcelImport({ partners, onClose, onSuccess }: ImportModalProps) {
  const { language } = useLanguage();
  const { currentBranch } = useBranch();
  const isRTL = language === 'ar';

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const validateRow = (row: any, index: number): ImportRow => {
    const errors: string[] = [];
    let partnerId: string | undefined;

    // Validate date
    const dateStr = String(row.date || '').trim();
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(isRTL ? 'تاريخ غير صحيح (YYYY-MM-DD مطلوب)' : 'Invalid date (YYYY-MM-DD required)');
    }

    // Validate partner
    const partnerName = String(row.partner || '').trim();
    if (!partnerName) {
      errors.push(isRTL ? 'اسم الشريك مطلوب' : 'Partner name required');
    } else {
      const foundPartner = partners.find(
        p => p.name.toLowerCase() === partnerName.toLowerCase() ||
             p.name_ar === partnerName
      );
      if (!foundPartner) {
        errors.push(isRTL ? `الشريك "${partnerName}" غير موجود` : `Partner "${partnerName}" not found`);
      } else {
        partnerId = foundPartner.id;
      }
    }

    // Validate type
    const type = String(row.type || '').trim();
    if (!type) {
      errors.push(isRTL ? 'النوع مطلوب' : 'Type required');
    }

    // Validate description
    const description = String(row.description || '').trim();
    if (!description) {
      errors.push(isRTL ? 'الوصف مطلوب' : 'Description required');
    }

    // Validate amount
    const amount = parseFloat(row.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(isRTL ? 'المبلغ يجب أن يكون رقم موجب' : 'Amount must be a positive number');
    }

    return {
      date: dateStr,
      partner: partnerName,
      type,
      description,
      amount: isNaN(amount) ? 0 : amount,
      _rowIndex: index + 2, // +2 for header row and 0-index
      _isValid: errors.length === 0,
      _errors: errors,
      _partnerId: partnerId
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      alert(isRTL ? 'يرجى رفع ملف Excel أو CSV فقط' : 'Please upload Excel or CSV file only');
      return;
    }

    setFile(selectedFile);

    // Read and parse file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          alert(isRTL ? 'الملف فارغ' : 'File is empty');
          return;
        }

        // Validate all rows
        const validatedRows = jsonData.map((row, index) => validateRow(row, index));

        const valid = validatedRows.filter(r => r._isValid).length;
        const invalid = validatedRows.filter(r => !r._isValid).length;
        const total = validatedRows
          .filter(r => r._isValid)
          .reduce((sum, r) => sum + r.amount, 0);

        setPreview(validatedRows);
        setValidCount(valid);
        setInvalidCount(invalid);
        setTotalAmount(total);
        setShowPreview(true);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert(isRTL ? 'خطأ في قراءة الملف' : 'Error reading file');
      }
    };

    reader.readAsBinaryString(selectedFile);
  };

  const handleImport = async () => {
    if (!currentBranch) {
      alert(isRTL ? 'يرجى اختيار فرع' : 'Please select a branch');
      return;
    }

    const validRows = preview.filter(r => r._isValid);
    if (validRows.length === 0) {
      alert(isRTL ? 'لا توجد سجلات صحيحة للاستيراد' : 'No valid records to import');
      return;
    }

    try {
      setImporting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Prepare data for insertion
      const recordsToInsert = validRows.map(row => ({
        branch_id: currentBranch.id,
        category: 'capital',
        expense_type: row.type,
        description: row.description,
        amount: row.amount,
        expense_date: row.date,
        payment_method: 'cash',
        partner_id: row._partnerId,
        created_by: user.id,
        notes: `Imported from Excel: ${file?.name}`
      }));

      // Insert all records in a transaction
      const { data, error } = await supabase
        .from('setup_expenses')
        .insert(recordsToInsert)
        .select();

      if (error) throw error;

      alert(
        isRTL
          ? `تم استيراد ${validRows.length} سجل بنجاح`
          : `Successfully imported ${validRows.length} records`
      );

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error importing:', error);
      alert(error.message || (isRTL ? 'حدث خطأ أثناء الاستيراد' : 'Error during import'));
    } finally {
      setImporting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
            <h3 className="text-xl font-bold text-gray-900">
              {isRTL ? 'استيراد من Excel' : 'Import from Excel'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!showPreview ? (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">
                  {isRTL ? 'تعليمات:' : 'Instructions:'}
                </h4>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>{isRTL ? 'ملف Excel أو CSV مطلوب' : 'Excel or CSV file required'}</li>
                  <li>{isRTL ? 'الأعمدة المطلوبة: date, partner, type, description, amount' : 'Required columns: date, partner, type, description, amount'}</li>
                  <li>{isRTL ? 'التاريخ بصيغة YYYY-MM-DD' : 'Date format: YYYY-MM-DD'}</li>
                  <li>{isRTL ? 'اسم الشريك يجب أن يكون مطابق للنظام' : 'Partner name must match system'}</li>
                  <li>{isRTL ? 'المبلغ يجب أن يكون رقم موجب' : 'Amount must be positive number'}</li>
                </ul>
              </div>

              {/* Available Partners */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">
                  {isRTL ? 'الشركاء المتاحين:' : 'Available Partners:'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {partners.map(p => (
                    <span key={p.id} className="px-3 py-1 bg-white border border-gray-300 rounded-full text-sm">
                      {isRTL ? p.name_ar || p.name : p.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                <label className="flex flex-col items-center cursor-pointer">
                  <Upload className="h-12 w-12 text-gray-400 mb-3" />
                  <span className="text-lg font-medium text-gray-700 mb-2">
                    {isRTL ? 'انقر لرفع الملف' : 'Click to upload file'}
                  </span>
                  <span className="text-sm text-gray-500">
                    {isRTL ? 'Excel (.xlsx, .xls) أو CSV' : 'Excel (.xlsx, .xls) or CSV'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {file && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-gray-600">
                      {isRTL ? 'الملف المحدد:' : 'Selected file:'} <strong>{file.name}</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">
                      {isRTL ? 'صحيح' : 'Valid'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">{validCount}</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-900">
                      {isRTL ? 'خطأ' : 'Invalid'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">{invalidCount}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      {isRTL ? 'إجمالي المبلغ' : 'Total Amount'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalAmount)}</p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'السطر' : 'Row'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'التاريخ' : 'Date'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'الشريك' : 'Partner'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'النوع' : 'Type'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'الوصف' : 'Description'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'المبلغ' : 'Amount'}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          {isRTL ? 'الحالة' : 'Status'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.map((row) => (
                        <tr key={row._rowIndex} className={row._isValid ? '' : 'bg-red-50'}>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {row._rowIndex}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.date}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.partner}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.type}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {row.description}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {row._isValid ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle className="h-4 w-4" />
                                {isRTL ? 'صحيح' : 'Valid'}
                              </span>
                            ) : (
                              <div>
                                <span className="text-red-600 flex items-center gap-1 mb-1">
                                  <AlertCircle className="h-4 w-4" />
                                  {isRTL ? 'خطأ' : 'Invalid'}
                                </span>
                                {row._errors.map((err, idx) => (
                                  <p key={idx} className="text-xs text-red-600">{err}</p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          {showPreview && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowPreview(false);
                  setFile(null);
                  setPreview([]);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                {isRTL ? 'رفع ملف آخر' : 'Upload Another'}
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    {isRTL ? 'جاري الاستيراد...' : 'Importing...'}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {isRTL ? `استيراد ${validCount} سجل` : `Import ${validCount} records`}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
