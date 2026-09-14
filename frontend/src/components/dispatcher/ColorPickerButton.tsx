import { useEffect, useRef, useState } from 'react';
import { Button, Popover } from '@mui/material';
import { ArrowDropDown, Colorize, FormatColorReset } from '@mui/icons-material';
import { PRESET_COLORS, hexToHsv, hexToRgb, hsvToHex, normalizeHex, rgbToHex, type Hsv } from './colorUtils';
import { textColorFor } from './dispatcherJournalUtils';

export type ChipColors = { color: string | null; textColor: string | null };

type ColorPickerButtonProps = {
  value: ChipColors;
  /** текст чипа в «Просмотре» */
  previewLabel: string;
  disabled?: boolean;
  /** статусу нужен фон — «Сбросить» вернёт серый; значениям справочников — без заливки */
  requireBackground?: boolean;
  onChange: (next: ChipColors) => void;
};

const DEFAULT_BACKGROUND = '#e8eaed';

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } };

/**
 * Выбор цвета как в google-таблицах: кружок со стрелкой → палитра готовых
 * цветов, «Настроить» (текст/фон, поле насыщенности, оттенок, пипетка, HEX и
 * RGB) и «Сбросить». Готовый цвет применяется сразу, свой — по «ОК».
 */
export default function ColorPickerButton({
  value,
  previewLabel,
  disabled,
  requireBackground,
  onChange,
}: ColorPickerButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<'palette' | 'custom'>('palette');
  const [target, setTarget] = useState<'text' | 'background'>('background');
  const [draft, setDraft] = useState<{ color: string; textColor: string }>({ color: DEFAULT_BACKGROUND, textColor: '#000000' });
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(DEFAULT_BACKGROUND));
  const [hexInput, setHexInput] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);

  const background = value.color;
  const textOf = (bg: string | null, text: string | null) => text ?? (bg ? textColorFor(bg) : '#1f2733');

  const open = (element: HTMLElement) => {
    setView('palette');
    setAnchor(element);
  };

  const startCustom = () => {
    const bg = value.color ?? DEFAULT_BACKGROUND;
    const text = textOf(value.color, value.textColor);
    setDraft({ color: bg, textColor: text });
    setTarget('background');
    setHsv(hexToHsv(bg));
    setHexInput(bg);
    setView('custom');
  };

  // переключение «Текст / Фон» — поле и ползунок показывают выбранный цвет
  useEffect(() => {
    if (view !== 'custom') return;
    const hex = target === 'background' ? draft.color : draft.textColor;
    setHsv(hexToHsv(hex));
    setHexInput(hex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, view]);

  const applyHex = (hex: string, nextHsv?: Hsv) => {
    setDraft((prev) => (target === 'background' ? { ...prev, color: hex } : { ...prev, textColor: hex }));
    setHexInput(hex);
    setHsv(nextHsv ?? hexToHsv(hex));
  };

  const pickFromArea = (clientX: number, clientY: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const next = { h: hsv.h, s, v };
    applyHex(hsvToHex(next), next);
  };

  const currentHex = target === 'background' ? draft.color : draft.textColor;
  const rgb = hexToRgb(currentHex);
  const eyeDropper = (window as EyeDropperWindow).EyeDropper;

  const chip = (bg: string | null, text: string | null) => (
    <span
      className="dj-status-chip"
      style={bg ? { background: bg, color: textOf(bg, text) } : { background: '#fff', color: text ?? '#1f2733', border: '1px solid #e1e4ea' }}
    >
      {previewLabel || 'Пример'}
    </span>
  );

  return (
    <>
      <button
        type="button"
        className="dj-color-trigger"
        disabled={disabled}
        title="Цвет"
        onClick={(event) => open(event.currentTarget)}
      >
        <span
          className={`dj-color-trigger__dot${background ? '' : ' is-empty'}`}
          style={background ? { background } : undefined}
        />
        <ArrowDropDown sx={{ fontSize: 16, color: '#6b7280' }} />
      </button>
      {anchor && (
        <Popover
          open
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          {view === 'palette' ? (
            <div className="dj-picker">
              <div className="dj-picker__title">ЦВЕТА</div>
              <div className="dj-picker__grid">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.background}
                    type="button"
                    className={`dj-picker__dot${preset.background === background ? ' is-selected' : ''}`}
                    style={{ background: preset.background }}
                    title={preset.background}
                    onClick={() => {
                      onChange({ color: preset.background, textColor: preset.text });
                      setAnchor(null);
                    }}
                  />
                ))}
              </div>
              <button type="button" className="dj-picker__link" onClick={startCustom}>Настроить</button>
              <button
                type="button"
                className="dj-picker__reset"
                onClick={() => {
                  onChange(requireBackground ? { color: DEFAULT_BACKGROUND, textColor: null } : { color: null, textColor: null });
                  setAnchor(null);
                }}
              >
                <FormatColorReset sx={{ fontSize: 16 }} />
                Сбросить
              </button>
              <div className="dj-picker__preview">
                <span>Просмотр</span>
                {chip(value.color, value.textColor)}
              </div>
            </div>
          ) : (
            <div className="dj-picker dj-picker--custom">
              <div className="dj-picker__preview">
                <span>Просмотр</span>
                {chip(draft.color, draft.textColor)}
              </div>
              <div className="dj-picker__tabs">
                <button type="button" className={target === 'text' ? 'is-active' : undefined} onClick={() => setTarget('text')}>Текст</button>
                <button type="button" className={target === 'background' ? 'is-active' : undefined} onClick={() => setTarget('background')}>Фон</button>
              </div>
              <div
                ref={areaRef}
                className="dj-picker__area"
                style={{ background: `hsl(${Math.round(hsv.h)}, 100%, 50%)` }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pickFromArea(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => {
                  if (event.buttons === 1) pickFromArea(event.clientX, event.clientY);
                }}
              >
                <span
                  className="dj-picker__area-thumb"
                  style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: currentHex }}
                />
              </div>
              <div className="dj-picker__row">
                <span className="dj-picker__swatch" style={{ background: currentHex }} />
                {eyeDropper && (
                  <button
                    type="button"
                    className="dj-picker__icon-btn"
                    title="Пипетка — взять цвет с экрана"
                    onClick={() => {
                      new eyeDropper().open()
                        .then((result) => {
                          const hex = normalizeHex(result.sRGBHex);
                          if (hex) applyHex(hex);
                        })
                        .catch(() => undefined);
                    }}
                  >
                    <Colorize sx={{ fontSize: 16 }} />
                  </button>
                )}
                <input
                  type="range"
                  className="dj-picker__hue"
                  min={0}
                  max={359}
                  value={Math.round(hsv.h)}
                  onChange={(event) => {
                    const next = { ...hsv, h: Number(event.target.value) };
                    // у серых/белых оттенок не виден — подтягиваем насыщенность, чтобы ползунок «работал»
                    if (next.s < 0.05) next.s = 0.6;
                    if (next.v < 0.05) next.v = 0.8;
                    applyHex(hsvToHex(next), next);
                  }}
                />
              </div>
              <div className="dj-picker__fields">
                <label>
                  <span>16-ричный код</span>
                  <input
                    value={hexInput}
                    onChange={(event) => {
                      setHexInput(event.target.value);
                      const hex = normalizeHex(event.target.value);
                      if (hex) applyHex(hex);
                    }}
                  />
                </label>
                {(['r', 'g', 'b'] as const).map((channel) => (
                  <label key={channel} className="dj-picker__rgb">
                    <span>{channel.toUpperCase()}</span>
                    <input
                      inputMode="numeric"
                      value={rgb[channel]}
                      onChange={(event) => {
                        const number = Math.min(255, Math.max(0, Number(event.target.value.replace(/\D/g, '')) || 0));
                        applyHex(rgbToHex({ ...rgb, [channel]: number }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="dj-picker__actions">
                <Button size="small" onClick={() => setView('palette')}>Отмена</Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => {
                    onChange({ color: draft.color, textColor: draft.textColor });
                    setAnchor(null);
                  }}
                >
                  ОК
                </Button>
              </div>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
