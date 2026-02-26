import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Theme } from '../lib/themes';
import { Check, Sun, Moon, Briefcase, Sparkles, Crown } from 'lucide-react';

const categoryConfig: Record<Theme['category'], { icon: typeof Sun; label: string; labelAr: string }> = {
  light: { icon: Sun, label: 'Light Themes', labelAr: 'ثيمات فاتحة' },
  dark: { icon: Moon, label: 'Dark Themes', labelAr: 'ثيمات داكنة' },
  professional: { icon: Briefcase, label: 'Professional', labelAr: 'احترافية' },
  modern: { icon: Sparkles, label: 'Modern', labelAr: 'عصرية' },
  elegant: { icon: Crown, label: 'Elegant', labelAr: 'انيقة' },
};

function ThemeCard({ theme, isSelected, onSelect }: { theme: Theme; isSelected: boolean; onSelect: () => void }) {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const { colors } = theme;

  return (
    <button
      onClick={onSelect}
      className={`relative w-full rounded-xl overflow-hidden transition-all duration-200 ${
        isSelected
          ? 'ring-2 ring-offset-2 ring-[var(--theme-primary)] scale-[1.02]'
          : 'hover:scale-[1.01] hover:shadow-lg'
      }`}
      style={{ backgroundColor: colors.surface }}
    >
      <div className="p-3">
        <div
          className="w-full h-24 rounded-lg mb-3 relative overflow-hidden"
          style={{ backgroundColor: colors.background }}
        >
          <div
            className="absolute top-2 left-2 right-2 h-6 rounded"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}
          />
          <div className="absolute bottom-2 left-2 flex gap-1">
            <div className="w-8 h-8 rounded" style={{ backgroundColor: colors.primary }} />
            <div className="w-8 h-8 rounded" style={{ backgroundColor: colors.surfaceHover }} />
            <div className="w-8 h-8 rounded" style={{ backgroundColor: colors.accent }} />
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.success }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.warning }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.error }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-start">
            <p className="text-sm font-semibold" style={{ color: colors.text }}>
              {isRTL ? theme.nameAr : theme.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
              {isRTL ? theme.name : theme.nameAr}
            </p>
          </div>
          {isSelected && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colors.primary }}
            >
              <Check className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      </div>

      <div className="h-1 flex">
        <div className="flex-1" style={{ backgroundColor: colors.primary }} />
        <div className="flex-1" style={{ backgroundColor: colors.accent }} />
        <div className="flex-1" style={{ backgroundColor: colors.success }} />
        <div className="flex-1" style={{ backgroundColor: colors.warning }} />
        <div className="flex-1" style={{ backgroundColor: colors.error }} />
      </div>
    </button>
  );
}

export function ThemeSettings() {
  const { language } = useLanguage();
  const { currentTheme, setTheme, themes } = useTheme();
  const isRTL = language === 'ar';

  const groupedThemes = themes.reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push(theme);
    return acc;
  }, {} as Record<Theme['category'], Theme[]>);

  const categories: Theme['category'][] = ['light', 'dark', 'professional', 'modern', 'elegant'];

  return (
    <div className="space-y-8">
      <div
        className="p-4 rounded-xl"
        style={{
          backgroundColor: 'var(--theme-primary-light)',
          borderColor: 'var(--theme-primary)',
          borderWidth: 1,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            {(() => {
              const CurrentIcon = categoryConfig[currentTheme.category].icon;
              return CurrentIcon ? <CurrentIcon className="w-6 h-6 text-white" /> : null;
            })()}
          </div>
          <div>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              {isRTL ? 'الثيم الحالي' : 'Current Theme'}
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>
              {isRTL ? currentTheme.nameAr : currentTheme.name}
            </p>
          </div>
        </div>
      </div>

      {categories.map(category => {
        const config = categoryConfig[category];
        const Icon = config.icon;
        const categoryThemes = groupedThemes[category] || [];

        if (categoryThemes.length === 0) return null;

        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--theme-surface-hover)' }}
              >
                <Icon className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--theme-text)' }}>
                {isRTL ? config.labelAr : config.label}
              </h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--theme-surface-hover)',
                  color: 'var(--theme-text-muted)',
                }}
              >
                {categoryThemes.length}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {categoryThemes.map(theme => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isSelected={currentTheme.id === theme.id}
                  onSelect={() => setTheme(theme.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
