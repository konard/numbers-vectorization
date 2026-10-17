import { createElement as h } from 'react';

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}) {
  return h(
    'div',
    {
      className: `mode-tabs ${className ?? ''}`.trim(),
      role: 'radiogroup',
      'aria-label': label,
      style: { gridTemplateColumns: `repeat(${options.length}, 1fr)` },
    },
    options.map(([option, text]) =>
      h(
        'button',
        {
          key: option,
          type: 'button',
          className: option === value ? 'mode-tab mode-tab-active' : 'mode-tab',
          role: 'radio',
          'aria-checked': option === value,
          onClick: () => onChange(option),
        },
        text
      )
    )
  );
}

/** A labelled choice between a few options, laid out like a slider. */
export function ChoiceControl({ label, options, value, onChange, hint }) {
  return h(
    'div',
    { className: 'range-control', title: hint },
    h('span', null, h('span', null, label)),
    h(SegmentedControl, {
      label,
      options,
      value,
      onChange,
      className: 'curve-tabs',
    })
  );
}

/**
 * A slider with an Auto switch (issue 7): on Auto the slider is disabled and
 * shows what the library chose for this raster; off Auto the slider value is
 * used as is.
 */
export function AutoRangeControl({ field, setting, used, onChange, onAuto }) {
  const id = `setting-${field.key}`;
  const shown = setting.auto
    ? `Auto: ${used}`
    : `${setting.value}${field.suffix ?? ''}`;

  return h(
    'div',
    {
      className: setting.auto ? 'range-control range-auto' : 'range-control',
      title: field.hint,
    },
    h(
      'span',
      null,
      h('label', { htmlFor: id }, field.label),
      h('strong', null, shown)
    ),
    h(
      'span',
      { className: 'auto-row' },
      h(
        'label',
        { className: 'auto-switch' },
        h('input', {
          type: 'checkbox',
          checked: setting.auto,
          'aria-label': `${field.label} automatic`,
          onChange: (event) => onAuto(event.target.checked),
        }),
        'Auto'
      ),
      h('input', {
        id,
        type: 'range',
        min: field.min,
        max: field.max,
        step: field.step,
        value: setting.value,
        disabled: setting.auto,
        onChange: (event) => onChange(Number(event.target.value)),
      })
    )
  );
}
