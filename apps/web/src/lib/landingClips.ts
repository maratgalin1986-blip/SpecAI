// Footage behind the landing header, by landing slug (/arenda/<slug>, its city
// pages and the job pages through the job's main machine).
const LANDING_CLIPS: Record<string, string[]> = {
  'ekskavator-pogruzchik': ['excavator-truck', 'demolition'],
  avtokran: ['city-cranes', 'crane-sun'],
  'frontalnyj-pogruzchik': ['excavator-truck', 'workers'],
  traktor: ['house-frame', 'site-aerial'],
  'gusenichnyj-ekskavator': ['excavator-truck', 'site-aerial'],
  'kolyosnyj-ekskavator-gidromolot': ['demolition', 'excavator-truck'],
  'manipulyator-kmu': ['city-cranes', 'workers'],
  'avtovyshka-agp': ['welder-height', 'tower-glass'],
  vibrokatok: ['site-aerial', 'workers'],
  samosval: ['excavator-truck', 'site-aerial'],
  buldozer: ['site-aerial', 'excavator-truck'],
};

export function landingClips(slug: string): string[] {
  return LANDING_CLIPS[slug] ?? ['site-aerial'];
}
