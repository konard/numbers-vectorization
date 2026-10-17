import { createElement as h } from 'react';
import { AutoRangeControl, ChoiceControl } from './Controls.js';
import {
  CURVE_CHOICES,
  defaultSettings,
  manualStart,
  NUMBER_SETTINGS,
  PEN_LIFT_CHOICES,
  usedValues,
} from './settingsModel.js';

/**
 * Every vectorization setting (issue 7): each one is on Auto (matched to the
 * raster by the library) or set by hand, and shows the value used.
 */
export function SettingsPanel({ settings, onSettingsChange, result }) {
  const used = usedValues(result);
  const update = (key, value) =>
    onSettingsChange({ ...settings, [key]: value });
  const manualCount = NUMBER_SETTINGS.filter(
    ({ key }) => !settings[key].auto
  ).length;

  return h(
    'section',
    { className: 'settings-section', 'aria-labelledby': 'settings-title' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      h(
        'button',
        {
          type: 'button',
          className: 'clear-button',
          disabled: manualCount === 0 && settings.penLifts === 'auto',
          onClick: () =>
            onSettingsChange({ ...defaultSettings(), curve: settings.curve }),
        },
        'All auto'
      )
    ),
    NUMBER_SETTINGS.map((field) =>
      h(AutoRangeControl, {
        key: field.key,
        field,
        setting: settings[field.key],
        used: used[field.key],
        onChange: (value) => update(field.key, { auto: false, value }),
        onAuto: (auto) =>
          update(field.key, {
            auto,
            value: auto
              ? settings[field.key].value
              : manualStart(field.key, result),
          }),
      })
    ),
    h(ChoiceControl, {
      label: 'Pen lifts',
      options: PEN_LIFT_CHOICES,
      value: settings.penLifts,
      onChange: (value) => update('penLifts', value),
      hint: 'Auto: lift the pen when retracing costs more. Never: one stroke per shape.',
    }),
    h(ChoiceControl, {
      label: 'Curve',
      options: CURVE_CHOICES,
      value: settings.curve,
      onChange: (value) => update('curve', value),
    })
  );
}
