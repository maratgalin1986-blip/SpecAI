// Без зависимостей: импортируется и сервером, и браузером (форма заявки, siteLeadText.ts).

/** Название в «ёлочках», если компания сама не написала его в кавычках («Стоматология «Улыбка»» → без дубля). */
export function quotedName(name: string): string {
  const clean = name.trim();
  return /[«»"“”]/.test(clean) ? clean : `«${clean}»`;
}
