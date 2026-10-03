'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MachineType } from '@/lib/machinePhotos';
import {
  DIALOG_EVENT,
  emitDialog,
  emitNature,
  emitScene,
  type DialogEventDetail,
} from '@/lib/sceneEvents';
import { SITE } from '@/lib/site';
import {
  DIALOGUE,
  dialogueNode,
  FORM_NODE,
  MACHINE_ZONE,
  SPEAKERS,
  ZONES,
  zoneById,
  type DialogNode,
  type Reply,
  type SpeakerId,
  type ZoneId,
} from '@/lib/stroyka';
import { awayMessage, snapshot, type VisitSnapshot } from '@/lib/stroyka/away';
import {
  applyReply,
  contextFacts,
  contextIntro,
  emptyContext,
  missing,
  orderProgress,
  orderSummary,
  radioHandoff,
  renderLine,
  type OrderContext,
  type RadioLine,
} from '@/lib/stroyka/context';
import type { LineConditions, LinePicker } from '@/lib/stroyka/lines';
import {
  progressAt,
  progressFromUnits,
  progressLine,
  worldProgress,
  type WorldProgress,
} from '@/lib/stroyka/progress';
import { loadUsed, saveUsed } from '@/lib/stroyka/shuffleBag';
import { moodLine, type Mood } from '@/lib/stroyka/mood';
import { seasonalEvent } from '@/lib/stroyka/seasonal';
import {
  applyBadge,
  BADGES,
  emptyBadges,
  loadBadges,
  saveBadges,
  type BadgeEvent,
} from '@/lib/stroyka/badges';
import { stageNode } from '@/lib/stroyka/stage';
import { BANTER_NAMES, type BanterSpeaker } from '@/lib/stroykaJokes';
import {
  atMskTime,
  conditionsLine,
  nearestPoint,
  overrideLiftStop,
  parseOverrides,
  weatherScene,
  type LiftStop,
  type SceneOverrides,
  type WeatherPoint,
} from '@/lib/stroykaSky';
import { mskToday, type WorkNote } from '@/lib/weather';
import { isOnShift } from '@/lib/site';
import { leadAcceptedText } from '@/lib/dispatcher';
import { submitLead, leadErrorText } from '@/lib/submitLead';
import { reachGoal } from '@/lib/marketing';
import type { Quick } from '@/lib/stroyka/brain';
import { smetaHref } from '@/lib/stroyka/smetaLink';
import { SoundToggle } from '@/components/SoundToggle';
import type { Mode, SharedInput, Telemetry, View } from './engine';
import type { StroykaEngine } from './StroykaWorld';
import { Censored, DialogueBox } from './DialogueBox';
import { FallbackMap, Passport } from './FallbackMap';
import { Joystick } from './Joystick';
import { MiniMap, type MiniCity } from './MiniMap';
import { NavChooser } from './NavChooser';
import { NAV_SIGHTS } from './navTargets';
import { placeSite, points as cityPoints, type CityData } from '@/lib/stroyka/city';
import { OrderPanel } from './OrderPanel';
import { PhotoBooth } from './PhotoBooth';
import { StroykaFilm } from './StroykaFilm';
import { ZoneFilm } from './ZoneFilm';
import { crewLine } from '@/lib/stroyka/crew';
import { crewDelay, filmNature, pickCrewLine } from '@/lib/stroyka/filmAmbience';
import {
  callbackLine,
  chapter,
  credits as buildCredits,
  awayTail,
  daysToNextStage,
  forgetText,
  greeting as pickGreeting,
  hookLine,
  withoutHello,
  lastTimeLine,
  mskMoment,
  OFFER_TEXT,
  offerNoText,
  offerSpeaker,
  offerYesText,
  orderStatusLine,
  type Chapter,
  type Credits,
  type Moment,
} from '@/lib/stroyka/story';
import { innerTurn, pickInner } from '@/lib/stroyka/lines/inner';
import { RECORDED_SPEAKERS } from '@/lib/stroyka/voice';
import {
  beginVisit,
  canOffer,
  declineOffer,
  emptyMemory,
  forget,
  grantConsent,
  hasConsent,
  loadMemory,
  cleanName,
  nameFromText,
  newSession,
  rememberFacts,
  saveMemory,
  type PersonalFacts,
  type VisitorMemory,
} from '@/lib/stroyka/visitorMemory';
import { ChapterCard } from './ChapterCard';
import { MemoryOffer, type MemoryNote } from './MemoryOffer';
import { EndCredits } from './EndCredits';
import { WeatherBadge } from './WeatherBadge';

const StroykaWorld = dynamic(() => import('./StroykaWorld'), { ssr: false });

// 'film' (default, owner 2026-10-03): real footage per stop, no 3D engine;
// '3d': the rendered site (?3d=1 or «Пройтись в 3D»); 'fallback': the 2D list (?2d=1).
type Phase = 'boot' | 'film' | '3d' | 'fallback';

interface DialogState {
  nodeId: string;
  radio: RadioLine[];
  /** The visitor is busy with it (answered, form open): the tour waits, zones do not replace it. */
  engaged: boolean;
  key: number;
}

const BUBBLE_CSS = `.stroyka-bubble{position:absolute;left:0;top:0;max-width:min(240px,60vw);padding:6px 10px;border-radius:12px;background:#fff;color:#0f172a;font-size:14px;line-height:1.3;font-weight:700;-webkit-font-smoothing:antialiased;box-shadow:0 6px 18px rgba(0,0,0,.35);transition:opacity .35s;opacity:0;will-change:transform}
        .stroyka-bubble::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-top-color:#fff;border-bottom:0}
        .stroyka-censor{color:#dc2626;font-weight:900}
        .crew-sub{animation:crew-sub 4.5s ease forwards}
        @keyframes crew-sub{0%{opacity:0;transform:translateY(4px)}8%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
        @media (prefers-reduced-motion:reduce){.crew-sub{animation:none}}`;

const VISIT_KEY = 'stroyka.visit.v1';
const WEATHER_KEY = 'stroyka.weather.v1';

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
    // Release the probe at once: iPhones allow only a few live contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Every voice on the site, for «Поговорил со всеми». */
const ALL_SPEAKERS = [...new Set(ZONES.map((z) => z.speaker))];
const ALL_ZONES = ZONES.map((z) => z.id);

const uniq = <T,>(list: T[]) => [...new Set(list)];

export function Stroyka() {
  const [phase, setPhase] = useState<Phase>('boot');
  // The opening cinematic, until the engine says the fly-over ended.
  const [introOn, setIntroOn] = useState(true);
  // The opening film, shown while the site loads (not with ?nofilm=1,
  // ?nointro=1, a direct order link or reduced motion).
  const [filmOn, setFilmOn] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [overrides, setOverrides] = useState<SceneOverrides>({});
  const [loadReal, setLoadReal] = useState(0);
  const [loadSim, setLoadSim] = useState(0.04);
  const [engine, setEngine] = useState<StroykaEngine | null>(null);
  const input = useMemo<SharedInput>(() => ({ joyX: 0, joyY: 0 }), []);
  const telemetry = useMemo<Telemetry>(
    () => ({
      x: 0,
      z: 66,
      yaw: Math.PI,
      fps: 0,
      mode: 'free',
      zone: null,
      tourStop: null,
      ready: false,
      drawCalls: 0,
      pixelRatio: 1,
    }),
    [],
  );
  // The visitor leads by default; «Экскурсия» is opt-in (owner, 2026-10-03).
  const [mode, setMode] = useState<Mode>('free');
  // «Куда идём?»: places, people and sights to go to.
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<View>('fp');
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogRef = useRef<DialogState | null>(null);
  dialogRef.current = dialog;
  const [ctx, setCtx] = useState<OrderContext>(emptyContext);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [radioLog, setRadioLog] = useState<{ speaker: BanterSpeaker; text: string; id: number }[]>(
    [],
  );
  const [logOpen, setLogOpen] = useState(false);
  const [order, setOrder] = useState<{ open: boolean; machine?: MachineType | null }>({
    open: false,
  });
  const orderOpen = useRef(false);
  orderOpen.current = order.open;
  const [skipTyping, setSkipTyping] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [point, setPoint] = useState<WeatherPoint | null>(null);
  const [progress, setProgress] = useState<WorldProgress>(() => worldProgress(Date.now(), null));
  const [progressReady, setProgressReady] = useState(false);
  const [timelapse, setTimelapse] = useState(false);
  const [away, setAway] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ speaker: BanterSpeaker; text: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const pendingRadio = useRef<RadioLine[]>([]);
  const visited = useRef(new Set<ZoneId>());
  const picker = useRef<LinePicker | null>(null);
  const linesMod = useRef<typeof import('@/lib/stroyka/lines') | null>(null);
  const keyRef = useRef(0);
  const prevZone = useRef<ZoneId | null>(null);
  const [chat, setChat] = useState<{
    speaker: SpeakerId;
    text: string;
    quick: Quick[];
    mood: Mood;
  } | null>(null);
  const [badges, setBadges] = useState(emptyBadges);
  const badgesRef = useRef(badges);
  badgesRef.current = badges;
  const [shelfOpen, setShelfOpen] = useState(false);
  const seasonSaid = useRef(new Set<string>());
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  // The phone HUD menu («⋯»): mode, view, radio, badges and the photo booth.
  const [hudOpen, setHudOpen] = useState(false);
  const [phoneSending, setPhoneSending] = useState(false);
  const brain = useRef<typeof import('@/lib/stroyka/brain') | null>(null);
  // The personal film: chapter cards, remembered jobs, inner lines, end credits.
  const [chapterCard, setChapterCard] = useState<{ chapter: Chapter; n: number } | null>(null);
  const [endCredits, setEndCredits] = useState<Credits | null>(null);
  const met = useRef<SpeakerId[]>([]);
  const innerSaid = useRef(new Set<string>());
  const innerAt = useRef<number | null>(null);
  const calledBack = useRef(new Set<SpeakerId>());
  // What the crew remember (lib/stroyka/visitorMemory.ts): read once on mount,
  // written on events only. Personal facts wait in `facts` until consent.
  const memory = useRef<VisitorMemory>(emptyMemory());
  const returning = useRef(false);
  const [consented, setConsented] = useState(false);
  const facts = useRef<PersonalFacts>({});
  const welcome = useRef<{ key: number; greeting: string; known: string } | null>(null);
  const [memoryNote, setMemoryNote] = useState<MemoryNote | null>(null);
  const offered = useRef(false);
  const hooksSaid = useRef(new Set<SpeakerId>());
  const rootRef = useRef<HTMLDivElement>(null);
  const commitMemory = useCallback((next: VisitorMemory) => {
    memory.current = next;
    saveMemory(next);
    setConsented(hasConsent(next));
  }, []);
  const [miniCity, setMiniCity] = useState<MiniCity | null>(null);

  // The mini-map shows the same OSM city as the world (buildings and roads around the site).
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    fetch('/stroyka/chelny-osm.json')
      .then((r) => (r.ok ? (r.json() as Promise<CityData>) : Promise.reject()))
      .then((data) => {
        if (cancelled || !data.b || data.b.length < 20) return;
        const [ox, oz] = placeSite(data);
        const near = (pts: [number, number][]) =>
          pts.some(([x, z]) => Math.abs(x + ox) < 90 && Math.abs(z + oz) < 100);
        const toSvg = (pts: [number, number][]) =>
          pts.map(([x, z]) => `${(x + ox).toFixed(1)},${(z + oz).toFixed(1)}`).join(' ');
        const polys = data.b
          .map((b) => cityPoints(b))
          .filter(near)
          .map(toSvg);
        const roads = data.r
          .filter((r) => Number(r[0]) >= 1)
          .map((r) => cityPoints(r))
          .filter(near)
          .map(toSvg);
        setMiniCity({ polys, roads });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [engine]);

  const weather = useMemo(() => weatherScene(point), [point]);
  const [serverLift, setServerLift] = useState<LiftStop | null>(null);
  const lift = useMemo<LiftStop>(
    () =>
      overrides.weather ? overrideLiftStop(point) : (serverLift ?? { stop: false, reason: null }),
    [overrides.weather, point, serverLift],
  );
  const hour = (now.getUTCHours() + 3) % 24;
  const hourRef = useRef(hour);
  hourRef.current = hour;

  // Holidays by the real date (?date=YYYY-MM-DD to preview one).
  const [dateOverride, setDateOverride] = useState<Date | null>(null);
  const dayKey = (dateOverride ?? now).toISOString().slice(0, 10);
  const season = useMemo(() => seasonalEvent(dateOverride ?? now), [dayKey]);
  const seasonRef = useRef(season);
  seasonRef.current = season;
  /** The next holiday line for this voice, once each. */
  const seasonLine = useCallback((speaker: BanterSpeaker) => {
    const line = seasonRef.current?.lines.find(
      (l) => l.speaker === speaker && !seasonSaid.current.has(l.text),
    );
    if (line) seasonSaid.current.add(line.text);
    return line ?? null;
  }, []);

  // «Значки прораба»: just for fun, kept in localStorage.
  useEffect(() => setBadges(loadBadges()), []);
  const earn = useCallback((event: BadgeEvent) => {
    const { state, earned } = applyBadge(badgesRef.current, event);
    if (JSON.stringify(state) === JSON.stringify(badgesRef.current)) return;
    badgesRef.current = state;
    setBadges(state);
    saveBadges(state);
    for (const b of earned) setToast(`🏅 Новый значок: ${b.icon} «${b.title}»`);
  }, []);

  // ------------------------------------------------------------ boot
  useEffect(() => {
    const ov = parseOverrides(window.location.search);
    setOverrides(ov);
    const params = new URLSearchParams(window.location.search);
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(prefersReduced);
    setMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    const force2d = params.get('2d') === '1';
    const force3d = params.get('3d') === '1';
    // Real footage per zone is the default tour (owner, 2026-10-03: «не рисовать
    // графику, склеить ролик из настоящих съёмок»); the 3D scene is one tap away or ?3d=1.
    setPhase(force2d ? 'fallback' : force3d && hasWebGL() ? '3d' : 'film');
    setFilmOn(
      !prefersReduced &&
        !['nofilm', 'nointro', 'order'].some((key) => params.get(key) === '1') &&
        params.get('film') !== '0',
    );
    if (ov.time) setNow(atMskTime(new Date(), ov.time.h, ov.time.m));
    if (params.get('order') === '1') {
      setOrder({ open: true, machine: null });
      setMode('free');
    }
    const forcedDate = params.get('date');
    if (forcedDate && /^\d{4}-\d{2}-\d{2}$/.test(forcedDate))
      setDateOverride(new Date(`${forcedDate}T09:00:00Z`));
    // Full-screen page: the site chrome stays behind, the page does not scroll.
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    {
      const started = beginVisit(loadMemory(), mskToday(), newSession());
      returning.current = started.returning;
      memory.current = started.memory;
      saveMemory(started.memory);
      setConsented(hasConsent(started.memory));
    }
    import('@/lib/stroyka/lines').then((mod) => {
      linesMod.current = mod;
      picker.current = new mod.LinePicker(loadUsed());
    });
    return () => {
      html.style.overflow = prev;
      document.body.style.overflow = '';
    };
  }, []);

  // Fake progress while the 3D chunk downloads, real progress after.
  useEffect(() => {
    if (phase !== '3d' || loadReal >= 1) return;
    const timer = window.setInterval(() => setLoadSim((p) => Math.min(0.35, p + 0.015)), 120);
    return () => window.clearInterval(timer);
  }, [phase, loadReal]);

  // ------------------------------------------------------------ time and weather
  useEffect(() => {
    const tick = () =>
      setNow(
        overrides.time ? atMskTime(new Date(), overrides.time.h, overrides.time.m) : new Date(),
      );
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [overrides]);

  useEffect(() => {
    if (phase === 'boot') return;
    if (overrides.weather) {
      setPoint(overrides.weather);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const cached = JSON.parse(sessionStorage.getItem(WEATHER_KEY) ?? 'null') as {
          at: number;
          point: WeatherPoint | null;
          lift?: LiftStop | null;
        } | null;
        if (cached && Date.now() - cached.at < 30 * 60_000) {
          if (!cancelled) {
            setPoint(cached.point);
            setServerLift(cached.lift ?? null);
          }
          return;
        }
      } catch {
        // No storage: just fetch.
      }
      try {
        const response = await fetch(`/api/weather?date=${mskToday()}`);
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as {
          now?: WeatherPoint | null;
          nowLift?: LiftStop | null;
          weather?: { points?: (WeatherPoint & { time: string })[] } | null;
        };
        const p = json.now ?? nearestPoint(json.weather?.points ?? [], Date.now());
        if (!cancelled) {
          setPoint(p);
          setServerLift(json.nowLift ?? null);
        }
        try {
          sessionStorage.setItem(
            WEATHER_KEY,
            JSON.stringify({ at: Date.now(), point: p, lift: json.nowLift ?? null }),
          );
        } catch {
          // ignore
        }
      } catch {
        // The API failed: clear weather with the real time.
        if (!cancelled) setPoint(null);
      }
    };
    load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, overrides]);

  // ------------------------------------------------------------ district progress
  useEffect(() => {
    if (phase === 'boot') return;
    const params = new URLSearchParams(window.location.search);
    const forced = Number(params.get('progress'));
    const apply = (p: WorldProgress, remember: boolean) => {
      setProgress(p);
      setProgressReady(true);
      if (!remember) return;
      try {
        const prev = JSON.parse(localStorage.getItem(VISIT_KEY) ?? 'null') as VisitSnapshot | null;
        const message = awayMessage(prev, p, Date.now());
        if (message) {
          setAway(message);
          setToast(message);
        }
        if (
          prev &&
          prev.projectIndex === p.projectIndex &&
          (prev.stage !== p.stage || prev.floorsBuilt !== p.floorsBuilt)
        )
          setTimelapse(true);
        localStorage.setItem(VISIT_KEY, JSON.stringify(snapshot(p, Date.now())));
      } catch {
        // Storage blocked: no «пока вас не было».
      }
    };
    if (params.has('progress') && Number.isFinite(forced) && forced >= 0) {
      apply(progressFromUnits(forced, false), false);
      return;
    }
    // `?date=2027-06-01`: preview the construction on that day (not remembered).
    const date = parseOverrides(window.location.search).date;
    if (date !== undefined) return apply(progressAt(date), false);
    fetch('/api/world')
      .then((r) => (r.ok ? (r.json() as Promise<WorldProgress>) : Promise.reject()))
      .then((p) => apply(p.startedAt ? p : worldProgress(Date.now(), null), true))
      .catch(() => apply(worldProgress(Date.now(), null), true));
  }, [phase]);

  // ------------------------------------------------------------ engine sync
  useEffect(() => {
    engine?.setSeason(season);
    engine?.setEnvironment(now, point, lift);
  }, [engine, season, now, point, lift]);

  // «Собрал заявку»: every point of the order filled in, or the order sent.
  useEffect(() => {
    if (ctx.sent || orderProgress(ctx).done >= 5) earn({ type: 'order' });
  }, [ctx, earn]);

  // Badges for the conditions of the visit.
  useEffect(() => {
    if (!engine) return;
    if (hour >= 22 || hour < 5) earn({ type: 'night' });
    if (weather.rain > 0.05) earn({ type: 'rain' });
  }, [engine, hour, weather, earn]);
  useEffect(() => {
    if (engine && progressReady) engine.setProgress(progress, timelapse);
  }, [engine, progress, progressReady, timelapse]);
  useEffect(() => {
    engine?.setMode(mode);
  }, [engine, mode]);
  useEffect(() => {
    engine?.setView(view);
  }, [engine, view]);
  useEffect(() => {
    engine?.setHold(!!dialog?.engaged || order.open);
  }, [engine, dialog?.engaged, order.open]);
  // The 3D fly-over waits for the end of the film.
  useEffect(() => {
    engine?.holdIntro(filmOn);
  }, [engine, filmOn]);
  useEffect(() => {
    if (!engine) return;
    if (new URLSearchParams(window.location.search).get('nointro') === '1') engine.skipIntro();
    const w = window as unknown as { __stroyka?: unknown };
    w.__stroyka = {
      telemetry,
      goTo: (z: ZoneId) => engine.goToZone(z),
      skipIntro: () => engine.skipIntro(),
      fx: (on: boolean) => engine.setFx(on),
      state: () => engine.state,
      toScreen: (x: number, y: number, z: number) => engine.toScreen(x, y, z),
      inspect: (...args: Parameters<StroykaEngine['inspect']>) => engine.inspect(...args),
      standAt: (x: number, z: number, yaw: number, pitch?: number) => {
        setMode('free');
        engine.standAt(x, z, yaw, pitch);
      },
    };
  }, [engine, telemetry]);

  // ------------------------------------------------------------ dialogue
  const nodeFor = useCallback(
    (nodeId: string, c: OrderContext): DialogNode | null => {
      let node: DialogNode | null;
      if (nodeId === 'korpus') {
        node =
          lift.stop || progress.stageKey === 'facade'
            ? dialogueNode('korpus', lift)
            : stageNode(progress);
      } else node = dialogueNode(nodeId, lift);
      if (!node) return null;
      let text = renderLine(node.text, c);
      const zoneRoot =
        ZONES.some((z) => z.root === node!.id) && node.id !== 'gate' && node.id !== FORM_NODE;
      if (zoneRoot && contextFacts(c) && c.heardBy.includes(node.speaker))
        text = `${contextIntro(c, node.speaker)} ${text}`;
      if (node.id === 'gate-next') {
        // The foreman offers a rough estimate for the job (the /smeta calculator).
        text = `${text} Хотите, прикину смету? Скажите размеры — посчитаю примерно, а Света уточнит.`;
        return {
          ...node,
          text,
          replies: [
            ...node.replies,
            {
              label: '🧮 Прикинуть смету',
              action: { kind: 'link', href: smetaHref(c.task, c.machine) },
            },
          ],
        };
      }
      if (node.id === FORM_NODE && contextFacts(c)) {
        const gaps = missing(c);
        text = `Записала: ${contextFacts(c)}. ${
          gaps.includes('address')
            ? 'Адрес подскажете — и телефон, я перезвоню и подтвержу.'
            : 'Оставьте телефон — перезвоню и подтвержу.'
        }`;
      }
      return { ...node, text };
    },
    [lift, progress],
  );

  const logRadio = useCallback((lines: { speaker: BanterSpeaker; text: string }[]) => {
    if (!lines.length) return;
    const shown = lines.map((l) => ({
      speaker: l.speaker,
      ...moodLine({ speaker: l.speaker, text: l.text, kind: 'radio', hour: hourRef.current }),
    }));
    for (const line of shown) emitDialog(line.speaker, line.text, 'radio', line.mood);
    setRadioLog((log) =>
      [
        ...log,
        ...shown.map((l) => ({ speaker: l.speaker, text: l.text, id: ++keyRef.current })),
      ].slice(-8),
    );
  }, []);

  /** The greeting plus «пока вас не было…» (the progress may arrive a moment later). */
  const welcomeText = useCallback(
    (w: { greeting: string; known: string }) =>
      // «Имя, с возвращением! Пока вас не было: … В прошлый раз вы спрашивали про …»
      [w.greeting, awayTail(away), w.known].filter(Boolean).join(' '),
    [away],
  );

  const openNode = useCallback(
    (nodeId: string, radio: RadioLine[], engaged: boolean, c: OrderContext = ctxRef.current) => {
      const node = nodeFor(nodeId, c);
      if (!node) return;
      let text = node.text;
      const key = ++keyRef.current;
      // A returning visitor: the first zone character greets them, by name
      // with consent, and says what changed and what was agreed last time.
      const zoneRoot = ZONES.some((z) => z.root === node.id) && node.id !== FORM_NODE;
      if (!welcome.current && zoneRoot && (returning.current || away)) {
        const m = memory.current;
        const ok = hasConsent(m);
        const g = pickGreeting(node.speaker, ok ? m.name : undefined, m.greeting);
        const known = ok
          ? [lastTimeLine(node.speaker, m), orderStatusLine(node.speaker, m)].filter(Boolean)
          : [];
        welcome.current = { key, greeting: g.text, known: known.join(' ') };
        commitMemory({ ...m, greeting: g.id });
      }
      if (welcome.current?.key === key)
        text = `${welcomeText(welcome.current)} ${withoutHello(text)}`;
      const shown = moodLine({
        speaker: node.speaker,
        text,
        kind: 'business',
        hour: hourRef.current,
      });
      emitDialog(node.speaker, shown.text, 'business', shown.mood);
      engine?.speak(node.speaker, shown.mood, 6);
      setExtra(null);
      setChat(null);
      setPendingPhone(null);
      setDialog({ nodeId, radio, engaged, key });
    },
    [nodeFor, away, engine, earn, commitMemory, welcomeText],
  );

  const openZoneDialog = useCallback(
    (z: ZoneId) => {
      const zn = zoneById(z);
      const radio = pendingRadio.current;
      pendingRadio.current = [];
      openNode(zn.root, radio, false);
      // The NPC reacts: a holiday line, a greeting the first time, «вернулся» after.
      const holiday = seasonLine(zn.speaker);
      const line = holiday
        ? { text: holiday.text, tags: ['joke'] }
        : picker.current?.pick(zn.speaker, [visited.current.has(z) ? 'return' : 'greet'], false);
      visited.current.add(z);
      if (!met.current.includes(zn.speaker)) met.current = [...met.current, zn.speaker];
      // «Давайте я вас запомню?» — once a visit, from the second zone or once
      // the visitor has told something, never during an order.
      if (
        !offered.current &&
        canOffer(memory.current, Date.now()) &&
        (visited.current.size >= 2 || contextFacts(ctxRef.current))
      ) {
        offered.current = true;
        window.setTimeout(() => {
          if (dialogRef.current?.engaged || orderOpen.current) {
            offered.current = false;
            return;
          }
          const who = offerSpeaker(zn.speaker);
          setMemoryNote({ mode: 'offer', speaker: who, text: OFFER_TEXT[who] });
        }, 3000);
      }
      earn({ type: 'talk', speaker: zn.speaker, all: ALL_SPEAKERS });
      if (line && engine) {
        const shown = moodLine({
          speaker: zn.speaker,
          text: line.text,
          kind: 'joke',
          tags: line.tags,
          hour: hourRef.current,
        });
        engine.say(`npc-${z}`, shown.text, 4.5, shown.mood);
        emitDialog(zn.speaker, shown.text, 'joke', shown.mood);
      }
    },
    [openNode, engine, earn, seasonLine],
  );

  // The film tour starts at the gate, with the foreman's greeting.
  useEffect(() => {
    if (phase === 'film' && !zone) setZone('gate');
  }, [phase, zone]);

  // Zone changes: sound events, the zone's dialogue unless the visitor is busy.
  useEffect(() => {
    const before = prevZone.current;
    prevZone.current = zone;
    if (before) for (const m of zoneById(before).machines) emitScene(m, false);
    if (zone) for (const m of zoneById(zone).machines) emitScene(m, true);
    engine?.setActiveZone(zone);
    if (zone) earn({ type: 'zone', zone, all: ALL_ZONES });
    if (dialogRef.current?.engaged) return;
    if (!zone) {
      setDialog(null);
      return;
    }
    openZoneDialog(zone);
    // Only when the zone itself changes.
  }, [zone]);

  const handoffToZone = useCallback(
    (z: ZoneId, next: OrderContext, from: SpeakerId) => {
      const target = zoneById(z).speaker;
      let c = next;
      if (contextFacts(next) && target !== from) {
        const radio = radioHandoff(from, target, next);
        logRadio(radio);
        pendingRadio.current = radio;
        c = { ...next, heardBy: uniq([...next.heardBy, from, target]) };
      }
      setCtx(c);
      ctxRef.current = c;
      setDialog(null);
      dialogRef.current = null;
      if (phase === '3d' && engine) engine.goToZone(z);
      if (phase === 'fallback' || phase === 'film' || zone === z) {
        setZone(z);
        openZoneDialog(z);
      }
    },
    [engine, logRadio, openZoneDialog, phase, zone],
  );

  const onReply = useCallback(
    (reply: Reply, speakerOverride?: SpeakerId) => {
      const current = dialogRef.current ? nodeFor(dialogRef.current.nodeId, ctxRef.current) : null;
      const speaker = speakerOverride ?? current?.speaker ?? 'mihalych';
      let next = applyReply(ctxRef.current, reply.label, reply.set);
      const action = reply.action;
      switch (action.kind) {
        case 'link':
          setCtx(next);
          return;
        case 'goto':
          setCtx(next);
          ctxRef.current = next;
          openNode(action.node, [], true, next);
          return;
        case 'zone':
          handoffToZone(action.zone, next, speaker);
          return;
        case 'show': {
          const z = next.machine ? MACHINE_ZONE[next.machine] : undefined;
          if (z) handoffToZone(z, next, speaker);
          return;
        }
        case 'next':
          setCtx(next);
          setDialog(null);
          if (mode === 'tour') engine?.next();
          return;
        case 'form': {
          const radio = speaker !== 'sveta' ? radioHandoff(speaker, 'sveta', next) : [];
          next = { ...next, heardBy: uniq([...next.heardBy, speaker, 'sveta' as const]) };
          setCtx(next);
          ctxRef.current = next;
          logRadio(radio);
          openNode(FORM_NODE, radio, true, next);
          return;
        }
      }
    },
    [engine, handoffToZone, logRadio, mode, nodeFor, openNode],
  );

  // Typing or speaking to someone holds the tour at this stop: the window must
  // not close under the visitor's fingers (owner, 2026-10-03).
  const engageDialog = useCallback(() => {
    setDialog((d) => (d && !d.engaged ? { ...d, engaged: true } : d));
  }, []);

  const closeDialog = () => {
    setDialog(null);
    setChat(null);
  };

  // ------------------------------------------------------------ free-text chat (rule-based, free)
  const sayAs = useCallback(
    (speaker: SpeakerId, text: string, quick: Quick[], kind: 'business' | 'joke' = 'business') => {
      const shown = moodLine({ speaker, text, kind, hour: hourRef.current });
      setChat({ speaker, text: shown.text, quick, mood: shown.mood });
      emitDialog(speaker, shown.text, kind, shown.mood);
      engine?.speak(speaker, shown.mood, 6);
    },
    [engine],
  );

  const weatherStory = useCallback(
    async (machine: MachineType, date: string, speaker: SpeakerId) => {
      const mod = brain.current;
      if (!mod) return;
      const forced = new URLSearchParams(window.location.search).get('forecast');
      const notesFor = async (day: string): Promise<Pick<WorkNote, 'level' | 'title'>[]> => {
        if (forced) {
          const titles: Record<string, string> = {
            wind: 'Ветер 13 м/с',
            rain: 'Дождь',
            frost: 'Мороз −27 °C',
            fog: 'Туман',
            heat: 'Жара 34 °C',
          };
          return day === date && titles[forced]
            ? [{ level: 'stop', title: titles[forced]! }]
            : [{ level: 'ok', title: 'Погода не мешает работе' }];
        }
        const response = await fetch(`/api/weather?date=${day}&kind=${machine}`);
        if (!response.ok) return [];
        const json = (await response.json()) as { notes?: WorkNote[] };
        return json.notes ?? [];
      };
      try {
        const hazard = mod.hazardOf(await notesFor(date));
        if (!hazard) return;
        // The nearest good day from the forecast (up to 9 days ahead), asked one by one.
        let okLabel: string | null = null;
        const base = Date.parse(`${date}T12:00:00Z`);
        for (let i = 1; i <= 9 && !okLabel; i++) {
          const day = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
          const ahead = (Date.parse(day) - Date.parse(mskToday())) / 86_400_000;
          if (ahead > 9) break;
          const notes = await notesFor(day);
          if (notes.length && !mod.hazardOf(notes)) {
            const d = new Date(Date.parse(`${day}T12:00:00Z`));
            okLabel = `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          }
        }
        const story = mod.weatherStory(hazard, machine, okLabel, Date.now());
        sayAs(speaker === 'sveta' ? 'mihalych' : speaker, story.text, story.quick, 'joke');
      } catch {
        // No forecast: the order goes on as usual.
      }
    },
    [sayAs],
  );

  const onChatSend = useCallback(
    async (text: string) => {
      const mod = brain.current ?? (await import('@/lib/stroyka/brain'));
      brain.current = mod;
      const current = dialogRef.current ? nodeFor(dialogRef.current.nodeId, ctxRef.current) : null;
      const speaker: SpeakerId = chat?.speaker ?? current?.speaker ?? 'mihalych';
      const jokes =
        linesMod.current?.LINES[speaker]
          .filter((l) => l.tags.includes('joke'))
          .map((l) => l.text) ?? [];
      const reply = mod.respond(text, speaker, ctxRef.current, new Date(), jokes);
      const told = nameFromText(text);
      if (told) rememberName(told);
      let next = applyReply(ctxRef.current, text.slice(0, 60), reply.set);
      let radio: RadioLine[] = [];
      if (reply.handoff && reply.handoff !== speaker) {
        radio = radioHandoff(speaker, reply.handoff, next);
        logRadio(radio);
        next = { ...next, heardBy: uniq([...next.heardBy, speaker, reply.handoff]) };
      }
      setCtx(next);
      ctxRef.current = next;
      setDialog((d) =>
        d
          ? { ...d, radio: radio.length ? radio : d.radio, engaged: true }
          : {
              nodeId: zone ? zoneById(zone).root : 'gate',
              radio,
              engaged: true,
              key: ++keyRef.current,
            },
      );
      sayAs(reply.handoff ?? reply.speaker, reply.text, reply.quick);
      if (reply.phone) setPendingPhone(reply.phone);
      if (reply.checkWeather)
        void weatherStory(reply.checkWeather.machine, reply.checkWeather.date, speaker);
    },
    [chat, logRadio, nodeFor, sayAs, weatherStory, zone],
  );

  const onChatQuick = (q: Quick) => {
    if (q.say) {
      void onChatSend(q.say);
      return;
    }
    const speaker = chat?.speaker ?? 'mihalych';
    if (q.action === 'call') {
      // A programmatic navigation: the site-wide tel: click tracker never sees it.
      reachGoal('call');
      window.location.href = SITE.phoneHref;
    } else if (q.action === 'smeta')
      window.location.href = smetaHref(ctxRef.current.task, ctxRef.current.machine);
    else if (q.action === 'form') onReply({ label: q.label, action: { kind: 'form' } }, speaker);
    else if (q.action === 'order-anyway') {
      const task = ctxRef.current.task
        ? `${ctxRef.current.task} (диспетчер решит на месте)`
        : 'по погоде решит диспетчер';
      onReply({ label: q.label, action: { kind: 'form' }, set: { task } }, speaker);
    } else if (q.action === 'other-day')
      sayAs(speaker, 'На какой день ставим?', [
        { label: 'Завтра', say: 'завтра' },
        { label: 'Послезавтра', say: 'послезавтра' },
        { label: 'На выходных', say: 'на выходных' },
        { label: 'Через 3 дня', say: 'через 3 дня' },
      ]);
  };

  const onSendPhone = async () => {
    if (!pendingPhone) return;
    setPhoneSending(true);
    try {
      await submitLead({
        phone: pendingPhone,
        message: orderSummary(ctxRef.current) || 'Заявка со стройки на сайте',
        source: 'stroyka',
        consent: true,
      });
      setPendingPhone(null);
      setCtx((c) => ({ ...c, sent: true }));
      sayAs('sveta', leadAcceptedText(isOnShift()), []);
      rollCredits();
    } catch (error) {
      sayAs('sveta', `Не ушло: ${leadErrorText(error, SITE.phone)}`, [
        { label: 'Позвонить', action: 'call' },
      ]);
    } finally {
      setPhoneSending(false);
    }
  };

  /** A text line under the business one; voiced only where a voice exists. */
  const sayExtra = useCallback(
    (speaker: SpeakerId, text: string, voiced: boolean) => {
      const shown = moodLine({ speaker, text, kind: 'joke', hour: hourRef.current });
      setExtra({ speaker, text: shown.text });
      if (!voiced) return;
      emitDialog(speaker, shown.text, 'joke', shown.mood);
      engine?.speak(speaker, shown.mood, 5);
    },
    [engine],
  );

  // A character in another zone remembers the visitor's job (once each, never
  // during the order itself). Dynamic text, so never a recorded voice.
  useEffect(() => {
    if (!dialog || dialog.engaged || order.open) return;
    const timer = window.setTimeout(() => {
      const node = nodeFor(dialog.nodeId, ctxRef.current);
      if (!node || node.form || dialogRef.current?.engaged) return;
      if (calledBack.current.has(node.speaker) || calledBack.current.size >= 3) return;
      const text = callbackLine(node.speaker, ctxRef.current);
      if (!text) return;
      calledBack.current.add(node.speaker);
      const recorded = (RECORDED_SPEAKERS as readonly string[]).includes(node.speaker);
      sayExtra(node.speaker, text, !recorded);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [dialog, nodeFor, order.open, sayExtra]);

  // A visitor who lingers gets a word from the character (under the business line).
  useEffect(() => {
    if (!dialog) return;
    const timer = window.setTimeout(() => {
      const node = nodeFor(dialog.nodeId, ctxRef.current);
      if (!node) return;
      // Now and then a bit of the character's own life instead of banter
      // (lib/stroyka/lines/inner.ts), never while the visitor is ordering.
      const busy = dialogRef.current?.engaged || node.form;
      if (!busy && innerTurn(innerAt.current, Date.now())) {
        const inner = pickInner(node.speaker, innerSaid.current, mskMoment(new Date()));
        if (inner) {
          innerSaid.current.add(inner.id);
          innerAt.current = Date.now();
          sayExtra(node.speaker, inner.text, inner.voiced);
          return;
        }
      }
      // Or what happens next on the object, so there is a reason to come back.
      if (
        !busy &&
        !hooksSaid.current.has(node.speaker) &&
        hooksSaid.current.size < 2 &&
        Math.random() < 0.35
      ) {
        hooksSaid.current.add(node.speaker);
        const recorded = (RECORDED_SPEAKERS as readonly string[]).includes(node.speaker);
        const p = progressRef.current;
        sayExtra(node.speaker, hookLine(node.speaker, p, nextStageDays(p)), !recorded);
        return;
      }
      if (!picker.current) return;
      const line = picker.current.pick(node.speaker, ['idle', 'joke']);
      if (!line) return;
      const shown = moodLine({
        speaker: node.speaker,
        text: line.text,
        kind: 'joke',
        tags: line.tags,
        hour: hourRef.current,
      });
      setExtra({ speaker: node.speaker, text: shown.text });
      emitDialog(node.speaker, shown.text, 'joke', shown.mood);
      engine?.speak(node.speaker, shown.mood, 5);
    }, 14_000);
    return () => window.clearTimeout(timer);
  }, [dialog, nodeFor, engine, sayExtra]);

  // ------------------------------------------------------------ the personal film
  const moment = useMemo<Moment>(
    () => ({
      ...mskMoment(now),
      rain: weather.rain > 0.05,
      snow: weather.snow > 0.05,
      fog: weather.fog > 0.4,
      wind: weather.wind >= 7,
      cold: weather.temp <= -10,
      heat: weather.temp >= 28,
    }),
    [now, weather],
  );
  const momentRef = useRef(moment);
  momentRef.current = moment;

  // A chapter title over the footage each time a zone opens (not under the
  // opening film, not with reduced motion).
  useEffect(() => {
    if (phase !== 'film' || !zone || filmOn || reduced) {
      setChapterCard(null);
      return;
    }
    setChapterCard((c) => ({ chapter: chapter(zone, momentRef.current), n: (c?.n ?? 0) + 1 }));
  }, [phase, zone, filmOn, reduced]);
  const closeChapter = useCallback(() => setChapterCard(null), []);

  // Consented memory follows the conversation (what is built, the machine, answers).
  useEffect(() => {
    const told: PersonalFacts = {
      task: ctx.task,
      machine: ctx.machine,
      // Chat answers, without anything that looks like a phone number.
      answers: ctx.answers.filter((a) => (a.match(/\d/g) ?? []).length < 6).slice(-6),
    };
    facts.current = { ...facts.current, ...told };
    if (hasConsent(memory.current)) commitMemory(rememberFacts(memory.current, told));
  }, [ctx.task, ctx.machine, ctx.answers, commitMemory]);

  // Zones seen: not personal, kept without consent.
  useEffect(() => {
    if (zone && !memory.current.zones.includes(zone))
      commitMemory({ ...memory.current, zones: [...memory.current.zones, zone] });
  }, [zone, commitMemory]);
  useEffect(() => {
    const n = chapterCard?.chapter.number;
    if (n && !memory.current.chapters.includes(n))
      commitMemory({ ...memory.current, chapters: [...memory.current.chapters, n] });
  }, [chapterCard, commitMemory]);

  const rememberName = useCallback(
    (name: string) => {
      facts.current = { ...facts.current, name };
      if (hasConsent(memory.current)) commitMemory(rememberFacts(memory.current, { name }));
    },
    [commitMemory],
  );

  // The order went through: end credits (and, with consent, the order status).
  const rollCredits = useCallback(() => {
    const c = ctxRef.current;
    setEndCredits(buildCredits(c, uniq([...met.current, ...c.heardBy])));
    const sent: PersonalFacts = { sent: true, sentMachine: c.machine };
    facts.current = { ...facts.current, ...sent };
    if (hasConsent(memory.current)) commitMemory(rememberFacts(memory.current, sent));
  }, [commitMemory]);

  // The in-world forms report a submit, not the result: the credits wait for
  // the form's own «Принято» panel. The name typed there is remembered too.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let poll = 0;
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form?.querySelector?.('input[name="phone"]')) return;
      const name = cleanName(form.querySelector<HTMLInputElement>('input[name="name"]')?.value);
      if (name) rememberName(name);
      window.clearInterval(poll);
      const started = Date.now();
      poll = window.setInterval(() => {
        if (root.querySelector('[role="status"] .stamp')) {
          window.clearInterval(poll);
          rollCredits();
        } else if (Date.now() - started > 20_000) window.clearInterval(poll);
      }, 400);
    };
    root.addEventListener('submit', onSubmit, true);
    return () => {
      root.removeEventListener('submit', onSubmit, true);
      window.clearInterval(poll);
    };
  }, [rememberName, rollCredits]);

  // «Да, запомни меня» / «Не сейчас» / «Забыть меня».
  const onMemoryYes = useCallback(() => {
    const who = memoryNote?.speaker ?? 'mihalych';
    const next = grantConsent(memory.current, facts.current, new Date(), mskToday());
    commitMemory(next);
    setMemoryNote({ mode: 'yes', speaker: who, text: offerYesText(who, next.name) });
  }, [commitMemory, memoryNote]);
  const onMemoryNo = useCallback(() => {
    const who = memoryNote?.speaker ?? 'mihalych';
    commitMemory(declineOffer(memory.current, Date.now()));
    setMemoryNote({ mode: 'no', speaker: who, text: offerNoText(who) });
  }, [commitMemory, memoryNote]);
  const onForget = useCallback(() => {
    const name = memory.current.name;
    commitMemory(forget(memory.current, Date.now()));
    facts.current = {};
    setMemoryNote({ mode: 'bye', speaker: 'mihalych', text: forgetText(name) });
  }, [commitMemory]);
  // The short answers fade by themselves.
  useEffect(() => {
    if (!memoryNote || memoryNote.mode === 'offer') return;
    const timer = window.setTimeout(() => setMemoryNote(null), 5500);
    return () => window.clearTimeout(timer);
  }, [memoryNote]);

  // When the object moves on next (for the hooks), through the progress API only.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const nextDays = useRef<{ p: WorldProgress; days: number | null } | null>(null);
  const nextStageDays = useCallback((p: WorldProgress) => {
    if (nextDays.current?.p !== p) nextDays.current = { p, days: daysToNextStage(p, Date.now()) };
    return nextDays.current.days;
  }, []);

  const closeCredits = useCallback(() => setEndCredits(null), []);

  // ------------------------------------------------------------ ambient banter, site events, radio
  const conditions = useMemo<LineConditions>(
    () => ({
      hour,
      rain: weather.rain > 0.05,
      snow: weather.snow > 0.05,
      fog: weather.fog > 0.4,
      wind: weather.wind >= 7,
      cold: weather.temp <= -10,
      heat: weather.temp >= 28,
      liftStop: lift.stop,
    }),
    [hour, weather, lift],
  );

  useEffect(() => {
    if (phase !== '3d' || !engine) return;
    let timer = 0;
    const tick = () => {
      timer = window.setTimeout(tick, 7000 + Math.random() * 5000);
      if (document.hidden || order.open || !picker.current || !linesMod.current) return;
      const near = engine
        .nearby(32)
        .filter((c) => !(dialogRef.current && c.zone && c.zone === zone))
        .slice(0, 4);
      if (!near.length) return;
      const who = near[Math.floor(Math.random() * near.length)]!;
      const tags = linesMod.current.conditionTags(conditions);
      const events: string[] = [];
      if (conditions.hour === 12) events.push('event:lunch');
      if (conditions.rain) events.push('event:mud');
      if (conditions.snow) events.push('event:snowclear');
      if (conditions.hour >= 22 || conditions.hour < 6) events.push('event:guard');
      if (conditions.wind) events.push('event:windcheck');
      events.push(
        ['event:smoke', 'event:search', 'event:concrete', 'dog'][Math.floor(Math.random() * 4)]!,
      );
      const r = Math.random();
      const want = r < 0.3 ? events : r < 0.6 ? tags : [];
      const holiday = seasonLine(who.speaker);
      // The crew speak as themselves (name and their own words) most of the time.
      const own = who.speaker === 'worker' && Math.random() < 0.65 ? crewLine(who.id) : null;
      const line = holiday
        ? { text: holiday.text, tags: ['joke'] }
        : own
          ? { text: own.text, tags: ['joke'] }
          : picker.current.pick(who.speaker, want);
      if (!line) return;
      const kind = line.tags.includes('business') ? 'business' : 'joke';
      const shown = moodLine({
        speaker: who.speaker,
        text: line.text,
        kind,
        tags: line.tags,
        hour: conditions.hour,
      });
      // The crew's bubble says who is talking; the voice says only the words.
      engine.say(who.id, own ? `${own.name}: ${shown.text}` : shown.text, 5.5, shown.mood);
      emitDialog(who.speaker, shown.text, kind, shown.mood);
      saveUsed(picker.current.used);
    };
    timer = window.setTimeout(tick, 4000);
    // Radio chatter now and then.
    const radioTimer = window.setInterval(() => {
      if (document.hidden || !picker.current) return;
      const pair = picker.current.radio(conditions);
      logRadio([
        { speaker: pair.a, text: pair.aText },
        { speaker: pair.b, text: pair.bText },
      ]);
    }, 38_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(radioTimer);
    };
  }, [phase, engine, order.open, zone, conditions, logRadio, seasonLine]);

  // ------------------------------------------------------------ film tour: nature and crew
  // The 3D engine tells the sound layer about the weather; the film tour has no
  // engine, so the page does it from the same time and forecast.
  const filmNatureKey = useMemo(
    () => (phase === 'film' ? JSON.stringify(filmNature(now, point, Boolean(season?.snow))) : null),
    [phase, now, point, season?.snow],
  );
  useEffect(() => {
    if (filmNatureKey) emitNature(JSON.parse(filmNatureKey));
  }, [filmNatureKey]);
  // Silence only when the film tour ends (not between two weather updates).
  const filmPhase = phase === 'film';
  useEffect(() => {
    if (filmPhase) return () => emitNature(null);
  }, [filmPhase]);

  // Background crew chatter over the footage (in 3D one hears them walking past).
  const [crewSub, setCrewSub] = useState<{ name: string; text: string; key: number } | null>(null);
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const filmChatter = phase === 'film' && !filmOn && !order.open;
  useEffect(() => {
    if (!filmChatter) return;
    // Someone is still talking until about this time (any line on the page).
    let busyUntil = 0;
    const onDialog = (event: Event) => {
      const detail = (event as CustomEvent<DialogEventDetail>).detail;
      if (!detail?.text || detail.speaker === 'dog') return;
      busyUntil = Math.max(busyUntil, Date.now() + 1500 + detail.text.length * 75);
    };
    window.addEventListener(DIALOG_EVENT, onDialog);
    let last: string | null = null;
    let timer = 0;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, ms);
    };
    const tick = () => {
      if (document.hidden) return;
      const wait = busyUntil - Date.now();
      if (wait > 0) return schedule(wait + 2500);
      const line = pickCrewLine(zoneRef.current, last);
      last = line.text;
      const shown = moodLine({
        speaker: 'worker',
        text: line.text,
        kind: 'joke',
        tags: ['joke'],
        hour: hourRef.current,
      });
      emitDialog('worker', shown.text, 'joke', shown.mood);
      setCrewSub({ name: line.name, text: shown.text, key: ++keyRef.current });
      schedule(crewDelay());
    };
    // Nothing runs while the tab is hidden; back on the tab, the next line comes later.
    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else schedule(crewDelay());
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) schedule(crewDelay());
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DIALOG_EVENT, onDialog);
      document.removeEventListener('visibilitychange', onVisibility);
      setCrewSub(null);
    };
  }, [filmChatter]);
  useEffect(() => {
    if (!crewSub) return;
    const timer = window.setTimeout(() => setCrewSub(null), 4500);
    return () => window.clearTimeout(timer);
  }, [crewSub]);

  // «Бетон» barks when tapped.
  const onDog = useCallback(() => {
    const text = 'Гав! 🐶';
    engine?.say('dog', text, 2.5);
    emitDialog('dog', text, 'joke', 'happy');
    earn({ type: 'dog' });
  }, [engine, earn]);

  // After the opening shot, once: how to lead the walk (nothing moves by itself).
  const navHinted = useRef(false);
  useEffect(() => {
    if (phase !== '3d' || !engine || introOn || filmOn || navHinted.current) return;
    navHinted.current = true;
    setToast(
      (t) => t ?? '👆 Коснитесь земли или человека — пойдём туда. Или «🧭 Куда идём?» внизу.',
    );
  }, [phase, engine, introOn, filmOn]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Arrived next to a person the visitor chose: talk. A zone character opens
  // the zone's conversation (the zone effect does it when the zone changed);
  // a crew member answers with a line of their own.
  const onPersonArrive = useCallback(
    (id: string, z?: ZoneId) => {
      if (z) {
        window.setTimeout(() => {
          if (!dialogRef.current) openZoneDialog(z);
        }, 250);
        return;
      }
      const line = crewLine(id);
      if (!line || !engine) return;
      engine.say(id, `${line.name}: ${line.text}`, 6, 'happy');
      emitDialog('worker', line.text, 'joke', 'happy');
    },
    [engine, openZoneDialog],
  );
  const goPlace = (z: ZoneId) => {
    const zn = zoneById(z);
    engine?.travelTo({ x: zn.stand[0], z: zn.stand[1], look: zn.focus });
  };
  const goSight = (id: string) => {
    const sight = NAV_SIGHTS.find((s) => s.id === id);
    if (sight) engine?.travelTo(sight.target);
  };

  // ------------------------------------------------------------ actions
  // A link, so a tap before hydration (slow phones, the loading screen) still
  // works: it reloads with ?order=1 and the panel opens on boot.
  const skipToOrder = (event?: { preventDefault(): void }) => {
    event?.preventDefault();
    setSkipTyping((n) => n + 1);
    engine?.skipIntro();
    if (mode === 'tour') setMode('free');
    const zoneMachine = zone ? zoneById(zone).order : undefined;
    setOrder({ open: true, machine: ctx.machine ?? zoneMachine ?? null });
  };
  const orderInWorld = () => {
    const current = dialog ? nodeFor(dialog.nodeId, ctx) : null;
    const zoneMachine = zone ? zoneById(zone).order : undefined;
    onReply(
      {
        label: 'Оформить заявку',
        action: { kind: 'form' },
        set: !ctx.machine && zoneMachine ? { machine: zoneMachine } : undefined,
      },
      current?.speaker ?? (zone ? zoneById(zone).speaker : 'mihalych'),
    );
  };
  const onFallbackZone = (z: ZoneId) => {
    setZone(z);
    if (zone === z) openZoneDialog(z);
  };

  const node = dialog ? nodeFor(dialog.nodeId, ctx) : null;
  const gateAway =
    dialog && welcome.current?.key === dialog.key ? `${welcomeText(welcome.current)} ` : '';
  const shownLine = chat
    ? { text: chat.text, mood: chat.mood }
    : node
      ? moodLine({
          speaker: node.speaker,
          text: `${gateAway}${gateAway ? withoutHello(node.text) : node.text}`,
          kind: 'business',
          hour,
        })
      : null;
  const loading = phase === '3d' && !engine;
  const closeFilm = useCallback(() => setFilmOn(false), []);
  const loadPct = Math.round(Math.max(loadSim, loadReal * 0.95 + 0.05) * 100);
  const steps = orderProgress(ctx);
  const zoneName = zone ? zoneById(zone).name : null;
  // Time and weather only after mount: the server does not know the visitor's clock.
  const badgeMachine = ctx.machine ?? (zone ? zoneById(zone).order : null);
  const chip =
    phase === 'boot' ? 'Челны' : conditionsLine(now, point || overrides.weather ? weather : null);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[80] overflow-hidden bg-slate-950 text-white"
      data-testid="stroyka"
    >
      <style dangerouslySetInnerHTML={{ __html: BUBBLE_CSS }} />

      {phase === '3d' && (
        <StroykaWorld
          mobile={mobile}
          input={input}
          telemetry={telemetry}
          onEngine={setEngine}
          onZone={setZone}
          onProgress={setLoadReal}
          onWantFree={() => setMode('free')}
          onAdClick={(target) => {
            if (target === 'smeta') window.location.href = '/smeta';
            else if (target === 'snab') window.location.href = '/smeta?mode=snab';
            else setOrder({ open: true, machine: target });
          }}
          onDog={onDog}
          onIntroEnd={() => setIntroOn(false)}
          onPerson={onPersonArrive}
          onError={() => setPhase('fallback')}
        />
      )}
      {/* The opening fly-over as a game cinematic: letterbox bars and titles. */}
      {phase === '3d' && engine && introOn && !filmOn && (
        <button
          type="button"
          data-testid="stroyka-cinematic"
          onClick={() => engine.skipIntro()}
          aria-label="Пропустить вступление"
          className="stroyka-cine absolute inset-0 z-[70] block cursor-pointer text-white"
        >
          <span className="stroyka-cine-bar absolute inset-x-0 top-0 h-[11vh] bg-black" />
          <span className="stroyka-cine-bar absolute inset-x-0 bottom-0 h-[11vh] bg-black" />
          <span className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="stroyka-cine-t1 font-mono text-xs uppercase tracking-[0.45em] text-amber-300 sm:text-sm">
              {SITE.name} представляет
            </span>
            <span className="stroyka-cine-t2 mt-3 text-5xl font-black tracking-[-0.04em] sm:text-7xl">
              {SITE.platform}
            </span>
            <span className="stroyka-cine-t3 mt-3 font-mono text-xs uppercase tracking-[0.3em] text-white/80 sm:text-sm">
              {chip}
            </span>
          </span>
          <span className="absolute bottom-[3vh] right-5 z-10 text-xs text-white/60">
            Коснитесь, чтобы пропустить
          </span>
        </button>
      )}
      {phase === 'film' && (
        <ZoneFilm
          active={zone}
          progress={progress}
          onZone={onFallbackZone}
          small={mobile}
          onForce3d={hasWebGL() ? () => setPhase('3d') : undefined}
          onOrder={() => skipToOrder()}
          paused={filmOn}
        />
      )}
      {chapterCard && (
        <ChapterCard key={chapterCard.n} chapter={chapterCard.chapter} onDone={closeChapter} />
      )}
      {phase === 'fallback' && (
        <FallbackMap
          active={zone}
          progress={progress}
          onZone={onFallbackZone}
          reducedMotion={reduced}
          onForce3d={hasWebGL() ? () => setPhase('3d') : undefined}
        />
      )}

      {/* Phones: the date, time and weather get their own row under the top bar. */}
      <div className="pointer-events-none absolute inset-x-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+3rem)] z-[65] sm:hidden">
        <WeatherBadge line={chip} machine={badgeMachine} />
      </div>

      {/* ---------------- top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[65] flex items-center gap-2 bg-gradient-to-b from-slate-950/90 to-transparent px-3 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <a
          href="/"
          className="pointer-events-auto flex shrink-0 items-center gap-2 font-extrabold"
          aria-label={`${SITE.platform} от ${SITE.name} — на главную`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 font-mono text-sm text-slate-950">
            ИИ
          </span>
          <span className="hidden sm:inline">
            {SITE.platform} <span className="text-amber-400">от {SITE.name}</span>
          </span>
        </a>
        <div className="hidden min-w-0 sm:block">
          <WeatherBadge line={chip} machine={badgeMachine} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SoundToggle className="pointer-events-auto" />
          <a
            href={SITE.phoneHref}
            data-testid="call-btn"
            className="pointer-events-auto rounded-full bg-white/10 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"
          >
            Позвонить
          </a>
          <a
            href="?order=1"
            data-testid="skip-to-order"
            onClick={skipToOrder}
            className="pointer-events-auto whitespace-nowrap rounded-full bg-amber-500 px-3 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-amber-600/30 hover:bg-amber-400"
          >
            <span className="sm:hidden">К заказу →</span>
            <span className="hidden sm:inline">Пропустить → к заказу</span>
          </a>
        </div>
      </header>

      {/* ---------------- mission card (left) and map (right) */}
      {phase !== 'boot' && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(5.25rem+env(safe-area-inset-top))] sm:top-[calc(3.5rem+env(safe-area-inset-top))] ${
            // The open phone menu lies over the dialogue, like any menu.
            hudOpen ? 'z-30' : 'z-10'
          } ${
            // On a phone the conversation takes the screen: the card and map step aside.
            dialog && mobile && !hudOpen ? 'hidden' : 'flex'
          } items-start justify-between gap-2 px-3 sm:px-4`}
        >
          <div className="pointer-events-auto flex max-w-[calc(100vw-8.75rem)] flex-col gap-1.5 sm:max-w-sm">
            <div className="rounded-xl bg-slate-950/70 px-3 py-2 backdrop-blur">
              <div
                data-testid="zone-title"
                className="font-mono text-xs uppercase tracking-widest text-amber-400"
              >
                {zoneName
                  ? `Зона: ${zoneName}`
                  : mode === 'tour'
                    ? 'Экскурсия по объекту'
                    : 'Свободная прогулка'}
              </div>
              <div className="truncate text-xs text-slate-200" data-testid="progress-line">
                {progressLine(progress)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="order-btn"
                  onClick={orderInWorld}
                  className="whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  Оформить заявку
                </button>
                <a
                  href={smetaHref(
                    ctx.task,
                    ctx.machine ?? (zone ? zoneById(zone).order : undefined),
                  )}
                  data-testid="smeta-btn"
                  className="whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
                >
                  <span className="sm:hidden">🧮 Смета</span>
                  <span className="hidden sm:inline">🧮 Рассчитать смету</span>
                </a>
                <button
                  type="button"
                  onClick={() => setCardOpen((v) => !v)}
                  aria-expanded={cardOpen}
                  className="flex items-center gap-1 text-[11px] text-slate-300"
                  data-testid="order-card-toggle"
                >
                  Заявка
                  <span className="flex gap-0.5" aria-hidden>
                    {steps.steps.map((s) => (
                      <span
                        key={s.key}
                        className={`h-2 w-2 rounded-sm ${s.done ? 'bg-emerald-400' : 'bg-slate-600'}`}
                      />
                    ))}
                  </span>
                  {steps.done}/5
                </button>
              </div>
              {cardOpen && (
                <dl
                  className="ym-hide-content mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-[11px]"
                  data-testid="order-card"
                >
                  {steps.steps.map((s) => (
                    <div key={s.key} className="contents">
                      <dt className="text-slate-400">{s.label}</dt>
                      <dd className={s.done ? 'text-emerald-300' : 'text-slate-500'}>
                        {s.value ?? '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
          {phase === '3d' && (
            <div className="pointer-events-auto relative flex flex-col items-end gap-1.5">
              <MiniMap telemetry={telemetry} active={zone} city={miniCity} />
              {/* On a phone the tools fold into one «⋯» button; from sm up they are always shown. */}
              <button
                type="button"
                data-testid="hud-menu"
                onClick={() => setHudOpen((v) => !v)}
                aria-expanded={hudOpen}
                aria-controls="stroyka-hud-tools"
                aria-label={hudOpen ? 'Скрыть меню' : 'Меню: экскурсия, вид, рация, значки, фото'}
                className="min-h-11 min-w-11 rounded-full bg-slate-950/75 px-3 text-lg font-bold leading-none backdrop-blur hover:bg-slate-800 sm:hidden"
              >
                {hudOpen ? '✕' : '⋯'}
              </button>
              <div
                id="stroyka-hud-tools"
                className={`${
                  hudOpen ? 'flex' : 'hidden'
                } absolute right-0 top-full mt-1.5 flex-col items-end gap-1.5 rounded-2xl bg-slate-950/90 p-2 shadow-2xl backdrop-blur sm:static sm:mt-0 sm:flex sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none`}
              >
                <button
                  type="button"
                  data-testid="mode-toggle"
                  onClick={() => {
                    setMode((m) => (m === 'tour' ? 'free' : 'tour'));
                    setHudOpen(false);
                  }}
                  className="rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-slate-800"
                >
                  {mode === 'tour' ? 'Свободная прогулка' : 'Экскурсия'}
                </button>
                {mode === 'free' && (
                  <button
                    type="button"
                    data-testid="view-toggle"
                    onClick={() => {
                      setView((v) => (v === 'fp' ? 'tp' : 'fp'));
                      setHudOpen(false);
                    }}
                    className="rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-slate-800"
                  >
                    {view === 'fp' ? 'Вид: от 3-го лица' : 'Вид: от 1-го лица'}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="radio-toggle"
                  onClick={() => setLogOpen((v) => !v)}
                  aria-expanded={logOpen}
                  className="rounded-full bg-emerald-900/70 px-3 py-1.5 text-xs font-semibold text-emerald-100 backdrop-blur"
                >
                  Рация{radioLog.length ? ` · ${radioLog.length}` : ''}
                </button>
                {logOpen && (
                  <div
                    data-testid="radio-log"
                    className="w-64 max-w-[70vw] rounded-xl border border-emerald-400/30 bg-slate-950/85 p-2 font-mono text-[11px] text-emerald-100 backdrop-blur"
                  >
                    {radioLog.length === 0 && (
                      <p className="text-emerald-300/60">Эфир пока тихий… кшш</p>
                    )}
                    {radioLog.slice(-6).map((line) => (
                      <p key={line.id}>
                        <b>
                          {line.speaker === 'worker'
                            ? 'Сторож'
                            : SPEAKERS[line.speaker as SpeakerId].name.split(' ').pop()}
                          :
                        </b>{' '}
                        <Censored text={line.text} />
                      </p>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="badges-toggle"
                  onClick={() => setShelfOpen((v) => !v)}
                  aria-expanded={shelfOpen}
                  className="rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-slate-800"
                >
                  🏅 Значки · {badges.earned.length}/{BADGES.length}
                </button>
                {shelfOpen && (
                  <div
                    data-testid="badge-shelf"
                    className="w-64 max-w-[70vw] rounded-xl border border-amber-400/30 bg-slate-950/85 p-2 text-[11px] backdrop-blur"
                  >
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-amber-400">
                      Значки прораба · для души
                    </div>
                    <ul className="grid gap-1">
                      {BADGES.map((b) => {
                        const got = badges.earned.includes(b.id);
                        return (
                          <li
                            key={b.id}
                            className={`flex items-center gap-2 ${got ? 'text-white' : 'text-slate-500'}`}
                          >
                            <span className={`text-base ${got ? '' : 'opacity-40 grayscale'}`}>
                              {b.icon}
                            </span>
                            <span>
                              <b className="font-semibold">{b.title}</b>
                              {!got && <span className="block text-[10px]">{b.hint}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {engine && <PhotoBooth snap={() => engine.snapshot()} />}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          data-testid="toast"
          className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-[66] mx-auto w-[min(90vw,30rem)] rounded-xl bg-slate-950/95 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl sm:top-[38%] sm:z-30"
        >
          {toast}
        </div>
      )}

      {/* ---------------- bottom: dialogue, joystick, talk */}
      {/* An open conversation is the main thing on screen: above the header,
          the mission card, the map, the bubbles and the toasts. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 ${
          dialog ? 'z-[60]' : 'z-20'
        } flex flex-col gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4`}
      >
        {phase === '3d' && !(dialog && mobile) && !order.open && (
          <div className="flex items-end justify-between">
            {mode === 'free' ? <Joystick input={input} /> : <span />}
            <div className="mb-2 flex flex-col items-end gap-2">
              {engine && !navOpen && (
                <button
                  type="button"
                  data-testid="nav-open"
                  onClick={() => setNavOpen(true)}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-black/30 hover:bg-amber-50"
                >
                  <span aria-hidden>🧭</span> Куда идём?
                </button>
              )}
              {!dialog && zone && (
                <button
                  type="button"
                  data-testid="talk-btn"
                  onClick={() => openZoneDialog(zone)}
                  className="pointer-events-auto rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
                >
                  Поговорить: {BANTER_NAMES[zoneById(zone).speaker]}
                </button>
              )}
            </div>
          </div>
        )}
        {phase === 'film' && crewSub && (
          <p
            key={crewSub.key}
            data-testid="crew-subtitle"
            aria-live="off"
            className="crew-sub max-w-[min(26rem,85vw)] self-start rounded-lg bg-slate-950/85 px-3 py-1.5 text-[13px] font-medium leading-snug text-white antialiased sm:text-sm"
          >
            <b className="font-semibold text-amber-300">{crewSub.name}:</b>{' '}
            <Censored text={crewSub.text} />
          </p>
        )}
        {phase !== '3d'
          ? !dialog &&
            zone && (
              <button
                type="button"
                data-testid="talk-btn"
                onClick={() => openZoneDialog(zone)}
                className="pointer-events-auto mx-auto mb-1 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
              >
                Поговорить: {BANTER_NAMES[zoneById(zone).speaker]}
              </button>
            )
          : null}
        {memoryNote && !(memoryNote.mode === 'offer' && (dialog?.engaged || order.open)) && (
          <MemoryOffer note={memoryNote} onYes={onMemoryYes} onNo={onMemoryNo} />
        )}
        {dialog && node && (
          <DialogueBox
            key={dialog.key}
            speaker={chat?.speaker ?? node.speaker}
            text={shownLine?.text ?? node.text}
            mood={shownLine?.mood}
            chat={{
              placeholder:
                (chat?.speaker ?? node.speaker) === 'sveta'
                  ? 'Напишите Свете…'
                  : (chat?.speaker ?? node.speaker) === 'mihalych'
                    ? 'Напишите прорабу…'
                    : 'Напишите машинисту…',
              quick: chat?.quick ?? [],
              onSend: (text) => void onChatSend(text),
              onQuick: (i) => chat?.quick[i] && onChatQuick(chat.quick[i]!),
              phone: pendingPhone,
              sending: phoneSending,
              onSendPhone: () => void onSendPhone(),
              onEngage: engageDialog,
            }}
            replies={node.replies}
            radio={dialog.radio}
            extra={extra}
            instant={reduced}
            skipTyping={skipTyping}
            onReply={(reply) => onReply(reply)}
            onClose={closeDialog}
            form={
              node.form && !chat
                ? {
                    message: orderSummary(ctx),
                    needAddress: !ctx.address,
                    onAddress: (address) => {
                      const next = applyReply(ctxRef.current, 'Адрес', { address });
                      setCtx(next);
                    },
                    onSubmit: () => setCtx((c) => ({ ...c, sent: true })),
                  }
                : null
            }
          />
        )}
        {consented && (
          <button
            type="button"
            data-testid="forget-me"
            onClick={onForget}
            className="pointer-events-auto mx-auto rounded-full bg-slate-950/85 px-3 py-1 text-sm font-semibold text-white/85 underline decoration-dotted underline-offset-2 hover:text-white"
          >
            Забыть меня
          </button>
        )}
        {/* Attribution: below everything, so it never covers the dialogue's ✕ or the HUD. */}
        {phase === '3d' && (
          <p className="pointer-events-auto text-center text-[10px] leading-tight text-white/60">
            <a href="/credits">© участники OpenStreetMap</a> · Погода: MET Norway
          </p>
        )}
      </div>

      {filmOn && phase !== 'boot' && (
        <StroykaFilm
          ready={phase === 'fallback' || phase === 'film' || Boolean(engine)}
          progress={loadPct}
          small={mobile}
          onClose={closeFilm}
        />
      )}

      {/* ---------------- loading screen */}
      {(loading || phase === 'boot') && (
        <div
          data-testid="loading"
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black px-6 text-center"
        >
          <div className="absolute inset-x-0 top-0 h-[12vh] bg-black" />
          <div className="font-mono text-xs uppercase tracking-[0.4em] text-amber-400">
            {SITE.name} представляет
          </div>
          <p className="mt-3 text-3xl font-extrabold sm:text-5xl">{SITE.platform}</p>
          <p className="mt-2 text-sm text-slate-400">Пройдись по объекту · {chip}</p>
          <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${loadPct}%` }} />
          </div>
          <div className="mt-2 font-mono text-xs text-slate-400" data-testid="loading-pct">
            Заезжаем на объект… {loadPct}%
          </div>
          <a
            href="?order=1"
            data-testid="loading-skip"
            onClick={skipToOrder}
            className="mt-8 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            Пропустить → к заказу
          </a>
        </div>
      )}

      {phase === '3d' && engine && (
        <NavChooser
          open={navOpen}
          active={zone}
          touring={mode === 'tour'}
          onClose={() => setNavOpen(false)}
          onPlace={goPlace}
          onPerson={(id) => engine.walkToPerson(id)}
          onSight={goSight}
          onTour={() => setMode((m) => (m === 'tour' ? 'free' : 'tour'))}
        />
      )}

      <OrderPanel
        open={order.open}
        machine={order.machine}
        ctx={ctx}
        onClose={() => setOrder({ open: false })}
        onSent={() => setCtx((c) => ({ ...c, sent: true }))}
      />

      {endCredits && <EndCredits credits={endCredits} onDone={closeCredits} />}

      {(phase === 'fallback' || phase === 'film') && (
        <div className="sr-only">{ZONES.map((z) => z.name).join(', ')}</div>
      )}
      {progressReady && phase === 'fallback' && (
        <div className="hidden">
          <Passport progress={progress} compact />
        </div>
      )}
      {DIALOGUE.gate ? null : null}
    </div>
  );
}
