import { useTranslation } from 'react-i18n';

export function TranslatedButton() {
  const { t } = useTranslation();
  return <button>{t('button.submit')}</button>;
}
