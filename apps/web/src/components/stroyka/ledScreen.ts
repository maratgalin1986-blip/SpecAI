// The LED screen by the gate: the opening film (muted, looped) on a big
// panel on two posts. The video starts once the opening film is over, so
// the phone never decodes it twice; it pauses when the page is hidden.
import * as THREE from 'three';
import { FILM_SRC } from './StroykaFilm';

export class LedScreen {
  readonly group = new THREE.Group();
  private video: HTMLVideoElement;
  private started = false;
  private onVisibility = () => {
    if (document.hidden) this.video.pause();
    else if (this.started) void this.video.play().catch(() => {});
  };

  constructor(materials: { dark: THREE.Material; steel: THREE.Material }, mobile: boolean) {
    const video = document.createElement('video');
    video.src = mobile ? FILM_SRC.sm : FILM_SRC.full;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.crossOrigin = 'anonymous';
    this.video = video;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const W = 9;
    const H = W * (9 / 16);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      // An LED panel glows: no lighting, no tone mapping, a touch darker so
      // it does not blow out in the bloom.
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: 0xd8d8d8 }),
    );
    panel.position.set(0, 2.6 + H / 2, 0.16);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, H + 0.4, 0.3), materials.dark);
    back.position.set(0, 2.6 + H / 2, 0);
    back.castShadow = true;
    this.group.add(panel, back);
    for (const x of [-W / 3, W / 3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), materials.steel);
      post.position.set(x, 1.4, -0.05);
      post.castShadow = true;
      this.group.add(post);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.video.preload = 'auto';
    void this.video.play().catch(() => {});
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
