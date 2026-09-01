import { useI18n } from "@/i18n/I18nContext";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="flex items-center border border-border rounded-full overflow-hidden text-[11px] font-mono uppercase"
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className={`px-2.5 py-1 ${language === "en" ? "bg-navy text-white" : "text-steel hover:text-navy"}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("ar")}
        aria-pressed={language === "ar"}
        className={`px-2.5 py-1 border-s border-border ${language === "ar" ? "bg-navy text-white" : "text-steel hover:text-navy"}`}
      >
        عربي
      </button>
    </div>
  );
}
