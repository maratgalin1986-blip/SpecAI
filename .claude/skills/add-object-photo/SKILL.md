---
name: add-object-photo
description: Publish a job-site photo the owner forwarded from Telegram into the «Фото с объектов» block of the site.
---

The owner chose manual moderation: clients and executors send photos (before/after the job) to his Telegram;
he forwards good ones to the site session.

1. Look at each photo. Reject or ask the owner if it shows faces, car number plates, other companies' logos or
   ads, people's documents, or is blurry or not a work site.
2. Save it as `apps/web/public/images/objects/<yyyy-mm>-<short-slug>.jpg`, at most 1600 px on the long side, JPEG ~85
   (shrink with Python PIL if needed; strip EXIF).
3. Add an entry to `OBJECT_PHOTOS` in `apps/web/src/lib/objectPhotos.ts`: `src`, `caption` (what and where, no
   names or phones), optional `stage: 'before' | 'after'` and `machine`.
4. Run `site-check`, commit, push, and tell the owner which photos went live.
