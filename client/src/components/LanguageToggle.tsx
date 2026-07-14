import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  className?: string;
  labelMode?: "compact" | "full";
}

const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; shortKey: string; labelKey: string }> = [
  { value: "en", shortKey: "language.enShort", labelKey: "language.english" },
  { value: "es", shortKey: "language.esShort", labelKey: "language.spanish" },
];

export function LanguageToggle({ className, labelMode = "compact" }: LanguageToggleProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center rounded-full border border-white/20 bg-white/10 p-0.5 text-xs font-semibold text-white shadow-sm backdrop-blur",
        className,
      )}
      aria-label={t("language.toggle")}
      data-testid="toggle-language"
    >
      {LANGUAGE_OPTIONS.map((option, index) => {
        const active = language === option.value;
        const label = labelMode === "full"
          ? (option.value === "en" ? "English" : "Español")
          : (option.value === "es" ? t(option.labelKey) : t(option.shortKey));

        return (
          <div key={option.value} className="flex items-center">
            {index > 0 && <span className="px-1 text-white/45">|</span>}
            <button
              type="button"
              className={cn(
                "min-w-9 rounded-full px-2.5 py-1 transition-colors",
                active ? "bg-white text-slate-900" : "text-white/80 hover:bg-white/15 hover:text-white",
              )}
              aria-pressed={active}
              aria-label={t(option.labelKey)}
              title={t(option.labelKey)}
              onClick={() => setLanguage(option.value)}
              data-testid={`button-language-${option.value}`}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
