'use client';

import { useEffect, useState } from 'react';
import {
  LEGAL_FORMS,
  REGIMES_FOR,
  TAX_REGIMES,
  VERIFICATION_STATUS_TEXT,
  legalFormLabel,
  taxRegimeLabel,
  type LegalForm,
  type VerificationStatus,
} from '@/lib/providerVerification';
import { isValidInn, cleanInn, innLengthFor } from '@/lib/inn';

interface Loaded {
  company: {
    legalForm: string | null;
    legalName: string | null;
    taxId: string | null;
    kpp: string | null;
    ogrn: string | null;
    taxRegime: string | null;
    bankName: string | null;
    bankBik: string | null;
    bankAccountMasked: string | null;
    verificationRejectedReason: string | null;
  };
  status: VerificationStatus;
  offerFullRegistration: boolean;
  sts: { number: string | null; fileUrl: string | null } | null;
}

const STATUS_CLASS: Record<VerificationStatus, string> = {
  provisional: 'border-amber-300 bg-amber-50 text-amber-900',
  unverified: 'border-graphite-200 bg-graphite-50 text-graphite-800',
  pending: 'border-sky-200 bg-sky-50 text-sky-900',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  verified: 'border-green-200 bg-green-50 text-green-900',
};

const input = 'rounded-md border border-slate-300 px-3 py-2';

/**
 * «Документы и проверка» в кабинете исполнителя: статус, налоговый режим и
 * форма «Завершите регистрацию» (форма, ИНН, название, режим, СТС с фото,
 * банк по желанию). Фото СТС уходит закрытым файлом компании.
 */
export function VerificationPanel({ machines }: { machines: { id: string; name: string }[] }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [legalForm, setLegalForm] = useState<LegalForm>('IP');
  const [legalName, setLegalName] = useState('');
  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [ogrn, setOgrn] = useState('');
  const [taxRegime, setTaxRegime] = useState('');
  const [stsNumber, setStsNumber] = useState('');
  const [stsEquipmentId, setStsEquipmentId] = useState(machines[0]?.id ?? '');
  const [stsFileKey, setStsFileKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankBik, setBankBik] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch('/api/account/verification').catch(() => null);
    if (!response?.ok) {
      setLoadError(true);
      return;
    }
    const body = (await response.json()) as Loaded;
    setData(body);
    const c = body.company;
    if (c.legalForm && LEGAL_FORMS.some((f) => f.id === c.legalForm)) {
      setLegalForm(c.legalForm as LegalForm);
    }
    setLegalName(c.legalName ?? '');
    setInn(c.taxId ?? '');
    setKpp(c.kpp ?? '');
    setOgrn(c.ogrn ?? '');
    setTaxRegime(c.taxRegime ?? '');
    setBankName(c.bankName ?? '');
    setBankBik(c.bankBik ?? '');
    if (body.offerFullRegistration && body.status !== 'pending') setOpen(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/account/verification/file', {
      method: 'POST',
      body: form,
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      key?: string;
      error?: string;
    } | null;
    setUploading(false);
    if (!response?.ok || !body?.key) {
      setError(body?.error ?? 'Не удалось загрузить фото');
      return;
    }
    setStsFileKey(body.key);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const digits = cleanInn(inn);
    if (digits.length !== innLengthFor(legalForm) || !isValidInn(digits)) {
      setError(`ИНН с ошибкой: нужно ${innLengthFor(legalForm)} цифр с верной контрольной суммой`);
      return;
    }
    if (!stsFileKey) {
      setError('Загрузите фото СТС');
      return;
    }
    setSaving(true);
    const response = await fetch('/api/account/verification', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalForm,
        legalName,
        inn,
        kpp: legalForm === 'LEGAL' ? kpp : '',
        ogrn,
        taxRegime: REGIMES_FOR[legalForm].length > 0 ? taxRegime || null : null,
        stsNumber,
        stsFileKey,
        stsEquipmentId: stsEquipmentId || null,
        bankName,
        bankBik,
        bankAccount,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);
    if (!response?.ok) {
      setError(body?.error ?? 'Нет связи, попробуйте ещё раз');
      return;
    }
    setOpen(false);
    await load();
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-700">Не удалось загрузить реквизиты. Обновите страницу.</p>
    );
  }
  if (!data) return <p className="text-sm text-graphite-500">Загружаем…</p>;

  const regimes = TAX_REGIMES.filter((r) => REGIMES_FOR[legalForm].includes(r.id));
  const canEdit = data.status !== 'pending' && data.status !== 'verified';

  return (
    <div className="flex flex-col gap-3">
      <p className={`rounded-xl border px-4 py-3 text-sm ${STATUS_CLASS[data.status]}`}>
        <strong>{VERIFICATION_STATUS_TEXT[data.status]}</strong>
        {data.status === 'provisional' &&
          '. Заказчики видят пометку «Новый исполнитель, данные не проверены». После первого заказа заполните реквизиты — после проверки появится «Проверен».'}
        {data.status === 'pending' && '. Обычно проверяем в течение рабочего дня.'}
        {data.status === 'rejected' && data.company.verificationRejectedReason && (
          <>. Причина: {data.company.verificationRejectedReason}</>
        )}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <dt className="text-graphite-500">Форма</dt>
        <dd>{legalFormLabel(data.company.legalForm) ?? '—'}</dd>
        <dt className="text-graphite-500">Название / ФИО</dt>
        <dd className="break-words">{data.company.legalName ?? '—'}</dd>
        <dt className="text-graphite-500">ИНН</dt>
        <dd className="font-mono">{data.company.taxId ?? '—'}</dd>
        <dt className="text-graphite-500">Налоговый режим</dt>
        <dd>{taxRegimeLabel(data.company.taxRegime) ?? '—'}</dd>
        <dt className="text-graphite-500">СТС</dt>
        <dd>
          {data.sts?.number ?? '—'}
          {data.sts?.fileUrl && (
            <>
              {' · '}
              <a href={data.sts.fileUrl} className="text-signal-700 underline" target="_blank">
                фото
              </a>
            </>
          )}
        </dd>
        <dt className="text-graphite-500">Банк</dt>
        <dd>
          {data.company.bankName ?? '—'}
          {data.company.bankAccountMasked ? ` · счёт ${data.company.bankAccountMasked}` : ''}
        </dd>
      </dl>
      {canEdit && !open && (
        <button type="button" className="cab-action w-fit" onClick={() => setOpen(true)}>
          {data.status === 'rejected' ? 'Исправить и отправить' : 'Заполнить реквизиты'}
        </button>
      )}
      {canEdit && open && (
        <form onSubmit={submit} className="cab-card flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1">Кто вы</legend>
            <div className="flex flex-wrap gap-2">
              {LEGAL_FORMS.map((form) => (
                <label
                  key={form.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${
                    legalForm === form.id ? 'border-amber-600 bg-amber-50' : 'border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="legalForm"
                    checked={legalForm === form.id}
                    onChange={() => {
                      setLegalForm(form.id);
                      setTaxRegime(form.id === 'SELF' ? 'NPD' : '');
                    }}
                  />
                  {form.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            {legalForm === 'LEGAL' ? 'Название организации' : 'ФИО полностью'}
            <input
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              maxLength={200}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ИНН ({innLengthFor(legalForm)} цифр)
            <input
              required
              inputMode="numeric"
              value={inn}
              onChange={(e) => setInn(e.target.value)}
              maxLength={16}
              className={`${input} font-mono`}
            />
            {cleanInn(inn).length === innLengthFor(legalForm) && !isValidInn(inn) && (
              <span className="text-xs text-red-700">
                Контрольная сумма не сходится — проверьте цифры
              </span>
            )}
          </label>
          {legalForm === 'LEGAL' && (
            <label className="flex flex-col gap-1 text-sm">
              КПП <span className="text-slate-400">(необязательно)</span>
              <input
                inputMode="numeric"
                value={kpp}
                onChange={(e) => setKpp(e.target.value)}
                maxLength={12}
                className={`${input} font-mono`}
              />
            </label>
          )}
          {(legalForm === 'LEGAL' || legalForm === 'IP') && (
            <label className="flex flex-col gap-1 text-sm">
              {legalForm === 'LEGAL' ? 'ОГРН' : 'ОГРНИП'}{' '}
              <span className="text-slate-400">(необязательно)</span>
              <input
                inputMode="numeric"
                value={ogrn}
                onChange={(e) => setOgrn(e.target.value)}
                maxLength={20}
                className={`${input} font-mono`}
              />
            </label>
          )}
          {regimes.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              Налоговый режим
              <select
                required
                value={taxRegime}
                onChange={(e) => setTaxRegime(e.target.value)}
                className={input}
              >
                <option value="">Выберите режим</option>
                {regimes.map((regime) => (
                  <option key={regime.id} value={regime.id}>
                    {regime.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1">СТС (свидетельство о регистрации машины)</legend>
            {machines.length > 1 && (
              <select
                value={stsEquipmentId}
                onChange={(e) => setStsEquipmentId(e.target.value)}
                className={input}
                aria-label="Машина"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            )}
            <input
              required
              value={stsNumber}
              onChange={(e) => setStsNumber(e.target.value)}
              maxLength={20}
              placeholder="Номер СТС, например 16 49 123456"
              aria-label="Номер СТС"
              className={input}
            />
            <label className="flex flex-col gap-1">
              <span>Фото или скан СТС — видят только вы и проверяющий</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              {uploading && <span className="text-xs text-graphite-500">Загружаем…</span>}
              {stsFileKey && !uploading && (
                <span className="text-xs text-green-700">Фото загружено</span>
              )}
            </label>
          </fieldset>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              Банковские реквизиты (необязательно)
            </summary>
            <div className="flex flex-col gap-2">
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                maxLength={120}
                placeholder="Банк"
                aria-label="Банк"
                className={input}
              />
              <input
                inputMode="numeric"
                value={bankBik}
                onChange={(e) => setBankBik(e.target.value)}
                maxLength={12}
                placeholder="БИК, 9 цифр"
                aria-label="БИК"
                className={`${input} font-mono`}
              />
              <input
                inputMode="numeric"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                maxLength={26}
                placeholder="Расчётный счёт, 20 цифр"
                aria-label="Расчётный счёт"
                className={`${input} font-mono`}
              />
            </div>
          </details>
          <p className="text-xs text-slate-500">
            Данные нужны для проверки и закрывающих документов, обрабатываются по{' '}
            <a href="/soglasie" className="underline" target="_blank">
              согласию на обработку персональных данных
            </a>
            . Заказчикам не показываются.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={saving || uploading} className="cab-action w-fit">
            {saving ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
        </form>
      )}
    </div>
  );
}
