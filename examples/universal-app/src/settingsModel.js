/**
 * Vectorization settings of the app (issue 7): every setting can be set by
 * hand, or left on Auto so the library matches it to the raster. Pure
 * functions, so the mapping to library options is tested without a browser.
 */

/** Numeric settings: the library option, slider range and manual default. */
export const NUMBER_SETTINGS = [
  {
    key: 'threshold',
    label: 'Threshold',
    min: 1,
    max: 254,
    step: 1,
    manual: 32,
    hint: 'Auto: ink polarity and Otsu threshold for this raster.',
  },
  {
    key: 'simplifyTolerance',
    label: 'Simplify',
    min: 0,
    max: 8,
    step: 0.05,
    manual: 0.85,
    suffix: ' px',
    hint: 'Auto: per shape, the fewest points that still explain its ink.',
  },
  {
    key: 'pointCost',
    label: 'Point cost',
    min: 0.1,
    max: 10,
    step: 0.1,
    manual: 1,
    hint: 'Ink (pen-width squares) a point must explain to be kept.',
  },
  {
    key: 'maxPoints',
    label: 'Max points per shape',
    min: 1,
    max: 40,
    step: 1,
    manual: 4,
    hint: 'Auto: no budget. 1 explains each shape with a single dot.',
  },
  {
    key: 'penLiftCost',
    label: 'Pen lift cost',
    min: 0,
    max: 20,
    step: 0.5,
    manual: 2.5,
    hint: 'Pen widths of retracing a pen lift must save.',
  },
  {
    key: 'fillHoles',
    label: 'Fill holes',
    min: 0,
    max: 20,
    step: 1,
    manual: 2,
    suffix: ' px',
    hint: 'Pinholes up to this area are filled before thinning.',
  },
  {
    key: 'lookAhead',
    label: 'Look-ahead',
    min: 1,
    max: 12,
    step: 1,
    manual: 3,
    suffix: ' px',
    hint: 'How far stroke directions are measured at junctions.',
  },
  {
    key: 'strokeWidth',
    label: 'SVG pen width',
    min: 0.5,
    max: 30,
    step: 0.5,
    manual: 2,
    suffix: ' px',
    hint: 'Auto: the measured width of the ink.',
  },
];

export const PEN_LIFT_CHOICES = [
  ['auto', 'Auto'],
  ['never', 'Never'],
];

export const CURVE_CHOICES = [
  ['linear', 'Linear'],
  ['smooth', 'Smooth'],
];

/** Pencil ink is anti-aliased into alpha; faint edges are background. */
export const DRAW_ALPHA_THRESHOLD = 24;

/** Everything on Auto (the library defaults), with the manual values ready. */
export function defaultSettings() {
  return {
    ...Object.fromEntries(
      NUMBER_SETTINGS.map(({ key, manual }) => [
        key,
        { auto: true, value: manual },
      ])
    ),
    penLifts: 'auto',
    curve: 'linear',
  };
}

/**
 * Library options for the settings: settings on Auto are left out, so the
 * library chooses them. The ink polarity is always detected
 * (`foreground: 'auto'`), so one threshold works for MNIST (light ink),
 * drawings and images; with the threshold on Auto it comes from Otsu's
 * method.
 * @param {object} settings - App settings.
 * @returns {object} Options for `vectorizeRasterLine`.
 */
export function settingsToOptions(settings) {
  const options = {
    foreground: 'auto',
    alphaThreshold: DRAW_ALPHA_THRESHOLD,
    curve: settings.curve,
  };

  NUMBER_SETTINGS.forEach(({ key }) => {
    if (!settings[key].auto) {
      options[key] = settings[key].value;
    }
  });

  if (settings.penLifts === 'never') {
    options.penLifts = false;
  }

  return options;
}

/**
 * Settings that reproduce saved options (from a pen recording): every option
 * present becomes a manual setting, everything else stays as in `base`.
 * @param {object} options - Vectorization options.
 * @param {object} [base] - Settings to start from.
 * @returns {object} App settings.
 */
export function settingsFromOptions(options, base = defaultSettings()) {
  const settings = { ...base };

  NUMBER_SETTINGS.forEach(({ key }) => {
    const value = options[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      settings[key] = { auto: false, value };
    } else if (value === 'auto') {
      settings[key] = { ...settings[key], auto: true };
    }
  });

  if (options.penLifts !== undefined) {
    settings.penLifts =
      options.penLifts === false || options.penLifts === 'false'
        ? 'never'
        : 'auto';
  }

  if (options.curve === 'linear' || options.curve === 'smooth') {
    settings.curve = options.curve;
  }

  return settings;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function toleranceRange(shapes) {
  const tolerances = shapes
    .map((shape) => shape.tolerance)
    .filter((tolerance) => tolerance > 0);

  if (tolerances.length === 0) {
    return 'dots only';
  }

  const low = Math.min(...tolerances);
  const high = Math.max(...tolerances);

  return low === high
    ? `${formatNumber(low)} px`
    : `${formatNumber(low)}-${formatNumber(high)} px by shape`;
}

/**
 * What the library used for each setting on this raster, for display next
 * to the Auto switches.
 * @param {import('../../../src/index.d.ts').VectorizationResult} result -
 * Vectorization result.
 * @returns {Record<string, string>} Readable value per setting key.
 */
export function usedValues(result) {
  const { settings, thresholding } = result;
  const ink = thresholding.foreground === 'dark' ? 'dark ink' : 'light ink';

  return {
    threshold: `${thresholding.threshold} (${ink})`,
    simplifyTolerance: toleranceRange(result.simplification.shapes),
    pointCost: formatNumber(settings.pointCost),
    maxPoints:
      settings.maxPoints === null
        ? `none (${result.points.length} used)`
        : String(settings.maxPoints),
    penLiftCost: formatNumber(settings.penLiftCost),
    fillHoles: `${settings.fillHoles} px`,
    lookAhead: `${settings.lookAhead} px`,
    strokeWidth: `${formatNumber(settings.strokeWidth)} px`,
  };
}

function snap(field, value) {
  const stepped = Math.round(value / field.step) * field.step;
  const clamped = Math.min(field.max, Math.max(field.min, stepped));

  return Number(clamped.toFixed(2));
}

/**
 * The manual value a setting starts from when its Auto switch is turned off:
 * what the library chose for this raster, so the result does not jump.
 * @param {string} key - Setting key.
 * @param {import('../../../src/index.d.ts').VectorizationResult} result -
 * Vectorization result.
 * @returns {number} Slider value.
 */
export function manualStart(key, result) {
  const field = NUMBER_SETTINGS.find((entry) => entry.key === key);
  const shapes = result.simplification.shapes;
  const used = {
    threshold: result.thresholding.threshold,
    simplifyTolerance: Math.max(0, ...shapes.map((shape) => shape.tolerance)),
    maxPoints: Math.max(1, ...shapes.map((shape) => shape.points)),
    strokeWidth: result.strokeWidth,
  };

  return snap(field, used[key] ?? result.settings[key] ?? field.manual);
}
