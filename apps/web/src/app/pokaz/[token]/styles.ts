// Стили презентации /pokaz/<token>: один тёмный образ, анимация на CSS. Отдельным файлом, чтобы
// страница оставалась читаемой; все правила — под классом .pokaz.
export const POKAZ_CSS = `
/* Раскладка: вертикальная лента сцен, в каждой — живая схема слева/сверху и короткий текст. Один тёмный образ: ночная стройплощадка, сигнальный оранжевый. */
.pokaz{
  color-scheme:dark;
  --night:#0c2030; --deck:#12303f; --steel:#1c4456; --line:#2c5d73;
  --sand:#f3ead9; --mute:#9fb6c2; --signal:#ff8a1f; --beam:#5fd3e6; --ok:#7be0a3;
  --display:"Unbounded","Arial Black",Arial,sans-serif;
  --body:"Golos Text",Arial,Helvetica,sans-serif;
}
.pokaz{min-height:100vh;background:var(--night);color:var(--sand);font-family:var(--body);font-size:17px;line-height:1.55;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 48px}
.wrap{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
.pokaz h1,.pokaz h2{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
.pokaz h1{font-size:clamp(28px,6.4vw,54px);font-weight:700}
.pokaz h2{font-size:clamp(21px,4.2vw,32px);font-weight:500}
.pokaz p{margin:0;max-width:60ch}
.eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--signal);font-weight:700}
.mute{color:var(--mute)}
.pokaz header{padding-block:36px 8px;display:grid;gap:18px}
.for{display:inline-flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:15px;color:var(--mute)}
.for b{color:var(--sand);font-weight:700;border-bottom:2px solid var(--signal)}
.scene{background:var(--deck);border-radius:22px;padding:22px;display:grid;gap:22px;grid-template-columns:minmax(0,1fr);overflow:hidden}
@media(min-width:760px){.scene{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;padding:30px}.scene.flip .stage{order:2}}
.copy{display:grid;gap:12px;min-width:0}
.stage{min-width:0;background:var(--night);border-radius:16px;aspect-ratio:16/11;max-width:100%;position:relative;overflow:hidden}
.pokaz ul{margin:0;padding-left:20px;display:grid;gap:6px}
a.go{display:inline-block;align-self:start;justify-self:start;background:var(--signal);color:#1a1206;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:12px}
a.go:focus-visible{outline:3px solid var(--beam);outline-offset:3px}
.tel{font-family:var(--display);font-size:clamp(20px,5vw,30px);user-select:all}

/* 1. Сайт собирается на экране телефона */
.phone{position:absolute;left:50%;top:50%;width:38%;aspect-ratio:9/17;transform:translate(-50%,-50%);border:3px solid var(--line);border-radius:18px;background:var(--deck);padding:8% 7%;display:grid;gap:7%;align-content:start}
.blk{border-radius:6px;background:var(--steel);transform-origin:left;animation:build 7s ease-in-out infinite both}
.blk.t{height:14px;background:var(--sand);width:80%}
.blk.s{height:8px;width:60%;animation-delay:.5s}
.blk.img{height:46px;animation-delay:1s;background:linear-gradient(135deg,var(--steel),var(--line))}
.blk.btn{height:18px;width:70%;background:var(--signal);animation-delay:1.6s}
.blk.s2{height:8px;width:90%;animation-delay:2.1s}
.blk.s3{height:8px;width:75%;animation-delay:2.5s}
@keyframes build{0%{transform:scaleX(0);opacity:0}12%,88%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}
.tag{position:absolute;font-size:12px;font-weight:700;padding:5px 9px;border-radius:999px;background:var(--steel);color:var(--sand);animation:pop 7s ease-in-out infinite both}
.tag.a{left:6%;top:16%;animation-delay:1.2s}.tag.b{right:5%;top:42%;animation-delay:2s}.tag.c{left:8%;bottom:14%;animation-delay:2.8s}
@keyframes pop{0%,8%{opacity:0;transform:translateY(8px)}16%,86%{opacity:1;transform:none}100%{opacity:0}}

/* 2. CRM: заявка едет по этапам */
.board{position:absolute;inset:10%;display:grid;grid-template-columns:repeat(3,1fr);gap:4%}
.col{background:var(--deck);border-radius:10px;padding:8px;display:grid;gap:6px;align-content:start;font-size:11px;color:var(--mute);font-weight:700}
.col i{display:block;height:16px;border-radius:5px;background:var(--steel)}
.deal{position:absolute;top:34%;left:12%;width:21%;height:20%;border-radius:8px;background:var(--signal);color:#1a1206;font-size:11px;font-weight:700;display:grid;place-items:center;text-align:center;animation:move 8s ease-in-out infinite}
@keyframes move{0%,18%{left:12%;background:var(--signal)}34%,54%{left:39.5%;background:var(--beam)}70%,92%{left:67%;background:var(--ok)}100%{left:12%;background:var(--signal)}}

/* 3. 1С ↔ сайт ↔ приложение */
.node{position:absolute;top:50%;transform:translateY(-50%);width:24%;aspect-ratio:1;border-radius:16px;background:var(--deck);border:2px solid var(--line);display:grid;place-items:center;font-family:var(--display);font-size:clamp(12px,2.6vw,18px);text-align:center}
.node.l{left:7%}.node.m{left:38%;border-color:var(--signal)}.node.r{right:7%}
.wire{position:absolute;top:50%;height:2px;background:var(--line)}
.wire.w1{left:31%;width:7%}.wire.w2{left:62%;width:7%}
.dot{position:absolute;top:calc(50% - 5px);width:10px;height:10px;border-radius:50%;background:var(--beam);animation:flow 3s linear infinite}
.dot.d2{animation-delay:1.5s;background:var(--signal)}
@keyframes flow{0%{left:31%;opacity:0}10%{opacity:1}45%{left:38%}55%{left:62%}90%{opacity:1}100%{left:69%;opacity:0}}

/* 4. Камера: распознавание */
.cam{position:absolute;inset:8%;border-radius:12px;background:linear-gradient(180deg,#143648 0 62%,#0f2a39 62%);overflow:hidden}
.truck{position:absolute;left:14%;bottom:26%;width:38%;height:24%;background:var(--steel);border-radius:6px 16px 4px 4px}
.truck::before{content:"";position:absolute;right:-22%;bottom:0;width:22%;height:70%;background:var(--line);border-radius:4px 8px 4px 4px}
.man{position:absolute;right:16%;bottom:26%;width:6%;height:30%;background:var(--steel);border-radius:8px 8px 3px 3px}
.man::before{content:"";position:absolute;left:10%;top:-22%;width:80%;aspect-ratio:1;border-radius:50%;background:var(--signal)}
.box{position:absolute;border:2px solid var(--beam);border-radius:6px;animation:detect 6s ease-in-out infinite both}
.box span{position:absolute;left:-2px;top:-22px;background:var(--beam);color:#06222b;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap}
.box.b1{left:11%;bottom:22%;width:52%;height:34%}
.box.b2{right:11%;bottom:22%;width:16%;height:48%;border-color:var(--ok);animation-delay:1.2s}.box.b2 span{background:var(--ok)}
@keyframes detect{0%,10%{opacity:0;transform:scale(1.12)}22%,84%{opacity:1;transform:none}100%{opacity:0}}
.scan{position:absolute;left:0;right:0;height:2px;background:var(--beam);opacity:.7;animation:scan 3s linear infinite}
@keyframes scan{0%{top:0}100%{top:100%}}
.rec{position:absolute;left:10px;top:8px;font-size:10px;font-weight:700;color:var(--sand);display:flex;gap:6px;align-items:center}
.rec::before{content:"";width:8px;height:8px;border-radius:50%;background:#ff5a4d;animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.2}}

/* 5. 3D-город: дома растут */
.city{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;gap:3%;padding:0 8% 16%}
.city i{flex:1;max-width:11%;background:linear-gradient(180deg,var(--line),var(--steel));border-radius:4px 4px 0 0;transform-origin:bottom;animation:rise 6s ease-in-out infinite both;position:relative}
.city i::after{content:"";position:absolute;inset:10% 22%;background:repeating-linear-gradient(180deg,var(--signal) 0 3px,transparent 3px 11px);opacity:.75}
.city i:nth-child(1){height:38%}.city i:nth-child(2){height:62%;animation-delay:.3s}.city i:nth-child(3){height:48%;animation-delay:.6s}
.city i:nth-child(4){height:78%;animation-delay:.9s}.city i:nth-child(5){height:54%;animation-delay:1.2s}.city i:nth-child(6){height:34%;animation-delay:1.5s}
@keyframes rise{0%{transform:scaleY(0)}18%,86%{transform:scaleY(1)}100%{transform:scaleY(0)}}
.road{position:absolute;left:0;right:0;bottom:8%;height:8%;background:var(--deck)}
.car{position:absolute;bottom:10%;width:7%;height:4%;background:var(--signal);border-radius:3px;animation:drive 6s linear infinite}
@keyframes drive{0%{left:-8%}100%{left:104%}}
.pokaz footer{display:grid;gap:14px;padding:6px 4px}
@media(prefers-reduced-motion:reduce){.pokaz *{animation:none!important}}
`;
