const locale = 'uk-UA';
const options: Intl.DateTimeFormatOptions = {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export const getCurrentDate = () => {
  return new Date().toLocaleDateString(locale, options);
};

export const getDateFromNow = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString(locale, options);
};