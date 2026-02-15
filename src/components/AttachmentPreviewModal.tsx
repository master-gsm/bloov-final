import React from 'react';
import { X, Download, Printer } from 'lucide-react';
import { downloadFile } from '../lib/fileUpload';

interface AttachmentPreviewModalProps {
  isOpen: boolean;
  attachment: { url: string; type: string; name?: string; filePath?: string } | null;
  onClose: () => void;
  isRTL: boolean;
}

export function AttachmentPreviewModal({
  isOpen,
  attachment,
  onClose,
  isRTL,
}: AttachmentPreviewModalProps) {
  if (!isOpen || !attachment) return null;

  const handleDownload = async () => {
    if (!attachment.filePath) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const blob = await downloadFile(attachment.filePath);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open(attachment.url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {isRTL ? 'معاينة المرفق' : 'Attachment Preview'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
          {attachment.type === 'image' ? (
            <img
              src={attachment.url}
              alt="Attachment"
              className="max-w-full max-h-full object-contain"
            />
          ) : attachment.type === 'pdf' ? (
            <iframe
              src={attachment.url}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="text-center text-gray-500">
              <p>{isRTL ? 'نوع الملف غير مدعوم للمعاينة' : 'Preview not available for this file type'}</p>
            </div>
          )}
        </div>

        {/* Footer - Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            {isRTL ? 'تحميل' : 'Download'}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
          >
            <Printer className="w-4 h-4" />
            {isRTL ? 'طباعة' : 'Print'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition font-medium text-sm"
          >
            {isRTL ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
