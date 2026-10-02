// Photos taken from Wikimedia Commons. CC0 needs no credit, but the authors
// are named anyway on /credits. Add a row here for every third-party file.

export interface PhotoCredit {
  file: string;
  title: string;
  author: string;
  license: string;
  url: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    file: '/images/machines/truck-1.jpg',
    title: 'Moscow, 60-letiya Oktyabrya, Kamaz dump truck, May 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_60-letiya_Oktyabrya,_Kamaz_dump_truck,_May_2026_01.jpg',
  },
  {
    file: '/images/machines/truck-2.jpg',
    title: 'Moscow, Kamaz-65115, Aug 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Kamaz-65115,_Aug_2026_01.jpg',
  },
  {
    file: '/images/machines/truck-3.jpg',
    title: 'Moscow, Kamaz-65115 dump car, Mar 2026 03',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Kamaz-65115_dump_car,_Mar_2026_03.jpg',
  },
  {
    file: '/images/machines/dozer-1.jpg',
    title:
      '2026-03-03 Construction of Bolotnaya Embankment footbridge, earthworks 41 Shantui SD17B3XL',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-03_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_41_Shantui_SD17B3XL.jpg',
  },
  {
    file: '/images/machines/dozer-2.jpg',
    title:
      '2026-03-03 Construction of Bolotnaya Embankment footbridge, earthworks 42 Shantui SD17B3XL',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-03_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_42_Shantui_SD17B3XL.jpg',
  },
  {
    file: '/images/machines/dozer-3.jpg',
    title:
      '2026-03-14 Construction of Bolotnaya Embankment footbridge, earthworks 10 Shantui SD17B3XL',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-14_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_10_Shantui_SD17B3XL.jpg',
  },
  {
    file: '/images/machines/tractor-1.jpg',
    title: 'Moscow, Ovchinnikovskaya Embankment, Belarus 82.1 tractor July 2025 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Ovchinnikovskaya_Embankment,_Belarus_82.1_tractor_July_2025_01.jpg',
  },
  {
    file: '/images/machines/tractor-2.jpg',
    title: 'Moscow, Pyatnitskaya 5, Belarus 82.1 tractor as sprinkler, July 2025 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Pyatnitskaya_5,_Belarus_82.1_tractor_as_sprinkler,_July_2025_01.jpg',
  },
  {
    file: '/images/machines/tractor-3.jpg',
    title: 'Moscow, Belarus 82.1 tractor as street sweeper, June 2025 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Belarus_82.1_tractor_as_street_sweeper,_June_2025_01.jpg',
  },
];
