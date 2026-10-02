// The picture of a listing for the app (GET /api/equipment, /api/equipment/[id]):
// its own photos (https or the site's paths only, made absolute) or, when it
// has none, the site's illustrative photo of the machine type, marked as an
// example. Pure functions, unit-tested.

import { machineTypeOf } from './equipmentCatalog';
import { defaultPhotoOf } from './machinePhotos';
import { isDisplayableImage } from './providerMap';

function absolute(url: string, origin: string): string {
  return url.startsWith('/') ? `${origin.replace(/\/+$/, '')}${url}` : url;
}

export interface ListingPhoto {
  /** Safe photos of this machine, absolute URLs. */
  imageUrls: string[];
  /** The photo to show: the first own one, or an example; null when neither exists. */
  photoUrl: string | null;
  /** true — «Фото для примера», not this machine. */
  photoIsExample: boolean;
}

export function listingPhoto(
  item: { name: string; imageUrls: readonly string[]; category?: { name: string } | null },
  origin: string,
): ListingPhoto {
  const own = item.imageUrls.filter(isDisplayableImage).map((url) => absolute(url, origin));
  if (own[0]) return { imageUrls: own, photoUrl: own[0], photoIsExample: false };
  const type = machineTypeOf(item.category?.name ?? '', item.name);
  return {
    imageUrls: [],
    photoUrl: type ? absolute(defaultPhotoOf(type), origin) : null,
    photoIsExample: Boolean(type),
  };
}
