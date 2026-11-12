import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { nicheTitle } from '@/lib/office/niches';
import { nichePitch, type PitchScene } from '@/lib/office/pitch';
import { isValidToken } from '@/lib/office/visibility';
import { SITE } from '@/lib/site';
import { POKAZ_CSS } from './styles';

export const dynamic = 'force-dynamic';

// Презентация IT-направления под конкретную фирму (владелец, 2026-11-12): открывается по той же
// секретной ссылке, что и превью её страницы. Сцены — только те, что нужны её сфере
// (lib/office/pitch.ts): название, город и сфера — из карточки. Анимация — на CSS, без скриптов
// и картинок. Без индексации; страница без шапки площадки (isStandalonePage).
export const metadata: Metadata = {
  title: 'Презентация для вашей компании',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/** Пример нашей работы: главная площадки с 3D-городом. */
const SHOWCASE_URL = 'https://xn--24-6kc5aagh4arjl.xn--p1ai/';

function Stage({ scene }: { scene: PitchScene }) {
  const [a = '', b = '', c = ''] = scene.labels;
  if (scene.kind === 'site') {
    return (
      <div className="stage" aria-hidden="true">
        <div className="phone">
          <div className="blk t" />
          <div className="blk s" />
          <div className="blk img" />
          <div className="blk btn" />
          <div className="blk s2" />
          <div className="blk s3" />
        </div>
        <span className="tag a">{a}</span>
        <span className="tag b">{b}</span>
        <span className="tag c">{c}</span>
      </div>
    );
  }
  if (scene.kind === 'crm') {
    return (
      <div className="stage" aria-hidden="true">
        <div className="board">
          <div className="col">
            {a}
            <i />
            <i />
          </div>
          <div className="col">
            {b}
            <i />
          </div>
          <div className="col">
            {c}
            <i />
            <i />
          </div>
        </div>
        <div className="deal" />
      </div>
    );
  }
  if (scene.kind === 'app') {
    return (
      <div className="stage" aria-hidden="true">
        <div className="wire w1" />
        <div className="wire w2" />
        <div className="node l">{a}</div>
        <div className="node m">{b}</div>
        <div className="node r">{c}</div>
        <div className="dot" />
        <div className="dot d2" />
      </div>
    );
  }
  return (
    <div className="stage" aria-hidden="true">
      <div className="cam">
        <div className="truck" />
        <div className="man" />
        <div className="box b1">
          <span>{a}</span>
        </div>
        <div className="box b2">
          <span>{b}</span>
        </div>
        <div className="scan" />
        <span className="rec">КАМЕРА · ВЪЕЗД</span>
      </div>
    </div>
  );
}

const EYEBROW: Record<PitchScene['kind'], string> = {
  site: 'Сайт или лендинг',
  crm: 'Учёт под вас',
  app: 'Приложение и 1С',
  camera: 'Видеокамеры',
};

export default async function PokazPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!isValidToken(token)) notFound();
  const row = await prisma.prospect.findUnique({
    where: { token },
    select: { kind: true, name: true, city: true, niche: true },
  });
  if (!row || row.kind !== 'site') notFound();
  const pitch = nichePitch(row.niche);
  const sphere = nicheTitle(row.niche);
  return (
    <main className="pokaz">
      <style dangerouslySetInnerHTML={{ __html: POKAZ_CSS }} />
      <div className="wrap">
        <header>
          <span className="eyebrow">{SITE.name} · IT-направление</span>
          <h1>{pitch.headline}</h1>
          <p className="for">
            Собрано для:{' '}
            <b>
              {row.name}
              {row.city ? `, ${row.city}` : ''}
            </b>
          </p>
          <p className="mute">
            {sphere ? `Ваша сфера — ${sphere.toLowerCase()}. ` : ''}Ниже только то, что нужно такому
            бизнесу. Делаем под ключ и ведём дальше.
          </p>
        </header>

        {pitch.scenes.map((scene, index) => (
          <section className={index % 2 ? 'scene flip' : 'scene'} key={scene.title}>
            <Stage scene={scene} />
            <div className="copy">
              <span className="eyebrow">{EYEBROW[scene.kind]}</span>
              <h2>{scene.title}</h2>
              <p>{scene.text}</p>
            </div>
          </section>
        ))}

        <section className={pitch.scenes.length % 2 ? 'scene flip' : 'scene'}>
          <div className="stage" aria-hidden="true">
            <div className="city">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="road" />
            <div className="car" />
          </div>
          <div className="copy">
            <span className="eyebrow">Пример нашей работы</span>
            <h2>Площадка с приложением и 3D-городом</h2>
            <p>
              Наш собственный проект: заказ спецтехники по всей России, мобильное приложение и
              трёхмерный город, по которому можно пройтись прямо в браузере.
            </p>
            <a className="go" href={SHOWCASE_URL} rel="noopener">
              Прогуляться по 3D-городу
            </a>
          </div>
        </section>

        <footer>
          <span className="eyebrow">С чего начать</span>
          <h2>Позвоните или ответьте на письмо</h2>
          <p className="tel">{SITE.phone}</p>
          <a className="go" href={`/preview/${token}`}>
            Посмотреть черновик вашей страницы
          </a>
          <p className="mute">
            {SITE.contactPerson}, {SITE.name} · {SITE.legalName}, ИНН {SITE.inn}, {SITE.city}.
            Страница не является офертой; стоимость называем под вашу задачу.
          </p>
        </footer>
      </div>
    </main>
  );
}
