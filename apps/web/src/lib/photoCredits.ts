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
  // Photos of the exact fleet models (lib/modelPhotos.ts).
  {
    file: '/images/models/jcb-4cx-1.jpg',
    title: 'JCB 4CX backhoe loader in Sibiu, România - side view',
    author: 'Gabinho',
    license: 'CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:JCB_4CX_backhoe_loader_in_Sibiu,_Rom%C3%A2nia_-_side_view.jpg',
  },
  {
    file: '/images/models/jcb-4cx-2.jpg',
    title: 'Moscow, Novokuznetskaya 42c2, paving, JCB 4CX, Sept 2026 03',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Novokuznetskaya_42c2,_paving,_JCB_4CX,_Sept_2026_03.jpg',
  },
  {
    file: '/images/models/case-570-1.jpg',
    title: 'Construction vehicles in the Philippines (June 2023) 12',
    author: 'SJasminum',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Construction_vehicles_in_the_Philippines_(June_2023)_12.jpg',
  },
  {
    file: '/images/models/case-570-2.jpg',
    title: 'Case 570ST Case loaders1',
    author: 'Valenzuela400',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Case_570ST_Case_loaders1.jpg',
  },
  {
    file: '/images/models/hidromek-102b-1.jpg',
    title: 'Moscow, Hidromek loader, Feb 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Hidromek_loader,_Feb_2026_01.jpg',
  },
  {
    file: '/images/models/hidromek-102b-2.jpg',
    title: 'Moscow, Hidromek loader, Feb 2026 02',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Hidromek_loader,_Feb_2026_02.jpg',
  },
  {
    file: '/images/models/lgce-b877f-1.jpg',
    title: 'Moscow, LGCE (LGMG Group) B877F loader, Feb 2025 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_LGCE_(LGMG_Group)_B877F_loader,_Feb_2025_01.jpg',
  },
  {
    file: '/images/models/ks-55716-1.jpg',
    title: 'KamAZ crane truck Galichanin KS-55713-1 in Volgograd',
    author: 'Дмитрий Лобакин',
    license: 'CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:KamAZ_crane_truck_Galichanin_KS-55713-1_in_Volgograd.jpg',
  },
  {
    file: '/images/models/ks-55716-2.jpg',
    title: 'Moscow, views from Rusakovskaya overpass - Kamaz-43118-Galichanin, Mar 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_views_from_Rusakovskaya_overpass_-_Kamaz-43118-Galichanin,_Mar_2026_01.jpg',
  },
  {
    file: '/images/models/crane-32t-2.jpg',
    title: '2014.05.05 ks-55729',
    author: 'Alexey8601',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:2014.05.05_ks-55729.jpg',
  },
  {
    file: '/images/models/crane-32t-1.jpg',
    title: 'Moscow, Galichanin KS-55729 on KamAZ-6540 chassis, Torpedo stadium, Apr 2026 02',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Galichanin_KS-55729_on_KamAZ-6540_chassis,_Torpedo_stadium,_Apr_2026_02.jpg',
  },
  {
    file: '/images/models/mtz-82-1.jpg',
    title: 'Moscow, Danilovsky Val, Belarus 82.1, Mar 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Danilovsky_Val,_Belarus_82.1,_Mar_2026_01.jpg',
  },
  {
    file: '/images/models/mtz-82-2.jpg',
    title: 'Belarus-Rakaw-Belarus 82.1-1',
    author: 'Eugene Zelenko',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Belarus-Rakaw-Belarus_82.1-1.jpg',
  },
  {
    file: '/images/models/agp-2.jpg',
    title: 'АГП 36',
    author: 'Izotovl',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:%D0%90%D0%93%D0%9F_36.jpg',
  },
  {
    file: '/images/models/agp-1.jpg',
    title: 'Aerial work platform on truck in Russia',
    author: 'Bernt Rostad from Oslo, Norway',
    license: 'CC BY 2.0',
    url: 'https://commons.wikimedia.org/wiki/File:Aerial_work_platform_on_truck_in_Russia.jpg',
  },
  {
    file: '/images/models/kmu-kamaz-1.jpg',
    title: 'Moscow, Kamaz-43253 with crane loading, July 2026 01',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Moscow,_Kamaz-43253_with_crane_loading,_July_2026_01.jpg',
  },
  {
    file: '/images/models/kmu-kamaz-2.jpg',
    title: 'KamAZ 43118 Kanglim KS 1256 GII (01)',
    author: 'Georg Pik',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:KamAZ_43118_Kanglim_KS_1256_GII_(01).jpg',
  },
  {
    file: '/images/models/kamaz-dump-1.jpg',
    title: 'Kamaz 6520',
    author: 'Srđan Popović',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Kamaz_6520.jpg',
  },
  {
    file: '/images/models/kamaz-dump-2.jpg',
    title: 'KamaZ dump truck',
    author: 'Druschba 4',
    license: 'CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:KamaZ_dump_truck.JPG',
  },
  {
    file: '/images/models/wheeled-excavator-hammer-1.jpg',
    title: 'Hyundai HW60 001',
    author: 'Jamshid Nurkulov',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Hyundai_HW60_001.jpg',
  },
  {
    file: '/images/models/wheeled-excavator-hammer-2.jpg',
    title: 'Caterpillar M318C wheeled excavator with hydraulic jackhammer in Bucharest',
    author: 'Gabinho',
    license: 'CC BY 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Caterpillar_M318C_wheeled_excavator_with_hydraulic_jackhammer_in_Bucharest.jpg',
  },
  {
    file: '/images/models/crawler-excavator-1.jpg',
    title: '2026-05-19 Reconstruction of Ostankinsky Overpass 32 SDLG excavator',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-05-19_Reconstruction_of_Ostankinsky_Overpass_32_SDLG_excavator.jpg',
  },
  {
    file: '/images/models/crawler-excavator-2.jpg',
    title: 'Hidromek HMK230LC 01',
    author: 'Obandoeño12345',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Hidromek_HMK230LC_01.jpg',
  },
  {
    file: '/images/models/roller-1.jpg',
    title: '2026-03-14 Construction of Bolotnaya Embankment footbridge, earthworks 04 Bomag BW213',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-14_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_04_Bomag_BW213.jpg',
  },
  {
    file: '/images/models/roller-2.jpg',
    title: '2026-03-03 Construction of Bolotnaya Embankment footbridge, earthworks 22 Bomag BW213',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-03_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_22_Bomag_BW213.jpg',
  },
  {
    file: '/images/models/dozer-1.jpg',
    title:
      '2026-03-14 Construction of Bolotnaya Embankment footbridge, earthworks 10 Shantui SD17B3XL',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-14_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_10_Shantui_SD17B3XL.jpg',
  },
  {
    file: '/images/models/dozer-2.jpg',
    title:
      '2026-03-03 Construction of Bolotnaya Embankment footbridge, earthworks 42 Shantui SD17B3XL',
    author: 'Retired electrician',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:2026-03-03_Construction_of_Bolotnaya_Embankment_footbridge,_earthworks_42_Shantui_SD17B3XL.jpg',
  },
];
