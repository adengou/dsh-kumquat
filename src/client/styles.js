/**
 * Kumquat · 全部样式，一个字符串。
 *
 * 规则（design/tokens.css 落地）：
 *   - 深色默认，浅色走 prefers-color-scheme；颜色只在 .kq-panel 的变量里出现一次。
 *   - 唯一强调色（金桔橙），只用于主按钮、选中态、焦点环、链接下划线。
 *   - 绿/琥珀/红只出现在徽章（点与描边），文字沿用正文色，保证浅色主题下也 ≥ 4.5:1。
 *   - 字号只有 11 / 12.5 / 14.5 / 18；圆角 8 / 12 / 16；动效 150ms，respects reduced motion。
 *   - 字体只用系统字体名（D9）：不加自定义字体声明，不引任何字体文件。
 */

export const CSS_TEXT = `
.kq-panel{
  --kq-bg:#131519;--kq-card:#191c22;--kq-raise:#1f242c;--kq-line:#272c35;
  --kq-text:#e8eaf0;--kq-muted:#9aa3b3;--kq-dim:#697183;
  --kq-accent:#ff8a2b;--kq-accent-weak:rgba(255,138,43,.14);--kq-accent-line:rgba(255,138,43,.55);
  --kq-ok:#3ddc97;--kq-warn:#f5a524;--kq-fail:#ff5f6d;
  --kq-r-sm:8px;--kq-r-md:12px;--kq-r-lg:16px;
  --kq-fs-1:11px;--kq-fs-2:12.5px;--kq-fs-3:14.5px;--kq-fs-4:18px;--kq-lh:1.65;
  --kq-motion:150ms ease-out;--kq-shadow:0 24px 60px rgba(0,0,0,.45);
  --kq-font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif;
  box-sizing:border-box;width:100%;max-width:640px;margin:0 auto;
  background:var(--kq-card);color:var(--kq-text);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-lg);
  font-family:var(--kq-font);font-size:var(--kq-fs-2);line-height:var(--kq-lh);
  box-shadow:var(--kq-shadow);overflow:hidden;text-align:left;
}
.kq-panel *,.kq-panel *::before,.kq-panel *::after{box-sizing:border-box}
@media (prefers-color-scheme: light){
  .kq-panel{
    --kq-bg:#f6f7f9;--kq-card:#ffffff;--kq-raise:#f1f3f6;--kq-line:#e2e5ea;
    --kq-text:#1b1f26;--kq-muted:#5c6472;--kq-dim:#8b93a1;
    --kq-accent-weak:rgba(255,138,43,.16);--kq-accent-line:rgba(214,102,10,.55);
    --kq-shadow:0 18px 44px rgba(20,24,32,.12);
  }
}
@media (prefers-reduced-motion: reduce){
  .kq-panel{--kq-motion:0ms linear}
  .kq-panel *{transition:none !important;animation:none !important}
}
.kq-panel :focus-visible{
  outline:2px solid var(--kq-accent);outline-offset:2px;border-radius:var(--kq-r-sm);
}
.kq-panel button{font-family:inherit}

/* ── 顶栏 ───────────────────────────────────────────── */
.kq-head{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--kq-line);min-height:56px}
.kq-back{background:none;border:0;color:var(--kq-muted);font-size:var(--kq-fs-3);line-height:1;padding:4px 6px;cursor:pointer;border-radius:var(--kq-r-sm);transition:color var(--kq-motion)}
.kq-back:hover{color:var(--kq-text)}
.kq-mark{width:25px;height:25px;border-radius:var(--kq-r-sm);display:grid;place-items:center;flex:none;
  background:linear-gradient(135deg,#ffc46b,var(--kq-accent));color:#2a1400;font-weight:700;font-size:var(--kq-fs-1)}
.kq-title{font-size:var(--kq-fs-3);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kq-sub{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-status{margin-left:auto;font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kq-status--ok{color:var(--kq-text)}
.kq-status--warn{color:var(--kq-text)}
.kq-status--error{color:var(--kq-text)}
.kq-body{padding:20px;display:block}

/* ── 屏幕 1 ─────────────────────────────────────────── */
.kq-question{font-size:var(--kq-fs-4);line-height:1.4;font-weight:600;margin:0 0 16px}
.kq-task{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:16px 18px;margin:0 0 10px;
  background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-md);color:inherit;cursor:pointer;
  transition:border-color var(--kq-motion),transform var(--kq-motion),background var(--kq-motion)}
.kq-task:hover{border-color:var(--kq-accent-line);transform:translateY(-1px)}
.kq-task:active{transform:translateY(0)}
.kq-task__body{display:block;min-width:0}
.kq-task__title{display:block;font-size:var(--kq-fs-3);font-weight:600;margin-bottom:2px}
.kq-task__desc{display:block;font-size:var(--kq-fs-2);color:var(--kq-muted)}
.kq-task__reason{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:4px}
.kq-task__arrow{margin-left:auto;color:var(--kq-muted);flex:none}
.kq-recent{margin:14px 0 0;font-size:var(--kq-fs-1);color:var(--kq-muted);display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.kq-recent__label{letter-spacing:.06em}
.kq-recent__item{display:inline-flex;align-items:center;gap:5px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-recent .kq-badge{max-width:220px}
.kq-recent .kq-badge__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-recent__empty{color:var(--kq-muted)}

/* ── 分区 ───────────────────────────────────────────── */
.kq-sec{margin:0 0 20px}
.kq-sec__label{font-size:var(--kq-fs-1);letter-spacing:.06em;color:var(--kq-muted);margin:0 0 8px}
.kq-hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:8px 0 0}
.kq-empty{font-size:var(--kq-fs-2);color:var(--kq-muted);margin:8px 0 0}
.kq-note{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:6px 0 0}

/* ── 按钮 ───────────────────────────────────────────── */
.kq-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--kq-r-sm);
  font-size:var(--kq-fs-2);line-height:1.2;padding:7px 13px;cursor:pointer;border:1px solid transparent;
  transition:background var(--kq-motion),border-color var(--kq-motion),color var(--kq-motion),transform var(--kq-motion)}
.kq-btn[disabled]{cursor:not-allowed}
.kq-btn--primary{background:var(--kq-accent);border-color:var(--kq-accent);color:#21150b;font-weight:600}
.kq-btn--primary:hover:not([disabled]){background:#ffa055;border-color:#ffa055}
.kq-btn--primary:active:not([disabled]){transform:translateY(1px)}
.kq-btn--primary[disabled]{background:var(--kq-raise);border-color:var(--kq-line);color:var(--kq-muted);font-weight:500}
.kq-btn--ghost{background:transparent;border-color:var(--kq-line);color:var(--kq-text)}
.kq-btn--ghost:hover:not([disabled]){border-color:var(--kq-accent-line);color:var(--kq-text)}
.kq-btn--ghost[disabled]{color:var(--kq-muted);border-color:var(--kq-line)}
.kq-btn--link{background:none;border:0;padding:2px 0;color:var(--kq-text);font-size:var(--kq-fs-1);
  text-decoration:underline;text-decoration-color:var(--kq-accent);text-underline-offset:3px}
.kq-btn--link:hover:not([disabled]){color:var(--kq-text);text-decoration-thickness:2px}
.kq-btn--link[disabled]{color:var(--kq-muted);text-decoration-color:var(--kq-line)}
.kq-btn--big{padding:10px 26px;font-size:var(--kq-fs-3)}

/* ── 文件条 ─────────────────────────────────────────── */
.kq-btns{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.kq-file{display:flex;align-items:center;gap:12px;padding:11px 13px;background:var(--kq-raise);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-md)}
.kq-file__icon{width:32px;height:32px;flex:none;border-radius:var(--kq-r-sm);background:var(--kq-card);
  border:1px solid var(--kq-line);display:grid;place-items:center;color:var(--kq-muted)}
.kq-file__body{min-width:0;flex:1}
.kq-file__name{font-size:var(--kq-fs-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-file__meta{font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-file__x{margin-left:auto;flex:none;background:none;border:0;color:var(--kq-muted);font-size:var(--kq-fs-2);
  padding:4px 6px;cursor:pointer;border-radius:var(--kq-r-sm)}
.kq-file__x:hover{color:var(--kq-text)}
.kq-paste{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin:10px 0 0}
.kq-paste__field{flex:1;min-width:220px}
.kq-paste__actions{display:flex;gap:8px;padding-top:20px}
.kq-field__label{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-bottom:5px}
.kq-input{width:100%;background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);
  color:var(--kq-text);font-family:inherit;font-size:var(--kq-fs-2);padding:6px 9px;min-height:32px}
.kq-input:focus-visible{outline:2px solid var(--kq-accent);outline-offset:1px}
.kq-input[aria-invalid="true"]{border-color:var(--kq-fail)}
.kq-error{font-size:var(--kq-fs-1);color:var(--kq-text);margin:6px 0 0}
.kq-error::before{content:"！";color:var(--kq-fail);margin-right:4px;font-weight:700}
.kq-banner__error{font-size:var(--kq-fs-1);color:var(--kq-text);margin:6px 0 0}
.kq-banner__error::before{content:"！";color:var(--kq-fail);margin-right:4px;font-weight:700}

/* ── 格式胶囊 ───────────────────────────────────────── */
.kq-pills{display:flex;gap:7px;flex-wrap:wrap}
.kq-pill{background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);
  color:var(--kq-muted);font-size:var(--kq-fs-2);padding:5px 13px;cursor:pointer;min-height:30px;
  transition:background var(--kq-motion),border-color var(--kq-motion),color var(--kq-motion)}
.kq-pill:hover:not([disabled]){border-color:var(--kq-accent-line);color:var(--kq-text)}
.kq-pill.is-on{background:var(--kq-accent-weak);border-color:var(--kq-accent);color:var(--kq-text);font-weight:600}
.kq-pill[disabled]{opacity:.55;cursor:not-allowed;text-decoration:line-through}

/* ── 仅换封装 ───────────────────────────────────────── */
.kq-copy{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 0;font-size:var(--kq-fs-2)}
.kq-check{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:2px 0;
  color:var(--kq-text);font-size:var(--kq-fs-2);cursor:pointer;border-radius:var(--kq-r-sm)}
.kq-check[disabled]{color:var(--kq-muted);cursor:not-allowed}
.kq-check__box{width:14px;height:14px;flex:none;border-radius:4px;border:1px solid var(--kq-dim);
  display:grid;place-items:center;color:var(--kq-card);transition:background var(--kq-motion),border-color var(--kq-motion)}
.kq-check.is-on .kq-check__box{background:var(--kq-accent);border-color:var(--kq-accent)}
.kq-check__meta{color:var(--kq-muted);font-size:var(--kq-fs-1)}
.kq-check__meta--warn{color:var(--kq-text)}

/* ── 时间轴选区 ─────────────────────────────────────── */
.kq-range{margin:0}
.kq-track{position:relative;height:32px;border-radius:var(--kq-r-sm);background:var(--kq-bg);
  border:1px solid var(--kq-line);overflow:hidden}
.kq-track::before{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,var(--kq-line) 0 1px,transparent 1px 42px);opacity:.55}
.kq-sel{position:absolute;top:0;bottom:0;background:var(--kq-accent-weak);
  border-left:2px solid var(--kq-accent);border-right:2px solid var(--kq-accent);transition:left var(--kq-motion),width var(--kq-motion)}
.kq-slider{position:absolute;left:0;right:0;top:0;bottom:0;width:100%;height:32px;margin:0;
  -webkit-appearance:none;appearance:none;background:transparent;pointer-events:none}
.kq-slider:focus-visible{outline:none}
.kq-slider:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--kq-bg),0 0 0 4px var(--kq-accent)}
.kq-slider:focus-visible::-moz-range-thumb{box-shadow:0 0 0 2px var(--kq-bg),0 0 0 4px var(--kq-accent)}
.kq-slider::-webkit-slider-runnable-track{background:transparent;border:0;height:32px}
.kq-slider::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:12px;height:28px;margin-top:2px;
  border-radius:5px;background:var(--kq-accent);border:2px solid var(--kq-bg);cursor:grab}
.kq-slider::-moz-range-track{background:transparent;border:0;height:32px}
.kq-slider::-moz-range-thumb{pointer-events:auto;width:10px;height:26px;border-radius:5px;
  background:var(--kq-accent);border:2px solid var(--kq-bg);cursor:grab}
.kq-slider:active::-webkit-slider-thumb{cursor:grabbing}
.kq-ticks{position:relative;height:16px;margin-top:4px;font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-tick{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.kq-tick:first-child{transform:none}
.kq-tick:last-child{transform:translateX(-100%)}
.kq-fields{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;font-size:var(--kq-fs-2)}
.kq-field{display:block}
.kq-field--tight{width:96px}
.kq-field--ro{display:flex;align-items:baseline;gap:6px}
.kq-dur{font-size:var(--kq-fs-2);font-weight:600}

/* ── GIF 参数 ───────────────────────────────────────── */
.kq-params{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}
.kq-params .kq-field{width:112px}
.kq-select{appearance:auto;min-height:32px}
.kq-note--line{margin-top:10px}

/* ── 主操作 ─────────────────────────────────────────── */
.kq-go{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 0}
.kq-eta{font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-eta--blocked{color:var(--kq-muted)}

/* ── 结果 ───────────────────────────────────────────── */
.kq-results{margin-top:18px;padding-top:16px;border-top:1px solid var(--kq-line)}
.kq-result-list{list-style:none;margin:0;padding:0}
.kq-result{border-bottom:1px dashed var(--kq-line)}
.kq-result:last-child{border-bottom:0}
.kq-result__sum{display:grid;grid-template-columns:auto minmax(0,1fr) auto 16px;align-items:center;gap:8px;
  width:100%;text-align:left;background:none;border:0;color:inherit;padding:9px 0;cursor:pointer;
  border-radius:var(--kq-r-sm);transition:background var(--kq-motion)}
.kq-result__sum:hover{background:var(--kq-raise)}
.kq-result__name{min-width:0;display:block}
.kq-result__file{display:block;font-size:var(--kq-fs-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-result__meta{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:1px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-result__badgeNote{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-result__detail{padding:4px 0 14px 0;transition:opacity var(--kq-motion)}
.kq-rowprogress{display:flex;align-items:center;gap:10px;padding:0 0 10px}
.kq-rowprogress .kq-progress{flex:1;max-width:280px}
.kq-rowprogress .kq-progress__text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-dl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:4px 10px;margin:4px 0 10px;font-size:var(--kq-fs-2)}
.kq-dl dt{color:var(--kq-muted);font-size:var(--kq-fs-1);line-height:1.8}
.kq-dl dd{margin:0;min-width:0;overflow-wrap:anywhere}
.kq-checks{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:3px}
.kq-check-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-check-row__id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-check-row__text{overflow-wrap:anywhere}
.kq-check-row__delta{color:var(--kq-text)}
.kq-result__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}

/* ── 徽章 ───────────────────────────────────────────── */
.kq-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 6px;border-radius:999px;
  border:1px solid var(--kq-line);background:var(--kq-raise);font-size:var(--kq-fs-1);color:var(--kq-text);white-space:nowrap}
.kq-badge__dot{width:6px;height:6px;border-radius:50%;background:var(--kq-muted);flex:none}
.kq-badge--pass{border-color:var(--kq-ok)}
.kq-badge--pass .kq-badge__dot{background:var(--kq-ok)}
.kq-badge--warn{border-color:var(--kq-warn)}
.kq-badge--warn .kq-badge__dot{background:var(--kq-warn)}
.kq-badge--fail{border-color:var(--kq-fail)}
.kq-badge--fail .kq-badge__dot{background:var(--kq-fail)}
.kq-badge--busy{border-color:var(--kq-accent-line)}
.kq-badge--busy .kq-badge__dot{background:var(--kq-accent)}
.kq-badge--muted{opacity:.85}

/* ── 命令块 ─────────────────────────────────────────── */
.kq-cmd{display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;background:var(--kq-bg);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);padding:8px 10px}
.kq-cmd__text{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
  font-size:var(--kq-fs-1);line-height:1.55;color:var(--kq-text);white-space:pre-wrap;overflow-wrap:anywhere}
.kq-cmd__copy{flex:none}

/* ── 缺 FFmpeg 横幅 ─────────────────────────────────── */
.kq-banner{margin:0 0 16px;padding:12px 14px;border:1px solid var(--kq-accent-line);border-radius:var(--kq-r-md);
  background:var(--kq-accent-weak);display:grid;gap:8px}
.kq-banner__title{font-size:var(--kq-fs-2);font-weight:600;color:var(--kq-text)}
.kq-banner__hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-banner__row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.kq-progress{flex:1;min-width:160px;height:6px;border-radius:999px;background:var(--kq-raise);overflow:hidden;border:1px solid var(--kq-line)}
.kq-progress__fill{display:block;height:100%;background:var(--kq-accent);transition:width var(--kq-motion)}
.kq-progress__fill--indeterminate{width:35%;background:linear-gradient(90deg,transparent,var(--kq-accent),transparent)}
.kq-progress__text{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-banner__actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

/* ── 离线提示 ───────────────────────────────────────── */
.kq-offline{margin:0 0 16px;padding:10px 12px;border:1px solid var(--kq-line);border-radius:var(--kq-r-md);
  background:var(--kq-raise);display:grid;gap:4px}
.kq-offline__title{font-size:var(--kq-fs-2);color:var(--kq-text);font-weight:600}
.kq-offline__hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}

/* ── 页脚 ───────────────────────────────────────────── */
.kq-foot{padding:0 20px 14px;display:grid;gap:2px}
.kq-balance{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-balance--ready{color:var(--kq-text)}
.kq-balance--error{color:var(--kq-muted)}
.kq-foot__note{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-icon{display:inline-block;flex:none;vertical-align:middle}

/* ── 覆盖层：不依赖宿主皮肤的主区域布局 ─────────────── */
.kq-launch{display:inline-flex;align-items:center;gap:6px;background:none;border:0;padding:2px;color:inherit;cursor:pointer}
.kq-veil{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;
  background:rgba(8,10,14,.55);backdrop-filter:blur(2px);padding:24px}
.kq-veil__box{position:relative;width:min(680px,100%);max-height:min(86vh,820px);overflow:auto;
  border-radius:var(--kq-r-lg);box-shadow:0 30px 80px rgba(0,0,0,.5)}
.kq-veil__close{position:absolute;top:10px;right:12px;z-index:2;background:none;border:0;
  color:var(--kq-muted);font-size:18px;line-height:1;padding:6px;cursor:pointer}
@media (prefers-reduced-motion: no-preference){
  .kq-veil{animation:kq-fade var(--kq-motion)}
  .kq-veil__box{animation:kq-rise var(--kq-motion)}
}
@keyframes kq-fade{from{opacity:0}to{opacity:1}}
/* Only movement: an opacity ramp made screenshots and slow GPUs look washed out. */
@keyframes kq-rise{from{transform:translateY(6px)}to{transform:none}}
`
