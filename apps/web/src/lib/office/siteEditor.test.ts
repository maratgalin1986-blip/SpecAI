import { describe, expect, it } from 'vitest';
import { buildSitePage } from './pages';
import { PHOTO_URL, SITE_ACCENTS, parseSiteContent, validateSiteContent } from './siteContent';
import {
  ACCENT_TITLES,
  addPhoto,
  addService,
  draftToContent,
  editorDefaults,
  editorDraft,
  editorSnapshot,
  removeAt,
  sitePhotoPath,
  sitePhotoProblem,
  sitePhotoStorePath,
  siteJsonFor,
  type SiteEditorDraft,
} from './siteEditor';

const emptyDraft: SiteEditorDraft = editorDraft({});

const page = buildSitePage(
  {
    kind: 'site',
    status: 'READY',
    slug: 'ulybka-kazan-ab12',
    name: 'Стоматология «Улыбка»',
    phone: '+78432123456',
    address: 'ул. Баумана, 10, Казань',
    city: 'Казань',
    lat: null,
    lon: null,
    tags: null,
    hours: null,
  },
  {
    key: 'dentist',
    title: 'Стоматология',
    services: ['Лечение кариеса', 'Чистка зубов'],
    heroLine: 'Стоматология в городе {city}',
    accent: 'teal',
  },
);

describe('editorDraft / draftToContent', () => {
  it('пустая правка — пустая форма с включённой формой заявки', () => {
    expect(emptyDraft).toEqual({
      title: '',
      hero: '',
      about: '',
      services: [],
      hours: '',
      address: '',
      phone: '',
      whatsapp: '',
      accent: '',
      photos: [],
      leadForm: true,
    });
    expect(draftToContent(emptyDraft)).toEqual({});
  });

  it('пустые строки и услуги не уходят, края обрезаются, повторы фото убраны', () => {
    const content = draftToContent({
      ...emptyDraft,
      title: '  Улыбка  ',
      hero: '   ',
      about: 'Первая строка\nВторая строка ',
      services: ['  Имплантация ', '', '   ', 'Протезирование'],
      phone: ' 8 (843) 212-34-56 ',
      accent: 'rose',
      photos: ['/api/files/office/a.jpg', '/api/files/office/a.jpg', ' '],
      leadForm: false,
    });
    expect(content).toEqual({
      title: 'Улыбка',
      about: 'Первая строка\nВторая строка',
      services: ['Имплантация', 'Протезирование'],
      phone: '8 (843) 212-34-56',
      accent: 'rose',
      photos: ['/api/files/office/a.jpg'],
      leadForm: false,
    });
  });

  it('правка проходит проверку сервера и возвращается в форму той же', () => {
    const draft: SiteEditorDraft = {
      ...emptyDraft,
      title: 'Улыбка',
      services: ['Имплантация'],
      hours: 'Пн–Пт 9:00–20:00',
      address: 'ул. Пушкина, 1',
      phone: '+78432123456',
      whatsapp: '+79272428088',
      accent: 'sky',
      photos: ['/api/files/office/ulybka/abc-photo.jpg'],
      leadForm: false,
    };
    const checked = validateSiteContent(draftToContent(draft));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const json = siteJsonFor(checked.content);
    expect(json).not.toBeNull();
    expect(editorDraft(parseSiteContent(json))).toEqual(draft);
  });

  it('форма заявки: включена — поле не пишется, выключена — false', () => {
    expect(draftToContent({ ...emptyDraft, leadForm: true })).toEqual({});
    expect(draftToContent({ ...emptyDraft, leadForm: false })).toEqual({ leadForm: false });
    expect(editorDraft({ leadForm: false }).leadForm).toBe(false);
  });
});

describe('siteJsonFor', () => {
  it('пустая правка → null', () => {
    expect(siteJsonFor({})).toBeNull();
    expect(siteJsonFor({ photos: [], leadForm: true })).toBeNull();
    expect(siteJsonFor({ title: '   ' })).toBeNull();
  });

  it('пишет только значимые поля', () => {
    expect(siteJsonFor({ title: 'Улыбка', photos: [], leadForm: true })).toBe(
      JSON.stringify({ title: 'Улыбка' }),
    );
    expect(siteJsonFor({ leadForm: false })).toBe(JSON.stringify({ leadForm: false }));
  });

  it('пустой ввод из формы через проверку сервера → null (сайт как по карточке)', () => {
    const checked = validateSiteContent({ title: '', services: [], photos: [] });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(siteJsonFor(checked.content)).toBeNull();
  });
});

describe('списки услуг и фото', () => {
  it('addService не выходит за лимит, removeAt убирает по номеру', () => {
    expect(addService(['А'], 3)).toEqual(['А', '']);
    expect(addService(['А', 'Б', 'В'], 3)).toEqual(['А', 'Б', 'В']);
    expect(removeAt(['А', 'Б', 'В'], 1)).toEqual(['А', 'В']);
    expect(removeAt(['А'], 5)).toEqual(['А']);
  });

  it('addPhoto: без повторов, пустых и сверх лимита', () => {
    expect(addPhoto([], '/api/files/a.jpg', 6)).toEqual(['/api/files/a.jpg']);
    expect(addPhoto(['/api/files/a.jpg'], '/api/files/a.jpg', 6)).toEqual(['/api/files/a.jpg']);
    expect(addPhoto(['/api/files/a.jpg'], '', 6)).toEqual(['/api/files/a.jpg']);
    const six = ['1', '2', '3', '4', '5', '6'].map((n) => `/api/files/${n}.jpg`);
    expect(addPhoto(six, '/api/files/7.jpg', 6)).toEqual(six);
  });
});

describe('editorDefaults / editorSnapshot', () => {
  it('подсказки — из страницы по карточке', () => {
    expect(editorDefaults(page)).toEqual({
      title: 'Стоматология «Улыбка»',
      hero: 'Стоматология в городе Казань',
      services: ['Лечение кариеса', 'Чистка зубов'],
      hours: '',
      address: 'ул. Баумана, 10, Казань',
      phone: '+7 843 212-34-56',
      accent: 'teal',
    });
  });

  it('снимок не меняется от пробелов и регистра домена, меняется от правки', () => {
    const a = editorSnapshot({ ...emptyDraft, title: 'Улыбка' }, 'Ulybka.ru ');
    expect(editorSnapshot({ ...emptyDraft, title: ' Улыбка ' }, 'ulybka.ru')).toBe(a);
    expect(editorSnapshot({ ...emptyDraft, title: 'Улыбка+' }, 'ulybka.ru')).not.toBe(a);
  });

  it('у каждого цвета сайта есть русское название', () => {
    for (const accent of SITE_ACCENTS) expect(ACCENT_TITLES[accent]).toMatch(/[А-Яа-яЁё]/);
  });
});

describe('загрузка фото', () => {
  it('sitePhotoProblem: только JPEG/PNG/WebP до 5 МБ, с кодом ответа', () => {
    expect(sitePhotoProblem({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(sitePhotoProblem({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(sitePhotoProblem({ type: 'image/webp', size: 10 })).toBeNull();
    for (const type of ['application/pdf', 'image/gif', 'image/svg+xml', '']) {
      expect(sitePhotoProblem({ type, size: 1000 })).toEqual({
        error: 'Фото — только JPEG, PNG или WebP',
        status: 415,
      });
    }
    expect(sitePhotoProblem({ type: 'image/jpeg', size: 0 })).toEqual({
      error: 'Файл пустой',
      status: 400,
    });
    expect(sitePhotoProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toMatchObject({
      status: 413,
    });
  });

  it('sitePhotoStorePath: папка по адресу сайта, расширение по типу, чужой ввод — общая папка', () => {
    expect(sitePhotoStorePath('image/png', 'ulybka-kazan-ab12')).toBe(
      'office/ulybka-kazan-ab12/photo.png',
    );
    expect(sitePhotoStorePath('image/webp')).toBe('office/photo.webp');
    expect(sitePhotoStorePath('image/jpeg', '../../etc')).toBe('office/photo.jpg');
    expect(sitePhotoStorePath('image/jpeg', 'ID_With_Caps')).toBe('office/photo.jpg');
  });

  it('sitePhotoPath: адрес хранилища в базе → относительный, проходит PHOTO_URL', () => {
    const base = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';
    const stored = `${base}/api/files/office/ulybka-kazan-ab12/Zx9_-abc-photo.jpg`;
    const path = sitePhotoPath(stored, base);
    expect(path).toBe('/api/files/office/ulybka-kazan-ab12/Zx9_-abc-photo.jpg');
    expect(PHOTO_URL.test(path)).toBe(true);
    expect(sitePhotoPath(stored, `${base}/`)).toBe(path);
  });

  it('sitePhotoPath: адрес Vercel Blob остаётся как есть, чужой адрес не проходит PHOTO_URL', () => {
    const blob = 'https://abc123.public.blob.vercel-storage.com/office/ulybka/photo-Xy12.jpg';
    expect(sitePhotoPath(blob, 'https://example.ru')).toBe(blob);
    expect(PHOTO_URL.test(blob)).toBe(true);
    const foreign = 'https://evil.example/api/files/office/a.jpg';
    expect(PHOTO_URL.test(sitePhotoPath(foreign, 'https://example.ru'))).toBe(false);
    expect(sitePhotoPath('/api/files/a.jpg', '')).toBe('/api/files/a.jpg');
  });
});
