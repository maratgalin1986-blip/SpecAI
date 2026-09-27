'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';

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
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isImage(file: UploadedFile) {
  return file.contentType.startsWith('image/');
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function NewEquipmentForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [description, setDescription] = useState('');
  const [specSheetText, setSpecSheetText] = useState('');
  const [specs, setSpecs] = useState<Record<string, unknown> | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
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
    setSpecs(data.specs ?? null);
    if (!name.trim() && (data.make || data.model)) {
      setName([data.make, data.model].filter(Boolean).join(' '));
    }
  }

  async function requestExtraction(body: Record<string, string>) {
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
  }

  async function handleExtractSpecs() {
    if (!specSheetText.trim()) return;
    setIsExtracting(true);
    setError(null);
    await requestExtraction({ sourceText: specSheetText });
    setIsExtracting(false);
  }

  async function handleExtractFromFile() {
    if (!selectedFileUrl) return;
    setIsExtractingFile(true);
    setError(null);
    await requestExtraction({ fileUrl: selectedFileUrl });
    setIsExtractingFile(false);
  }

  async function handleFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    if (chosen.length === 0) return;
    setIsUploading(true);
    setError(null);

    const uploaded: UploadedFile[] = [];
    for (const file of chosen) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`Файл «${file.name}» больше 10 МБ и не был загружен`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
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
    }

    const last = uploaded[uploaded.length - 1];
    if (last) {
      setFiles((prev) => [...prev, ...uploaded]);
      setSelectedFileUrl(last.url);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(url: string) {
    setFiles((prev) => prev.filter((file) => file.url !== url));
    setSelectedFileUrl((current) => (current === url ? null : current));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        categoryId,
        dailyRate: Number(dailyRate),
        description: description || undefined,
        specs: specs ?? undefined,
        imageUrls: files.filter(isImage).map((file) => file.url),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось добавить технику');
      return;
    }

    setName('');
    setCategoryId('');
    setDailyRate('');
    setDescription('');
    setSpecSheetText('');
    setSpecs(null);
    setFiles([]);
    setSelectedFileUrl(null);
    router.refresh();
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

      <label className="flex flex-col gap-1 text-sm">
        Цена в сутки (USD)
        <input
          type="number"
          required
          min={1}
          step="0.01"
          value={dailyRate}
          onChange={(e) => setDailyRate(e.target.value)}
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

      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <label className="flex flex-col gap-1 text-sm">
          Фото техники или PDF со спецификацией (JPEG, PNG, WebP, PDF — до 10 МБ)
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
                  <span className="text-slate-500">{formatSize(file.size)}</span>
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
        {specs && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {Object.entries(specs).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting || isUploading}>
        {isSubmitting ? 'Добавление…' : 'Добавить технику'}
      </Button>
    </form>
  );
}
