// Кандидаты, добавленные владельцем вручную (R7):
// строки «Название; телефон; адрес или город; почта; whatsapp» (почта и WhatsApp — необязательны).

import { candidateEmail, candidatePhone } from './phone';
import type { Candidate } from './types';

export interface ManualParseResult {
  candidates: Candidate[];
  errors: string[];
}

const SEPARATOR = /[;|\t]/;

// Город кандидата определяет создание (`lib/office/run.ts`, по адресу); координаты
// центра города сюда не кладутся — это не адрес компании, карта пойдёт по адресу.
export function parseManualLines(text: string): ManualParseResult {
  const candidates: Candidate[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const lineNo = index + 1;
    const [namePart = '', phonePart = '', addressPart = '', emailPart = '', whatsappPart = ''] =
      line.split(SEPARATOR).map((p) => p.trim());
    const name = namePart;
    if (!name) {
      errors.push(`Строка ${lineNo}: нет названия`);
      return;
    }
    const phone = candidatePhone(phonePart);
    if (!phone) {
      errors.push(`Строка ${lineNo}: нет телефона`);
      return;
    }
    if (seen.has(phone)) {
      errors.push(`Строка ${lineNo}: телефон ${phone} уже есть выше`);
      return;
    }
    seen.add(phone);
    const email = emailPart ? candidateEmail(emailPart) : null;
    if (emailPart && !email) {
      errors.push(`Строка ${lineNo}: непонятная почта «${emailPart}»`);
      return;
    }
    const whatsapp = whatsappPart ? candidatePhone(whatsappPart) : null;
    if (whatsappPart && !whatsapp) {
      errors.push(`Строка ${lineNo}: непонятный WhatsApp «${whatsappPart}»`);
      return;
    }
    const addressText = addressPart;
    candidates.push({
      name,
      phone,
      address: addressText || null,
      lat: null,
      lon: null,
      hours: null,
      website: null,
      email,
      whatsapp,
      telegram: null,
      tags: [],
      sourceRef: `manual:${phone}`,
    });
  });

  return { candidates, errors };
}
