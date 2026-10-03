// Photos of the exact models in the СпецПласт16 fleet (Wikimedia Commons,
// CC0 / CC BY / CC BY-SA, credited on /credits). They are the same model, not
// our machine, and the site says so («Фото модели»). A machine's own photos
// (imageUrls) always come first.

const MODELS: [RegExp, string, number][] = [
  [/jcb\s*4cx/i, 'jcb-4cx', 2],
  [/case\s*570/i, 'case-570', 2],
  [/hidromek/i, 'hidromek-102b', 2],
  [/lgce|sdlg|b877/i, 'lgce-b877f', 1],
  [/32\s*т/i, 'crane-32t', 2],
  [/кс-?55716|автокран/i, 'ks-55716', 2],
  [/мтз|беларус/i, 'mtz-82', 2],
  [/агп|автовышк/i, 'agp', 2],
  [/кму|манипулятор/i, 'kmu-kamaz', 2],
  [/самосвал/i, 'kamaz-dump', 2],
  [/колёсный экскаватор|колесный экскаватор/i, 'wheeled-excavator-hammer', 2],
  [/гусеничный экскаватор/i, 'crawler-excavator', 2],
  [/каток/i, 'roller', 2],
  [/бульдозер/i, 'dozer', 2],
];

/** Photos of this machine's model, or none (Lonking has no free photo yet). */
export function modelPhotosOf(name: string): string[] {
  const hit = MODELS.find(([re]) => re.test(name));
  if (!hit) return [];
  const [, slug, count] = hit;
  return Array.from({ length: count }, (_, i) => `/images/models/${slug}-${i + 1}.jpg`);
}
