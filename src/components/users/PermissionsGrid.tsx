import { useLanguage } from '../../contexts/LanguageContext';
import { Check, X, Eye, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { SECTIONS, SECTION_LABELS, ROLE_TEMPLATES, emptyPermissions, fullPermissions, viewOnlyPermissions } from '../../lib/permissions';
import type { PermissionsMap, Section, Action } from '../../lib/permissions';

interface PermissionsGridProps {
  permissions: PermissionsMap;
  onChange: (permissions: PermissionsMap) => void;
  readOnly?: boolean;
}

const ACTION_LABELS: Record<Action, { ar: string; en: string }> = {
  view: { ar: 'عرض', en: 'View' },
  create: { ar: 'إنشاء', en: 'Create' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
};

const ACTION_ICONS: Record<Action, typeof Eye> = {
  view: Eye,
  create: Plus,
  edit: Pencil,
  delete: Trash2,
};

const ACTIONS: Action[] = ['view', 'create', 'edit', 'delete'];

export function PermissionsGrid({ permissions, onChange, readOnly }: PermissionsGridProps) {
  const { isRTL } = useLanguage();

  const toggleAction = (section: Section, action: Action) => {
    if (readOnly) return;
    const updated = { ...permissions };
    updated[section] = { ...updated[section], [action]: !updated[section][action] };
    if (action !== 'view' && updated[section][action]) {
      updated[section].view = true;
    }
    if (action === 'view' && !updated[section].view) {
      updated[section] = { view: false, create: false, edit: false, delete: false };
    }
    onChange(updated);
  };

  const toggleSectionAll = (section: Section) => {
    if (readOnly) return;
    const sp = permissions[section];
    const allOn = sp.view && sp.create && sp.edit && sp.delete;
    const updated = { ...permissions };
    if (allOn) {
      updated[section] = { view: false, create: false, edit: false, delete: false };
    } else {
      updated[section] = { view: true, create: true, edit: true, delete: true };
    }
    onChange(updated);
  };

  const toggleColumnAll = (action: Action) => {
    if (readOnly) return;
    const allOn = SECTIONS.every(s => permissions[s][action]);
    const updated = { ...permissions };
    SECTIONS.forEach(s => {
      updated[s] = { ...updated[s], [action]: !allOn };
      if (action !== 'view' && !allOn) {
        updated[s].view = true;
      }
      if (action === 'view' && allOn) {
        updated[s] = { view: false, create: false, edit: false, delete: false };
      }
    });
    onChange(updated);
  };

  const applyTemplate = (templateName: string) => {
    if (readOnly) return;
    const template = ROLE_TEMPLATES[templateName];
    if (template) {
      onChange({ ...template });
    }
  };

  const selectAll = () => onChange(fullPermissions());
  const deselectAll = () => onChange(emptyPermissions());
  const viewAll = () => onChange(viewOnlyPermissions());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-gray-700">
          {isRTL ? 'قالب سريع:' : 'Quick Template:'}
        </span>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'admin', label: isRTL ? 'مدير (كامل)' : 'Admin (Full)', fn: selectAll },
            { key: 'accountant', label: isRTL ? 'محاسب' : 'Accountant', fn: () => applyTemplate('accountant') },
            { key: 'observer', label: isRTL ? 'مطلع (عرض فقط)' : 'Observer (View Only)', fn: viewAll },
            { key: 'viewer', label: isRTL ? 'محدود' : 'Limited', fn: () => applyTemplate('viewer') },
            { key: 'none', label: isRTL ? 'بدون صلاحيات' : 'No Access', fn: deselectAll },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={t.fn}
              disabled={readOnly}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                  {isRTL ? 'القسم' : 'Section'}
                </th>
                {ACTIONS.map(action => {
                  const Icon = ACTION_ICONS[action];
                  const allOn = SECTIONS.every(s => permissions[s][action]);
                  return (
                    <th key={action} className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleColumnAll(action)}
                        disabled={readOnly}
                        className="flex flex-col items-center gap-1 mx-auto group disabled:cursor-not-allowed"
                      >
                        <Icon className={`w-3.5 h-3.5 ${allOn ? 'text-teal-600' : 'text-gray-400'} group-hover:text-teal-500 transition`} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          {isRTL ? ACTION_LABELS[action].ar : ACTION_LABELS[action].en}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {isRTL ? 'الكل' : 'All'}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SECTIONS.map((section, i) => {
                const sp = permissions[section];
                const allOn = sp.view && sp.create && sp.edit && sp.delete;
                const someOn = sp.view || sp.create || sp.edit || sp.delete;
                return (
                  <tr
                    key={section}
                    className={`transition ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-teal-50/30`}
                  >
                    <td className={`px-4 py-2.5 ${isRTL ? 'text-right' : 'text-left'}`}>
                      <span className={`text-sm font-medium ${someOn ? 'text-gray-900' : 'text-gray-400'}`}>
                        {isRTL ? SECTION_LABELS[section].ar : SECTION_LABELS[section].en}
                      </span>
                    </td>
                    {ACTIONS.map(action => (
                      <td key={action} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleAction(section, action)}
                          disabled={readOnly}
                          className="mx-auto disabled:cursor-not-allowed"
                        >
                          {sp[action] ? (
                            <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center hover:bg-teal-200 transition">
                              <Check className="w-4 h-4 text-teal-700" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
                              <X className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                          )}
                        </button>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSectionAll(section)}
                        disabled={readOnly}
                        className="mx-auto disabled:cursor-not-allowed"
                      >
                        {allOn ? (
                          <ToggleRight className="w-6 h-6 text-teal-600 hover:text-teal-700 transition" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-gray-400 hover:text-gray-500 transition" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
