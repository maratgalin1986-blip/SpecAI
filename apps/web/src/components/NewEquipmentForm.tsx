'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';
import { suggestShiftRate } from '@/lib/shiftRate';
import {
  EQUIPMENT_STATUS_OPTIONS,
  parsePrice,
  rowsFromSpecs,
  specsFromRows,
  type EquipmentStatusValue,
  type SpecRow,
} from '@/lib/equipmentEdit';

interface Category {
  id: string;
  name: string;
}

interface UploadedFile {
  url: string;
  contentType: string;
  size: number;
  name: string;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // PDF
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Anthropic не принимает изображения больше 5 МБ

function isImage(file: UploadedFile) {
  return file.contentType.startsWith('image/');
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** A listing being edited (PATCH /api/equipment/[id]); without it the form adds a new one. */
export interface EditableEquipment {
  id: string;
  name: string;
  categoryId: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: EquipmentStatusValue;
  dailyRate: string;
  hourlyRate: string | null;
  description: string | null;
  specs: unknown;
  imageUrls: string[];
}

export function NewEquipmentForm() {
  return <EquipmentForm />;
}

export function EquipmentForm({
  initial,
  onDone,
}: {
  initial?: EditableEquipment;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '');
  const [status, setStatus] = useState<EquipmentStatusValue>(initial?.status ?? 'AVAILABLE');
  const [dailyRate, setDailyRate] = useState(initial ? String(Number(initial.dailyRate)) : '');
  const [hourlyRate, setHourlyRate] = useState(
    initial?.hourlyRate ? String(Number(initial.hourlyRate)) : '',
  );
  // True once the user typed a shift price themselves; stops the hourly × 8 suggestion.
  const [dailyTouched, setDailyTouched] = useState(editing);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [specSheetText, setSpecSheetText] = useState('');
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => rowsFromSpecs(initial?.specs));
  const [files, setFiles] = useState<UploadedFile[]>(() =>
    (initial?.imageUrls ?? []).map((url, index) => ({
      url,
      contentType: 'image/jpeg',
      size: 0,
      name: `Фото ${index + 1}`,
    })),
  );
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  function applyExtracted(data: {
    make?: string;
    model?: string;
    year?: number;
    specs?: Record<string, unknown>;
  }) {
    const extracted = rowsFromSpecs(data.specs);
    if (extracted.length > 0) {
      // Keep what the user typed by hand; replace values of the same parameter.
      setSpecRows((prev) => [
        ...prev.filter(
          (row) => row.key.trim() && !extracted.some((item) => item.key === row.key.trim()),
        ),
        ...extracted,
      ]);
    }
    if (data.make && !make.trim()) setMake(data.make);
    if (data.model && !model.trim()) setModel(data.model);
    if (data.year && !year.trim()) setYear(String(data.year));
    if (!name.trim() && (data.make || data.model)) {
      setName([data.make, data.model].filter(Boolean).join(' '));
    }
  }

  function updateSpecRow(index: number, patch: Partial<SpecRow>) {
    setSpecRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function requestExtraction(body: Record<string, string>) {
    try {
      const response = await fetch('/api/ai/extract-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === 'string' ? payload.error : 'Не удалось извлечь характеристики',
        );
        return;
      }

      applyExtracted(await response.json());
    } catch {
      setError('Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз');
    }
  }

  async function handleExtractSpecs() {
    if (!specSheetText.trim()) return;
    setIsExtracting(true);
    setError(null);
    try {
      await requestExtraction({ sourceText: specSheetText });
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleExtractFromFile() {
    if (!selectedFileUrl) return;
    setIsExtractingFile(true);
    setError(null);
    try {
      await requestExtraction({ fileUrl: selectedFileUrl });
    } finally {
      setIsExtractingFile(false);
    }
  }

  async function handleFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    if (chosen.length === 0) return;
    setIsUploading(true);
    setError(null);

    const uploaded: UploadedFile[] = [];
    try {
      for (const file of chosen) {
        const isImageFile = file.type.startsWith('image/');
        if (isImageFile && file.size > MAX_IMAGE_BYTES) {
          setError(`Изображение «${file.name}» больше 5 МБ — сожмите его. Файл не загружен`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError(`Файл «${file.name}» больше 10 МБ и не был загружен`);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
          const response = await fetch('/api/uploads', { method: 'POST', body: formData });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            setError(
              typeof payload?.error === 'string'
                ? payload.error
                : `Не удалось загрузить файл «${file.name}»`,
            );
            continue;
          }
          const data = (await response.json()) as Omit<UploadedFile, 'name'>;
          uploaded.push({ ...data, name: file.name });
        } catch {
          setError(`Не удалось загрузить файл «${file.name}»: проверьте соединение`);
        }
      }
    } finally {
      const last = uploaded[uploaded.length - 1];
      if (last) {
        setFiles((prev) => [...prev, ...uploaded]);
        setSelectedFileUrl(last.url);
      }
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeFile(url: string) {
    setFiles((prev) => prev.filter((file) => file.url !== url));
    setSelectedFileUrl((current) => (current === url ? null : current));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const shift = parsePrice(dailyRate);
    const hourly = parsePrice(hourlyRate);
    if (shift === null || Number.isNaN(shift)) {
      setError('Укажите цену за смену 8 ч — число больше нуля');
      return;
    }
    if (Number.isNaN(hourly)) {
      setError('Цена за час должна быть числом больше нуля');
      return;
    }
    const yearNumber = year.trim() ? Number(year) : null;
    if (yearNumber !== null && (!Number.isInteger(yearNumber) || yearNumber < 1950)) {
      setError('Год выпуска — целое число не меньше 1950');
      return;
    }
    const specs = specsFromRows(specRows);
    const imageUrls = files.filter(isImage).map((file) => file.url);
    setIsSubmitting(true);

    try {
      const response = await fetch(initial ? `/api/equipment/${initial.id}` : '/api/equipment', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          initial
            ? {
                name,
                categoryId,
                status,
                make: make.trim() || null,
                model: model.trim() || null,
                year: yearNumber,
                dailyRate: shift,
                hourlyRate: hourly,
                description: description.trim() || null,
                specs: specs ?? null,
                imageUrls,
              }
            : {
                name,
                categoryId,
                status,
                make: make.trim() || undefined,
                model: model.trim() || undefined,
                year: yearNumber ?? undefined,
                dailyRate: shift,
                hourlyRate: hourly ?? undefined,
                description: description.trim() || undefined,
                specs,
                imageUrls,
              },
        ),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          typeof body?.error === 'string'
            ? body.error
            : initial
              ? 'Не удалось сохранить изменения'
              : 'Не удалось добавить технику',
        );
        return;
      }

      if (!initial) {
        setName('');
        setCategoryId('');
        setMake('');
        setModel('');
        setYear('');
        setStatus('AVAILABLE');
        setDailyRate('');
        setHourlyRate('');
        setDailyTouched(false);
        setDescription('');
        setSpecSheetText('');
        setSpecRows([]);
        setFiles([]);
        setSelectedFileUrl(null);
      }
      router.refresh();
      onDone?.();
    } catch {
      setError('Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз');
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isUploading || isExtracting || isExtractingFile;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Название
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Категория
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Выберите категорию
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Марка
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            maxLength={100}
            placeholder="Caterpillar"
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Модель
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            maxLength={100}
            placeholder="320"
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Год выпуска
          <input
            type="number"
            inputMode="numeric"
            min={1950}
            max={new Date().getFullYear() + 1}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2020"
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Цена за час, ₽ <span className="text-slate-400">(необязательно)</span>
        <input
          type="number"
          min={1}
          step="0.01"
          value={hourlyRate}
          onChange={(e) => {
            setHourlyRate(e.target.value);
            // Keep the shift price at hourly × 8 on every keystroke until the
            // user types a shift price of their own.
            if (!dailyTouched) setDailyRate(suggestShiftRate(e.target.value));
          }}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Цена за смену 8 ч, ₽
        <input
          type="number"
          required
          min={1}
          step="0.01"
          value={dailyRate}
          onChange={(e) => {
            setDailyRate(e.target.value);
            // Clearing the field hands it back to the automatic suggestion.
            setDailyTouched(e.target.value !== '');
          }}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Описание
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Статус
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as EquipmentStatusValue)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          {EQUIPMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {status === 'RETIRED' && (
          <span className="text-xs text-slate-500">
            Машина не видна в каталоге и на карте, пока вы не вернёте другой статус.
          </span>
        )}
      </label>

      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <label className="flex flex-col gap-1 text-sm">
          Фото техники или PDF со спецификацией (JPEG, PNG, WebP — до 5 МБ; PDF — до 10 МБ)
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            disabled={isUploading}
            onChange={handleFilesChosen}
            className="text-sm"
          />
        </label>
        {isUploading && <p className="mt-2 text-sm text-slate-500">Загружаем…</p>}

        {files.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {files.map((file) => (
              <li
                key={file.url}
                className={`flex flex-col gap-1 rounded-md border p-2 text-xs ${
                  selectedFileUrl === file.url ? 'border-amber-500' : 'border-slate-200'
                }`}
              >
                <label className="flex cursor-pointer flex-col gap-1">
                  <input
                    type="radio"
                    name="specSourceFile"
                    className="sr-only"
                    checked={selectedFileUrl === file.url}
                    onChange={() => setSelectedFileUrl(file.url)}
                  />
                  {isImage(file) ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="h-24 w-full rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded bg-slate-100 font-semibold text-slate-500">
                      PDF
                    </div>
                  )}
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                  {file.size > 0 && <span className="text-slate-500">{formatSize(file.size)}</span>}
                </label>
                <button
                  type="button"
                  onClick={() => removeFile(file.url)}
                  className="self-start text-red-600 hover:underline"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Картинки попадут в галерею техники. Выберите файл, чтобы извлечь из него характеристики.
          </p>
        )}

        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          disabled={busy || !selectedFileUrl}
          onClick={handleExtractFromFile}
        >
          {isExtractingFile ? 'Извлекаем…' : 'Извлечь характеристики из фото/PDF'}
        </Button>
      </div>

      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <label className="flex flex-col gap-1 text-sm">
          Вставьте спецификацию, чтобы заполнить характеристики автоматически (необязательно)
          <textarea
            rows={3}
            value={specSheetText}
            onChange={(e) => setSpecSheetText(e.target.value)}
            placeholder="Например: эксплуатационная масса 20 300 кг. Мощность двигателя 148 л.с. Объём ковша 1,19 м³."
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          disabled={busy || !specSheetText.trim()}
          onClick={handleExtractSpecs}
        >
          {isExtracting ? 'Извлекаем…' : 'Извлечь характеристики через ИИ'}
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium">Характеристики</legend>
        {specRows.length === 0 && (
          <p className="text-xs text-slate-500">
            Заполните вручную или извлеките из фото, PDF или текста — список можно править.
          </p>
        )}
        {specRows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={row.key}
              onChange={(e) => updateSpecRow(index, { key: e.target.value })}
              placeholder="Параметр"
              aria-label="Параметр"
              maxLength={100}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={row.value}
              onChange={(e) => updateSpecRow(index, { value: e.target.value })}
              placeholder="Значение"
              aria-label="Значение"
              maxLength={300}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setSpecRows((prev) => prev.filter((_, i) => i !== index))}
              aria-label="Удалить характеристику"
              className="shrink-0 px-2 text-xl leading-none text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSpecRows((prev) => [...prev, { key: '', value: '' }])}
          className="self-start text-sm font-medium text-amber-700 hover:underline"
        >
          + Добавить характеристику
        </button>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || isUploading}>
          {editing
            ? isSubmitting
              ? 'Сохраняем…'
              : 'Сохранить'
            : isSubmitting
              ? 'Добавление…'
              : 'Добавить технику'}
        </Button>
        {editing && onDone && (
          <Button type="button" variant="secondary" onClick={onDone}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  );
}
