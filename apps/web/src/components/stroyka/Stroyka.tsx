'use client';

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
import { stripEmoji } from '@/lib/stripEmoji';
import {
  DIALOGUE,
  dialogueNode,
  FORM_NODE,
  MACHINE_ZONE,
  nextZone,
  ORDER_LABEL,
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
import type { LinePicker } from '@/lib/stroyka/lines';
import {
  progressAt,
  progressFromUnits,
  progressLine,
  STAGES,
  worldProgress,
  type WorldProgress,
} from '@/lib/stroyka/progress';
import { loadUsed } from '@/lib/stroyka/shuffleBag';
import { moodLine, type Mood } from '@/lib/stroyka/mood';
import { seasonalEvent } from '@/lib/stroyka/seasonal';
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
import { Censored, DialogueBox } from './DialogueBox';
import { OrderPanel } from './OrderPanel';
import { StroykaFilm } from './StroykaFilm';
import { ZoneFilm } from './ZoneFilm';
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
  timeSlot,
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
  seedFromMemory,
  type PersonalFacts,
  type VisitorMemory,
} from '@/lib/stroyka/visitorMemory';
import { ChapterCard } from './ChapterCard';
import { noteDuration, noteVisible } from '@/lib/stroyka/memoryNote';
import { MemoryChip, MemoryOffer, type MemoryNote } from './MemoryOffer';
import { EndCredits } from './EndCredits';
import { WeatherBadge } from './WeatherBadge';

// 'film': real footage per stop (owner, 2026-10-03). There is no 3D world any
// more (owner, 2026-10-06: «Убери 3D мир полностью»).
type Phase = 'boot' | 'film';

interface DialogState {
  nodeId: string;
  radio: RadioLine[];
  /**
   * The visitor answered or typed: the tour holds at this stop. Whether a
   * zone change may replace the conversation is `busy()` (the chat field in
   * focus, Света's form or the order panel open); a zone the visitor picks
   * always opens.
   */
  engaged: boolean;
  key: number;
  /**
   * The zone line may start with «Ринат передал по рации: …». Each character
   * says it once a visit (and never right after a welcome that already named
   * the job), so the visitor does not hear the job again in every zone.
   */
  intro?: boolean;
}

const BUBBLE_CSS = `.stroyka-censor{color:#dc2626;font-weight:900}
        .crew-sub{animation:crew-sub 4.5s linear forwards}
        .crew-sub-text{text-shadow:0 1px 2px rgba(0,0,0,.9)}
        @keyframes crew-sub{0%{opacity:0}4%{opacity:1}95%{opacity:1}100%{opacity:0}}
        @media (prefers-reduced-motion:reduce){.crew-sub{animation:none}}`;

const CHAT_PLACEHOLDER: Record<SpeakerId, string> = {
  mihalych: 'Напишите прорабу…',
  rinat: 'Напишите машинисту…',
  ildar: 'Напишите крановщику…',
  sveta: 'Напишите Свете…',
  alsu: 'Напишите Алсу…',
};

const VISIT_KEY = 'stroyka.visit.v1';
const WEATHER_KEY = 'stroyka.weather.v1';

/** Every voice on the site, for «Знакомство со всеми». */

const uniq = <T,>(list: T[]) => [...new Set(list)];

export function Stroyka() {
  const [phase, setPhase] = useState<Phase>('boot');
  // The opening film, shown while the site loads (not with ?nofilm=1,
  // ?nointro=1, a direct order link or reduced motion).
  const [filmOn, setFilmOn] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  // Phone layout (below sm): the dialogue is a subtitle bar until «Ответить».
  const [phone, setPhone] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  // The memory offer folded into its chip «Запомнить меня?».
  const [memoryFolded, setMemoryFolded] = useState(false);
  const [overrides, setOverrides] = useState<SceneOverrides>({});
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogRef = useRef<DialogState | null>(null);
  dialogRef.current = dialog;
  const [ctx, setCtx] = useState<OrderContext>(emptyContext);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [order, setOrder] = useState<{ open: boolean; machine?: MachineType | null }>({
    open: false,
  });
  const orderOpen = useRef(false);
  orderOpen.current = order.open;
  const [skipTyping, setSkipTyping] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [point, setPoint] = useState<WeatherPoint | null>(null);
  const [progress, setProgress] = useState<WorldProgress>(() => worldProgress(Date.now(), null));
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
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [phoneSending, setPhoneSending] = useState(false);
  const brain = useRef<typeof import('@/lib/stroyka/brain') | null>(null);
  // The personal film: chapter cards, remembered jobs, inner lines, end credits.
  const [chapterCard, setChapterCard] = useState<{ chapter: Chapter; n: number } | null>(null);
  const [endCredits, setEndCredits] = useState<Credits | null>(null);
  const met = useRef<SpeakerId[]>([]);
  const innerSaid = useRef(new Set<string>());
  const innerAt = useRef<number | null>(null);
  const calledBack = useRef(new Set<SpeakerId>());
  const introSaid = useRef(new Set<SpeakerId>());
  // What the crew remember (lib/stroyka/visitorMemory.ts): read once on mount,
  // written on events only. Personal facts wait in `facts` until consent.
  const memory = useRef<VisitorMemory>(emptyMemory());
  const returning = useRef(false);
  const [consented, setConsented] = useState(false);
  const facts = useRef<PersonalFacts>({});
  const welcome = useRef<{
    key: number;
    greeting: string;
    known: string;
    speaker: SpeakerId;
  } | null>(null);
  const [memoryNote, setMemoryNote] = useState<MemoryNote | null>(null);
  const offered = useRef(false);
  const hooksSaid = useRef(new Set<SpeakerId>());
  const rootRef = useRef<HTMLDivElement>(null);
  const commitMemory = useCallback((next: VisitorMemory) => {
    memory.current = next;
    saveMemory(next);
    setConsented(hasConsent(next));
  }, []);

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

  // ------------------------------------------------------------ boot
  useEffect(() => {
    const ov = parseOverrides(window.location.search);
    setOverrides(ov);
    const params = new URLSearchParams(window.location.search);
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(prefersReduced);
    setMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    setPhone(window.matchMedia('(max-width: 639px)').matches);
    // Real footage per zone (owner, 2026-10-03: «не рисовать графику, склеить
    // ролик из настоящих съёмок»).
    setPhase('film');
    setFilmOn(
      !prefersReduced &&
        !['nofilm', 'nointro', 'order'].some((key) => params.get(key) === '1') &&
        params.get('film') !== '0',
    );
    if (ov.time) setNow(atMskTime(new Date(), ov.time.h, ov.time.m));
    if (params.get('order') === '1') setOrder({ open: true, machine: null });
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
      // With consent the visit starts where the last one stopped: the job,
      // the machine and the name are in the order (and the form) from the start.
      const seed = seedFromMemory(started.memory);
      if (seed.task || seed.machine || seed.name) {
        const c: OrderContext = { ...emptyContext(), ...seed };
        ctxRef.current = c;
        setCtx(c);
        facts.current = { ...seed };
      }
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
      if (!remember) return;
      try {
        const prev = JSON.parse(localStorage.getItem(VISIT_KEY) ?? 'null') as VisitSnapshot | null;
        const message = awayMessage(prev, p, Date.now());
        if (message) {
          setAway(message);
          // Filler («Работа идёт по плану.») is not news: no toast for it.
          if (awayTail(message)) setToast(message);
        }
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

  // ------------------------------------------------------------ dialogue
  const nodeFor = useCallback(
    (nodeId: string, c: OrderContext, intro = true): DialogNode | null => {
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
      if (intro && zoneRoot && contextFacts(c) && c.heardBy.includes(node.speaker))
        text = `${contextIntro(c, node.speaker)} ${text}`;
      if (node.id === 'gate-next') {
        // The foreman offers a rough estimate for the job (the /smeta calculator).
        text = `${text} Хочешь, прикину смету? Скажи размеры — посчитаю примерно, а Света уточнит.`;
        return {
          ...node,
          text,
          replies: [
            ...node.replies,
            {
              label: 'Прикинуть смету',
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
  }, []);

  /** The greeting plus «пока вас не было…» (the progress may arrive a moment later). */
  const welcomeText = useCallback(
    (w: { greeting: string; known: string; speaker: SpeakerId }) =>
      // «Имя, с возвращением! Пока вас не было: … В прошлый раз вы спрашивали про …»
      [w.greeting, awayTail(away, w.speaker), w.known].filter(Boolean).join(' '),
    [away],
  );

  const openNode = useCallback(
    (nodeId: string, radio: RadioLine[], engaged: boolean, c: OrderContext = ctxRef.current) => {
      const bare = nodeFor(nodeId, c, false);
      if (!bare) return;
      const key = ++keyRef.current;
      // A returning visitor: the first zone character greets them, by name
      // with consent, and says what changed and what was agreed last time.
      const zoneRoot = ZONES.some((z) => z.root === bare.id) && bare.id !== FORM_NODE;
      if (!welcome.current && zoneRoot && (returning.current || away)) {
        const m = memory.current;
        const ok = hasConsent(m);
        // After «Забыть меня» (or «Не сейчас») nobody claims to recognise the visitor.
        const g = pickGreeting(
          bare.speaker,
          ok ? m.name : undefined,
          m.greeting,
          Math.random,
          !ok && m.declinedAt !== undefined,
        );
        const known = ok
          ? [lastTimeLine(bare.speaker, m), orderStatusLine(bare.speaker, m)].filter(Boolean)
          : [];
        welcome.current = { key, greeting: g.text, known: known.join(' '), speaker: bare.speaker };
        commitMemory({ ...m, greeting: g.id });
        if (known.length) {
          // The greeting already named the job: this character has «heard» it,
          // so no «Слышал-слышал…» five seconds later and no «передал по рации».
          c = { ...c, heardBy: uniq([...c.heardBy, bare.speaker]) };
          ctxRef.current = c;
          setCtx(c);
          calledBack.current.add(bare.speaker);
          introSaid.current.add(bare.speaker);
        }
      }
      const intro = welcome.current?.key !== key && !introSaid.current.has(bare.speaker);
      if (intro && contextFacts(c) && c.heardBy.includes(bare.speaker))
        introSaid.current.add(bare.speaker);
      const node = nodeFor(nodeId, c, intro) ?? bare;
      let text = node.text;
      if (welcome.current?.key === key)
        text = `${welcomeText(welcome.current)} ${withoutHello(text)}`;
      const shown = moodLine({
        speaker: node.speaker,
        text,
        kind: 'business',
        hour: hourRef.current,
      });
      emitDialog(node.speaker, shown.text, 'business', shown.mood);
      dialogSpeaker.current = node.speaker;
      // An open offer to remember the visitor comes from whoever is talking now.
      if (node.speaker !== 'sveta' || nodeId !== FORM_NODE)
        setMemoryNote((n) =>
          n?.mode === 'offer' && n.speaker !== node.speaker
            ? { ...n, speaker: node.speaker, text: OFFER_TEXT[node.speaker] }
            : n,
        );
      setExtra(null);
      setChat(null);
      setPendingPhone(null);
      setDialog({ nodeId, radio, engaged, key, intro });
    },
    [nodeFor, away, commitMemory, welcomeText],
  );

  // The visitor is busy (nothing replaces the conversation, no offer pops up):
  // the chat field in focus, Света's order form on screen or the order panel open.
  const chatFocus = useRef(false);
  const [typing, setTyping] = useState(false);
  const busy = useCallback(
    () =>
      chatFocus.current ||
      orderOpen.current ||
      (!!dialogRef.current && dialogRef.current.nodeId === FORM_NODE),
    [],
  );
  /** Who speaks in the open conversation (the offer comes from them). */
  const dialogSpeaker = useRef<SpeakerId | null>(null);
  // A zone the visitor chose (strip, swipe, «Дальше по объекту», «Показать технику»).
  const pickedZone = useRef<ZoneId | null>(null);

  const openZoneDialog = useCallback(
    (z: ZoneId) => {
      const zn = zoneById(z);
      const radio = pendingRadio.current;
      pendingRadio.current = [];
      openNode(zn.root, radio, false);
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
          if (busy()) {
            offered.current = false;
            return;
          }
          const who = offerSpeaker(dialogSpeaker.current ?? zn.speaker);
          setMemoryFolded(false);
          setMemoryNote({ mode: 'offer', speaker: who, text: OFFER_TEXT[who] });
        }, 3000);
      }
    },
    [openNode, busy],
  );

  /** The visitor chose a zone: it opens now, whatever was on screen. */
  const pickZone = useCallback(
    (z: ZoneId) => {
      chatFocus.current = false;
      setTyping(false);
      setReplyOpen(false);
      if (zone === z) {
        openZoneDialog(z);
        return;
      }
      pickedZone.current = z;
      setZone(z);
    },
    [zone, openZoneDialog],
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
    // A zone the visitor picked always opens; walking or the tour into a zone
    // waits only while the visitor is typing, filling in the form or ordering.
    const picked = pickedZone.current === zone;
    pickedZone.current = null;
    if (!picked && busy()) return;
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
      pickZone(z);
    },
    [logRadio, pickZone],
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
          ctxRef.current = next;
          // The film goes to the next stop and opens it.
          pickZone(nextZone(zone ?? 'gate'));
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
    [handoffToZone, logRadio, nodeFor, openNode, pickZone, zone],
  );

  // Typing or speaking to someone holds the tour at this stop: the window must
  // not close under the visitor's fingers (owner, 2026-10-03).
  const engageDialog = useCallback(() => {
    chatFocus.current = true;
    setTyping(true);
    setDialog((d) => (d && !d.engaged ? { ...d, engaged: true } : d));
  }, []);
  const releaseDialog = useCallback(() => {
    chatFocus.current = false;
    setTyping(false);
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
    },
    [],
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
        const teller = speaker === 'sveta' ? 'mihalych' : speaker;
        const story = mod.weatherStory(hazard, machine, okLabel, Date.now(), teller);
        sayAs(teller, story.text, story.quick, 'joke');
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
        name: ctxRef.current.name,
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
  const sayExtra = useCallback((speaker: SpeakerId, text: string, voiced: boolean) => {
    const shown = moodLine({ speaker, text, kind: 'joke', hour: hourRef.current, plain: true });
    setExtra({ speaker, text: shown.text });
    if (!voiced) return;
    emitDialog(speaker, shown.text, 'joke', shown.mood);
  }, []);

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
    }, 14_000);
    return () => window.clearTimeout(timer);
  }, [dialog, nodeFor, sayExtra]);

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

  // A chapter title over the footage on each cut to a zone (ZoneFilm's onCut:
  // the new shot is already on screen). Not under the opening film, not with
  // reduced motion, and never over an expanded phone dialogue, an open memory
  // offer, the order or a visitor who is typing.
  const cardBlocked = useRef(false);
  const onCut = useCallback(
    (z: ZoneId) => {
      if (phase !== 'film' || filmOn || reduced || cardBlocked.current) return;
      setChapterCard((c) => ({ chapter: chapter(z, momentRef.current), n: (c?.n ?? 0) + 1 }));
    },
    [phase, filmOn, reduced],
  );
  useEffect(() => {
    if (phase !== 'film' || filmOn || reduced) setChapterCard(null);
  }, [phase, filmOn, reduced]);
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
      // For this visit: the radio, the form and the credits call the visitor by name.
      ctxRef.current = { ...ctxRef.current, name };
      setCtx((c) => ({ ...c, name }));
      if (hasConsent(memory.current)) commitMemory(rememberFacts(memory.current, { name }));
    },
    [commitMemory],
  );

  // The order went through: end credits (and, with consent, the order status).
  const rollCredits = useCallback(() => {
    const c = ctxRef.current;
    setEndCredits(buildCredits(c, uniq([...met.current, ...c.heardBy]), c.name));
    const sent: PersonalFacts = { sent: true, sentMachine: c.machine, sentAt: Date.now() };
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
    setMemoryNote({ mode: 'bye', speaker: 'sveta', text: forgetText(name) });
  }, [commitMemory]);
  // The short answers fade by themselves (the long «Забыть меня» one stays
  // at least 10 s) or go on a tap.
  useEffect(() => {
    if (!memoryNote) return;
    const ms = noteDuration(memoryNote.mode, memoryNote.text);
    if (ms === null) return;
    const timer = window.setTimeout(() => setMemoryNote(null), ms);
    return () => window.clearTimeout(timer);
  }, [memoryNote]);
  const dismissNote = useCallback(() => setMemoryNote(null), []);

  // When the object moves on next (for the hooks), through the progress API only.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const nextDays = useRef<{ p: WorldProgress; days: number | null } | null>(null);
  const nextStageDays = useCallback((p: WorldProgress) => {
    if (nextDays.current?.p !== p) nextDays.current = { p, days: daysToNextStage(p, Date.now()) };
    return nextDays.current.days;
  }, []);

  const closeCredits = useCallback(() => {
    setEndCredits(null);
  }, []);

  // ------------------------------------------------------------ film tour: nature and crew
  // The page tells the sound layer about the weather, from the time and forecast.
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

  // Background crew chatter over the footage.
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
        plain: true,
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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ------------------------------------------------------------ actions
  // A link, so a tap before hydration (slow phones, the loading screen) still
  // works: it reloads with ?order=1 and the panel opens on boot.
  const skipToOrder = (event?: { preventDefault(): void }) => {
    event?.preventDefault();
    setSkipTyping((n) => n + 1);
    const zoneMachine = zone ? zoneById(zone).order : undefined;
    setOrder({ open: true, machine: ctx.machine ?? zoneMachine ?? null });
  };
  const orderInWorld = () => {
    const current = dialog ? nodeFor(dialog.nodeId, ctx) : null;
    const zoneMachine = zone ? zoneById(zone).order : undefined;
    onReply(
      {
        label: ORDER_LABEL,
        action: { kind: 'form' },
        set: !ctx.machine && zoneMachine ? { machine: zoneMachine } : undefined,
      },
      current?.speaker ?? (zone ? zoneById(zone).speaker : 'mihalych'),
    );
  };
  const onFallbackZone = (z: ZoneId) => pickZone(z);

  const node = dialog ? nodeFor(dialog.nodeId, ctx, dialog.intro ?? true) : null;
  const formOpen = !!node?.form && !chat;
  // Phones: the dialogue is a lower-third subtitle bar; «Ответить», the form,
  // a phone number or typing open the full box. From sm up it is always full.
  const expanded = !!dialog && (!phone || replyOpen || formOpen || typing || !!pendingPhone);
  const phoneBar = phone && phase === 'film';
  const showNote = noteVisible(memoryNote?.mode, {
    typing,
    orderOpen: order.open,
    formOpen,
    folded: memoryFolded,
    phone,
    expanded,
  });
  const showChip =
    memoryNote?.mode === 'offer' && memoryFolded && !(phone && expanded) && !order.open;
  const clean = !!chapterCard;
  cardBlocked.current =
    (phone && expanded) || (showNote && memoryNote?.mode === 'offer') || order.open || typing;
  // The offer folds into its chip after ~8 s on screen (not counting the clean frame).
  const offerVisible = showNote && memoryNote?.mode === 'offer' && !clean;
  useEffect(() => {
    if (!offerVisible) return;
    const timer = window.setTimeout(() => setMemoryFolded(true), 8000);
    return () => window.clearTimeout(timer);
  }, [offerVisible]);
  // The height of what the bottom block shows (the subtitle bar or the box),
  // for the strip above it. The block itself is full height and never moves
  // (a growing bottom-anchored block counts as a layout shift); its children
  // sit at its bottom, and the topmost one sets --sp-bottom. On phones the
  // subtitle bar's height is reserved (data-min) before it mounts.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const col = bottomRef.current;
    const root = rootRef.current;
    if (!col || !root || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      let top = col.clientHeight;
      for (const child of Array.from(col.children) as HTMLElement[])
        if (child.offsetHeight) top = Math.min(top, child.offsetTop);
      const used = Math.max(col.clientHeight - top, Number(col.dataset.min || 0));
      root.style.setProperty('--sp-bottom', `${Math.round(used)}px`);
    };
    const ro = new ResizeObserver(update);
    const watch = () => {
      ro.disconnect();
      ro.observe(col);
      for (const child of Array.from(col.children)) ro.observe(child);
      update();
    };
    const mo = new MutationObserver(watch);
    mo.observe(col, { childList: true, attributes: true, attributeFilter: ['data-min'] });
    watch();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
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
  const closeFilm = useCallback(() => setFilmOn(false), []);
  const steps = orderProgress(ctx);
  const zoneName = zone ? zoneById(zone).name : null;
  // Time and weather only after mount: the server does not know the visitor's clock.
  const badgeMachine = ctx.machine ?? (zone ? zoneById(zone).order : null);
  const chip =
    phase === 'boot' ? 'Челны' : conditionsLine(now, point || overrides.weather ? weather : null);
  // The footage is always shot by day: grade it by the site's clock.
  const slot = timeSlot(hour);
  const tint = slot === 'night' ? 'night' : slot === 'evening' ? 'evening' : null;

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-[80] overflow-hidden bg-slate-950 text-white ${clean ? 'sp-clean' : ''}`}
      data-testid="stroyka"
    >
      <style dangerouslySetInnerHTML={{ __html: BUBBLE_CSS }} />

      {phase === 'film' && (
        <ZoneFilm
          active={zone}
          onZone={onFallbackZone}
          small={mobile}
          onCut={onCut}
          matte={chapterCard?.n ?? 0}
          tint={tint}
          shade={expanded ? 'high' : 'low'}
          paused={filmOn}
        />
      )}
      {chapterCard && (
        <ChapterCard key={chapterCard.n} chapter={chapterCard.chapter} onDone={closeChapter} />
      )}
      {/* Phones: the date, time and weather get their own row under the top bar. */}
      <div className="sp-cleanable pointer-events-none absolute inset-x-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+3rem)] z-[65] sm:hidden">
        <WeatherBadge line={chip} machine={badgeMachine} />
      </div>

      {/* ---------------- top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[65] flex items-center gap-2 bg-gradient-to-b from-slate-950/90 to-transparent px-3 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <a
          href="/"
          className="pointer-events-auto flex min-h-11 shrink-0 items-center gap-2 font-extrabold"
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
          <SoundToggle large className="pointer-events-auto" />
          <a
            href={SITE.phoneHref}
            data-testid="call-btn"
            className="pointer-events-auto inline-flex min-h-11 items-center rounded-full bg-white/10 px-3 text-sm font-semibold backdrop-blur hover:bg-white/20"
          >
            Позвонить
          </a>
          <a
            href="?order=1"
            data-testid="skip-to-order"
            onClick={skipToOrder}
            className="pointer-events-auto inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-amber-500 px-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-600/30 hover:bg-amber-400"
          >
            <span className="sm:hidden">К заказу →</span>
            <span className="hidden sm:inline">Пропустить → к заказу</span>
          </a>
        </div>
      </header>

      {/* ---------------- mission card */}
      {phase !== 'boot' && (
        <div
          className={`sp-cleanable pointer-events-none absolute inset-x-0 top-[calc(5.25rem+env(safe-area-inset-top))] sm:top-[calc(3.5rem+env(safe-area-inset-top))] z-10 ${
            // On a phone the conversation takes the screen: the card steps aside.
            dialog && mobile ? 'hidden' : 'flex'
          } items-start justify-between gap-2 px-3 sm:px-4`}
        >
          <div className="pointer-events-auto flex max-w-[calc(100vw-8.75rem)] flex-col gap-1.5 sm:max-w-sm">
            <div className="rounded-xl bg-slate-950/70 px-3 py-2 backdrop-blur">
              <div
                data-testid="zone-title"
                className="font-mono text-xs uppercase tracking-widest text-amber-400"
              >
                {zoneName ? `Зона: ${zoneName}` : 'Свободная прогулка'}
              </div>
              <div className="truncate text-xs text-slate-200" data-testid="progress-line">
                {progressLine(progress)}
              </div>
              {/* The object is a game scene, not a real job (review, round 2). */}
              <div className="text-[10px] leading-tight text-slate-400" data-testid="object-hint">
                игровой объект, для примера
              </div>
              {/* The object's passport, folded into this card (one «Объект: … этап»). */}
              {phase === 'film' && (
                <div
                  className="mt-1.5 flex gap-0.5"
                  aria-label={`Этап ${progress.stage + 1} из ${STAGES.length}`}
                >
                  {STAGES.map((stage, i) => (
                    <span
                      key={stage.key}
                      title={stage.name}
                      className={`h-1.5 flex-1 rounded-sm ${
                        i < progress.stage
                          ? 'bg-emerald-500'
                          : i === progress.stage
                            ? 'bg-amber-400'
                            : 'bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="order-btn"
                  onClick={orderInWorld}
                  className="whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400"
                >
                  {ORDER_LABEL}
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
        </div>
      )}

      {toast && (
        <div
          data-testid="toast"
          className="sp-cleanable pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-[66] mx-auto w-[min(90vw,30rem)] rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl sm:top-[38%] sm:z-30"
        >
          {toast}
        </div>
      )}

      {/* ---------------- bottom: dialogue, talk */}
      {/* An open conversation is the main thing on screen: above the header,
          the mission card, the map, the bubbles and the toasts. */}
      {/* Phones, film: the crew's chatter, the memory offer and its chip sit
        just above the zone strip, out of the bottom block, so nothing in it
        moves when they come and go. */}
      {phoneBar && crewSub && !showNote && !(phone && expanded) && (
        <p
          key={crewSub.key}
          data-testid="crew-subtitle"
          aria-live="off"
          className={`crew-sub sp-cleanable pointer-events-none absolute inset-x-3 z-[61] text-center ${
            showChip
              ? 'bottom-[calc(var(--sp-bottom,10rem)+7rem)]'
              : 'bottom-[calc(var(--sp-bottom,10rem)+3.75rem)]'
          }`}
        >
          <span className="crew-sub-text inline rounded-md bg-black/60 px-2 py-1 text-[15px] font-bold leading-relaxed text-white antialiased [box-decoration-break:clone]">
            <b className="font-extrabold text-amber-300">{crewSub.name}:</b>{' '}
            <Censored text={stripEmoji(crewSub.text)} />
          </span>
        </p>
      )}
      {phone && (showNote || showChip) && memoryNote && (
        <div className="sp-cleanable absolute inset-x-2 bottom-[calc(var(--sp-bottom,10rem)+3.5rem)] z-[61] flex">
          {showNote ? (
            <MemoryOffer
              note={memoryNote}
              onYes={onMemoryYes}
              onNo={onMemoryNo}
              onFold={() => setMemoryFolded(true)}
              onDismiss={dismissNote}
            />
          ) : (
            <MemoryChip onOpen={() => setMemoryFolded(false)} />
          )}
        </div>
      )}
      <div
        ref={bottomRef}
        // The subtitle bar (9.25rem) and the bottom padding, reserved from the first frame.
        data-min={phoneBar ? 156 : 0}
        className={`pointer-events-none absolute inset-0 ${
          dialog ? 'z-[60]' : 'z-20'
        } flex flex-col justify-end gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4`}
      >
        {phase === 'film' && !phone && crewSub && (
          <p
            key={crewSub.key}
            data-testid="crew-subtitle"
            aria-live="off"
            className="crew-sub sp-cleanable max-w-[min(40rem,90vw)] self-center text-center"
          >
            <span className="crew-sub-text inline rounded-md bg-black/60 px-2.5 py-1 text-[17px] font-bold leading-relaxed text-white antialiased [box-decoration-break:clone]">
              <b className="font-extrabold text-amber-300">{crewSub.name}:</b>{' '}
              <Censored text={stripEmoji(crewSub.text)} />
            </span>
          </p>
        )}
        {!dialog && zone && (
          <button
            type="button"
            data-testid="talk-btn"
            onClick={() => openZoneDialog(zone)}
            className="pointer-events-auto mx-auto mb-1 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950"
          >
            Поговорить: {BANTER_NAMES[zoneById(zone).speaker]}
          </button>
        )}
        {!phone && showNote && memoryNote && (
          <div className="sp-cleanable">
            <MemoryOffer
              note={memoryNote}
              onYes={onMemoryYes}
              onNo={onMemoryNo}
              onFold={() => setMemoryFolded(true)}
              onDismiss={dismissNote}
            />
          </div>
        )}
        {!phone && showChip && (
          <div className="sp-cleanable mx-auto flex w-full max-w-2xl">
            <MemoryChip onOpen={() => setMemoryFolded(false)} />
          </div>
        )}
        {dialog && node && (
          <DialogueBox
            key={dialog.key}
            speaker={chat?.speaker ?? node.speaker}
            text={shownLine?.text ?? node.text}
            mood={shownLine?.mood}
            chat={{
              placeholder: CHAT_PLACEHOLDER[chat?.speaker ?? node.speaker],
              quick: chat?.quick ?? [],
              onSend: (text) => void onChatSend(text),
              onQuick: (i) => chat?.quick[i] && onChatQuick(chat.quick[i]!),
              phone: pendingPhone,
              sending: phoneSending,
              onSendPhone: () => void onSendPhone(),
              onEngage: engageDialog,
              onRelease: releaseDialog,
            }}
            // One call button in the row: the chat's own «Позвонить» replaces the line's.
            replies={
              chat?.quick.some((q) => q.action === 'call')
                ? node.replies.filter(
                    (r) => !(r.action.kind === 'link' && r.action.href.startsWith('tel:')),
                  )
                : node.replies
            }
            radio={dialog.radio}
            extra={extra}
            instant={reduced}
            skipTyping={skipTyping}
            collapsed={phone && !expanded}
            onExpand={() => setReplyOpen(true)}
            onCollapse={
              phone && !formOpen && !pendingPhone && !typing ? () => setReplyOpen(false) : undefined
            }
            onReply={(reply) => onReply(reply)}
            onClose={closeDialog}
            form={
              node.form && !chat
                ? {
                    message: orderSummary(ctx),
                    name: ctx.name,
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
            className="pointer-events-auto mx-auto inline-flex min-h-11 items-center rounded-full bg-slate-950/85 px-3 text-sm font-semibold text-white/85 underline decoration-dotted underline-offset-2 hover:text-white"
          >
            Забыть меня
          </button>
        )}
      </div>

      {filmOn && phase !== 'boot' && <StroykaFilm small={mobile} onClose={closeFilm} />}

      {/* ---------------- loading screen */}
      {phase === 'boot' && (
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

      <OrderPanel
        open={order.open}
        machine={order.machine}
        ctx={ctx}
        onClose={() => setOrder({ open: false })}
        onSent={() => setCtx((c) => ({ ...c, sent: true }))}
      />

      {endCredits && <EndCredits credits={endCredits} onDone={closeCredits} />}

      {phase === 'film' && <div className="sr-only">{ZONES.map((z) => z.name).join(', ')}</div>}
      {DIALOGUE.gate ? null : null}
    </div>
  );
}
