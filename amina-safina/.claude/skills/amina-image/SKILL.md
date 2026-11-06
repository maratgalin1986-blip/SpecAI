---
name: amina-image
description: Сгенерировать изображение Амины Сафиной по эталону лица (Canva generate-image) и занести в каталог.
---
1. Проверь `assets/catalog.csv` — нет ли уже такого кадра.
2. Промпт = база из `memory/persona.md` (визуальный канон + лицо) + сцена + одежда + ракурс.
   Купальники: «elegant one-piece/bikini swimsuit, fashion catalog pose, beach/pool, tasteful».
3. `mcp__Canva__generate-image` с `imageReferences: [{type: MEDIA, id: <эталон>}]`, формат:
   аватар/пост 4:5 (`PORTRAIT_4_5`), сторис/клипы `PORTRAIT_9_16`, обложка VK `LANDSCAPE_16_9`.
4. `get-generate-image-job` до SUCCESS. QC: лицо = эталон, руки/пальцы, фон, нет текста-мусора.
   Брак — одна повторная попытка с уточнённым промптом, затем пометка в каталоге.
5. Строка в `assets/catalog.csv` (id, категория, media id, статус).
