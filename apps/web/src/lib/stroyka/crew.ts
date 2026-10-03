// The crew of the 3D site by name (owner, 2026-10-03: «люди многонациональные,
// говорят по-русски с акцентом, всё реалистично»). Like a real site in
// Naberezhnye Chelny: Tatars, Russians, Bashkirs, Chuvash, Uzbeks, Kazakhs,
// Armenians, Azerbaijanis. The «accent» is the words people really slip into
// Russian — greetings, thanks, a friendly «брат» / «ака» / «джан» — never
// broken grammar or jokes about where someone is from: everyone here is a
// professional, the humour is about the job.

export type CrewMember = { name: string; from: string; lines: string[] };

export const CREW: Record<string, CrewMember> = {
  'worker-pit': {
    name: 'Рустам',
    from: 'Узбекистан',
    lines: [
      'Ассалому алейкум, ака! Траншею докопали, Ринат-ака аккуратно работает.',
      'Рахмат, брат, что каску надел. Тут техника ходит.',
      'Яхши, яхши! Котлован ровный, как поле у дедушки в Фергане.',
      'Обед будет — плов принесу. Настоящий, с казана, не магазинный.',
      'Самосвал пришёл — значит, жизнь идёт. Нет самосвала — жди, чай пей.',
      'Ака, тут кабель отмечен. Ковшом не надо — лопатой аккуратно.',
    ],
  },
  'worker-sling': {
    name: 'Армен',
    from: 'Армения',
    lines: [
      'Вира, джан, вира помалу! Вот так, красиво пошла.',
      'Ильдар-джан на кране — как музыкант: плиту ставит, будто на рояле играет.',
      'Стропы проверил три раза, ахпер. На высоте мелочей нет.',
      'Ара, кто под стрелой стоит? Отойди, дорогой, пожалуйста.',
      'Плита легла — как родная. Слушай, вот за это я свою работу люблю.',
    ],
  },
  'worker-yard': {
    name: 'Айдар',
    from: 'Башкортостан',
    lines: [
      'Һаумыһығыҙ! Поддоны разгрузили, блоки на месте.',
      'Рәхмәт, Алсу-апа, всё по накладной сошлось.',
      'Манипулятор приехал — одним рейсом три поддона. Красота, ей-богу.',
      'У нас в Уфе говорят: торопись медленно. Особенно когда кран работает.',
      'Блок к блоку, как мёд в соты. Башкирский мёд, конечно.',
    ],
  },
  'worker-road': {
    name: 'Нурлан',
    from: 'Казахстан',
    lines: [
      'Сәлеметсіз бе! Дорогу укатали — хоть на коне скачи.',
      'Каток прошёл — жақсы, ровно. Самосвал прошёл — опять каток зову.',
      'Рахмет, брат, что объехал. Тут щебень свежий.',
      'В степи дорога — где проехал. Тут — где Михалыч разметил.',
      'Бульдозерист у нас — батыр. Полплощадки за смену разровнял.',
    ],
  },
  'worker-walk': {
    name: 'Эльчин',
    from: 'Азербайджан',
    lines: [
      'Салам алейкум, гардаш! Сейчас пройдём, только осторожно — машина сдаёт.',
      'Чай будешь? Армуды стаканчик есть, с бергамотом, настоящий.',
      'Сағ ол, что подождал. Самосвал задом — тут глаз да глаз.',
      'Михалыч сказал «бегом», я сказал «аккуратно». Оба правы, слушай.',
      'Бетон приедет — будет праздник. Без бетона и стройка — не стройка.',
    ],
  },
  guard: {
    name: 'Николай Петрович',
    from: 'Набережные Челны',
    lines: [
      'Стой, кто идёт? А, гость. Каску возьми в будке, сынок.',
      'Двадцать лет на КамАЗе отъездил, теперь объект охраняю. Технику по звуку узнаю.',
      'Ночью тут тихо. Только прожектор гудит да кошка наша ходит.',
      'Ворота в восемь открываю — первым всегда Ринат. Самосвалы — вторые.',
      'Чужим нельзя, а вам — пожалуйста. Только по дорожке, там техника.',
    ],
  },
};

/** Who speaks how in the recordings (voice, pace, pitch): see scripts/stroyka-voices.py. */
export const CREW_VOICE: Record<string, string> = {
  'worker-pit': 'crew-rustam',
  'worker-sling': 'crew-armen',
  'worker-yard': 'crew-aidar',
  'worker-road': 'crew-nurlan',
  'worker-walk': 'crew-elchin',
  guard: 'crew-nikolai',
};

/** A line from this crew member, or null if the id is not crew. */
export function crewLine(
  id: string,
  avoid?: string,
  random = Math.random,
): { name: string; text: string } | null {
  const m = CREW[id];
  if (!m) return null;
  const pool = m.lines.length > 1 && avoid ? m.lines.filter((l) => l !== avoid) : m.lines;
  return { name: m.name, text: pool[Math.floor(random() * pool.length) % pool.length]! };
}
