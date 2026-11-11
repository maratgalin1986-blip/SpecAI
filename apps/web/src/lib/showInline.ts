import { AB_INLINE } from './ab';
import { SHOW_PAGES } from './showGate';

// Server only (layout.tsx): kept out of showGate.ts so the client bundles that
// use the gate (the celebration) do not carry the script text.

/**
 * The same decision in plain ES5 for the inline head script: it runs before the
 * first paint, so the entrance animations know their level from frame one.
 * Kept equal to `showLevel` by showGate.test.ts.
 */
export const SHOW_INLINE =
  `(function(){try{if(!${SHOW_PAGES.toString()}.test(location.pathname))return;` +
  `${AB_INLINE};var n=navigator,c=n.connection||{},m=n.deviceMemory,k=n.hardwareConcurrency,l='full';` +
  `if(matchMedia('(prefers-reduced-motion: reduce)').matches)l='off';` +
  `else if(c.saveData||ab==='calm'||c.effectiveType==='2g'||c.effectiveType==='slow-2g'||(m&&m<=2)||(k&&k<=2))l='calm';` +
  `document.documentElement.setAttribute('data-show',l)}catch(e){}})();`;
