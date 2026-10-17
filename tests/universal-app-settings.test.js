import { describe, it, expect } from 'test-anywhere';
import { readFileSync } from 'node:fs';

import { parsePenRecording, vectorizeRasterLine } from '../src/index.js';
import {
  MNIST_SAMPLE_HEIGHT,
  MNIST_SAMPLE_PIXELS_BASE64,
  MNIST_SAMPLE_WIDTH,
} from '../examples/universal-app/src/mnistSamples.js';
import {
  defaultSettings,
  manualStart,
  NUMBER_SETTINGS,
  settingsFromOptions,
  settingsToOptions,
  usedValues,
} from '../examples/universal-app/src/settingsModel.js';
import {
  fitRecording,
  recordingForExport,
  recordingSummary,
} from '../examples/universal-app/src/recordingModel.js';
import { rasterizePenRecording } from '../src/pen-recording.js';

function mnistSample(index) {
  const size = MNIST_SAMPLE_WIDTH * MNIST_SAMPLE_HEIGHT;
  const bytes = Buffer.from(MNIST_SAMPLE_PIXELS_BASE64, 'base64');

  return {
    width: MNIST_SAMPLE_WIDTH,
    height: MNIST_SAMPLE_HEIGHT,
    pixels: bytes.subarray(index * size, (index + 1) * size),
  };
}

function withManual(settings, key, value) {
  return { ...settings, [key]: { auto: false, value } };
}

const recordingText = readFileSync(
  'examples/recordings/seven-barred.lino',
  'utf8'
);

describe('web app settings (issue 7)', () => {
  it('starts with every setting on Auto, matched to the raster', () => {
    const settings = defaultSettings();
    const options = settingsToOptions(settings);

    NUMBER_SETTINGS.forEach(({ key }) => {
      expect(settings[key].auto).toBe(true);
      expect(options[key]).toBe(undefined);
    });
    expect(options.foreground).toBe('auto');

    const result = vectorizeRasterLine(mnistSample(0), options);
    const used = usedValues(result);

    expect(result.thresholding.auto).toBe(true);
    expect(result.thresholding.foreground).toBe('light');
    expect(result.settings.automatic).toEqual([
      'foreground',
      'threshold',
      'simplifyTolerance',
      'strokeWidth',
    ]);
    expect(used.threshold).toContain('light ink');
    expect(used.maxPoints).toContain(`${result.points.length} used`);
    NUMBER_SETTINGS.forEach(({ key }) => {
      expect(typeof used[key]).toBe('string');
    });
  });

  it('starts a setting switched to manual from the value Auto chose', () => {
    const options = settingsToOptions(defaultSettings());
    const result = vectorizeRasterLine(mnistSample(0), options);
    let settings = defaultSettings();

    NUMBER_SETTINGS.forEach(({ key, min, max }) => {
      const value = manualStart(key, result);

      expect(value >= min && value <= max).toBe(true);
      settings = withManual(settings, key, value);
    });

    expect(manualStart('threshold', result)).toBe(
      result.thresholding.threshold
    );

    const manual = vectorizeRasterLine(
      mnistSample(0),
      settingsToOptions(settings)
    );
    expect(manual.strokes.length).toBe(result.strokes.length);
    expect(manual.points.length).toBe(result.points.length);
  });

  it('applies every manual setting', () => {
    let settings = defaultSettings();
    const manual = {
      threshold: 40,
      simplifyTolerance: 1.5,
      pointCost: 2,
      maxPoints: 1,
      penLiftCost: 5,
      fillHoles: 4,
      lookAhead: 5,
      strokeWidth: 3,
    };

    Object.entries(manual).forEach(([key, value]) => {
      settings = withManual(settings, key, value);
    });
    settings = { ...settings, penLifts: 'never', curve: 'smooth' };

    const options = settingsToOptions(settings);
    const result = vectorizeRasterLine(mnistSample(0), options);

    Object.entries(manual).forEach(([key, value]) => {
      expect(result.settings[key]).toBe(value);
    });
    expect(result.settings.penLifts).toBe(false);
    expect(result.settings.curve).toBe('smooth');
    expect(result.settings.automatic).toEqual(['foreground']);
    // One point per shape: every shape is explained by a single dot.
    expect(
      result.simplification.shapes.every((shape) => shape.points === 1)
    ).toBe(true);
  });

  it('turns saved options back into the settings that produced them', () => {
    let settings = withManual(defaultSettings(), 'maxPoints', 3);
    settings = withManual(settings, 'threshold', 50);
    settings = { ...settings, curve: 'smooth', penLifts: 'never' };

    const restored = settingsFromOptions(settingsToOptions(settings));

    expect(restored).toEqual(settings);
    expect(settingsFromOptions({ simplifyTolerance: 'auto' })).toEqual(
      defaultSettings()
    );
  });
});

describe('web app pen recordings (issue 7)', () => {
  it('summarizes and exports a recording with the options used', () => {
    const recording = parsePenRecording(recordingText);
    const summary = recordingSummary(recording);
    const exported = recordingForExport(recording, { maxPoints: 2 });

    expect(summary.strokes).toBe(2);
    expect(summary.samples).toBe(
      recording.strokes.reduce((sum, stroke) => sum + stroke.samples.length, 0)
    );
    expect(summary.duration > 0).toBe(true);
    expect(exported.options).toEqual({ maxPoints: 2 });
    expect(recording.options).toEqual({ threshold: 32, alphaThreshold: 24 });
  });

  it('fits a recording from another canvas size onto the drawing canvas', () => {
    const recording = parsePenRecording(recordingText);
    const half = fitRecording(recording, 140);
    const same = fitRecording(recording, 280);
    const [first] = recording.strokes[0].samples;
    const [scaled] = half.strokes[0].samples;

    expect(same).toBe(recording);
    expect([half.width, half.height]).toEqual([140, 140]);
    expect(half.brush).toEqual({ width: 4.5, pressureWidth: 9 });
    expect(Math.abs(scaled.x - first.x / 2) < 1e-9).toBe(true);
    expect(Math.abs(scaled.y - first.y / 2) < 1e-9).toBe(true);
    expect(scaled.t).toBe(first.t);

    const strokes = (raster) =>
      vectorizeRasterLine(raster, recording.options).strokes.length;
    expect(strokes(rasterizePenRecording(half))).toBe(2);
  });
});
