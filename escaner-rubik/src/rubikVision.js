const OPENCV_SCRIPT_ID = 'opencv-js-runtime';
const OPENCV_SCRIPT_URL = 'https://docs.opencv.org/4.x/opencv.js';

const DEFAULT_COLOR_RANGES = {
  W: [{ low: [0, 0, 130], high: [179, 70, 255] }],
  R: [
    { low: [0, 90, 45], high: [10, 255, 255] },
    { low: [170, 90, 45], high: [179, 255, 255] },
  ],
  O: [{ low: [11, 95, 50], high: [24, 255, 255] }],
  Y: [{ low: [25, 80, 65], high: [42, 255, 255] }],
  G: [{ low: [43, 70, 45], high: [95, 255, 255] }],
  B: [{ low: [96, 80, 40], high: [140, 255, 255] }],
};

let openCvReadyPromise = null;

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isOpenCvReady(cv) {
  return cv && typeof cv.Mat === 'function' && typeof cv.inRange === 'function';
}

function createHueRanges(hue, tolerance) {
  const normalizedHue = clampValue(Math.round(hue), 0, 179);
  const delta = clampValue(Math.round(tolerance), 6, 24);
  const lower = normalizedHue - delta;
  const upper = normalizedHue + delta;

  if (lower >= 0 && upper <= 179) {
    return [{ lowHue: lower, highHue: upper }];
  }

  if (lower < 0) {
    return [
      { lowHue: 0, highHue: upper },
      { lowHue: 180 + lower, highHue: 179 },
    ];
  }

  return [
    { lowHue: lower, highHue: 179 },
    { lowHue: 0, highHue: upper - 180 },
  ];
}

function buildCalibratedRanges(colorKey, sample, adaptiveThresholds) {
  if (!sample) {
    return null;
  }

  const satMin = clampValue(Math.round(sample.s * 0.58), 8, 185);
  const valMin = clampValue(Math.round(sample.v * 0.48), adaptiveThresholds.minValue, 220);

  if (colorKey === 'W') {
    const highSat = clampValue(Math.round(sample.s + 28), 20, 120);
    const lowVal = clampValue(Math.round(sample.v - 40), 90, 235);
    return [{ low: [0, 0, lowVal], high: [179, highSat, 255] }];
  }

  const hueRanges = createHueRanges(sample.h / 2, 14);
  return hueRanges.map((range) => ({
    low: [range.lowHue, satMin, valMin],
    high: [range.highHue, 255, 255],
  }));
}

function buildAdaptiveRanges(calibration, adaptiveThresholds) {
  const ranges = {};
  const keys = Object.keys(DEFAULT_COLOR_RANGES);

  for (const colorKey of keys) {
    const calibratedRanges = buildCalibratedRanges(colorKey, calibration[colorKey], adaptiveThresholds);
    const baseRanges = DEFAULT_COLOR_RANGES[colorKey].map((range) => ({
      low: [
        range.low[0],
        clampValue(range.low[1] - adaptiveThresholds.satRelax, 0, 255),
        clampValue(range.low[2] - adaptiveThresholds.valueRelax, 0, 255),
      ],
      high: [...range.high],
    }));

    ranges[colorKey] = calibratedRanges && calibratedRanges.length > 0 ? calibratedRanges : baseRanges;
  }

  return ranges;
}

function classifyByMean(meanH, meanS, meanV, adaptiveThresholds) {
  if (meanS < adaptiveThresholds.whiteSatMax && meanV > adaptiveThresholds.whiteValueMin) {
    return 'W';
  }

  if (meanV < adaptiveThresholds.minValue) {
    return '?';
  }

  if (meanH <= 10 || meanH >= 170) return 'R';
  if (meanH > 10 && meanH <= 24) return 'O';
  if (meanH > 24 && meanH <= 42) return 'Y';
  if (meanH > 42 && meanH <= 95) return 'G';
  if (meanH > 95 && meanH <= 140) return 'B';
  return '?';
}

function computeAdaptiveThresholds(globalMeanValue) {
  const valueRelax = clampValue(Math.round((130 - globalMeanValue) * 0.24), 0, 30);
  const satRelax = clampValue(Math.round((120 - globalMeanValue) * 0.18), 0, 25);
  const whiteSatMax = clampValue(Math.round(58 + satRelax * 0.8), 48, 92);
  const whiteValueMin = clampValue(Math.round(globalMeanValue * 0.73), 85, 185);
  const minValue = clampValue(Math.round(globalMeanValue * 0.36), 24, 78);

  return {
    satRelax,
    valueRelax,
    whiteSatMax,
    whiteValueMin,
    minValue,
  };
}

export function loadOpenCv() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV solo esta disponible en navegador.'));
  }

  if (isOpenCvReady(window.cv)) {
    return Promise.resolve(window.cv);
  }

  if (openCvReadyPromise) {
    return openCvReadyPromise;
  }

  openCvReadyPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(OPENCV_SCRIPT_ID);
    let checkInterval = null;

    const checkAndResolve = () => {
      if (isOpenCvReady(window.cv)) {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        resolve(window.cv);
        return true;
      }
      return false;
    };

    // Prepare OpenCV initialization hook before loading the script
    window.cv = window.cv || {};
    const previousInit = window.cv.onRuntimeInitialized;
    window.cv.onRuntimeInitialized = () => {
      if (typeof previousInit === 'function') {
        previousInit();
      }
      checkAndResolve();
    };

    const handleOnLoad = () => {
      if (checkAndResolve()) return;

      // Fallback polling in case onRuntimeInitialized was missed
      checkInterval = setInterval(() => {
        checkAndResolve();
      }, 100);

      // Stop polling after 15 seconds to avoid memory leaks
      setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        if (!isOpenCvReady(window.cv)) {
          reject(new Error('Timeout: OpenCV no inicializo despues de cargar.'));
        }
      }, 15000);
    };

    if (existingScript) {
      handleOnLoad();
      return;
    }

    const script = document.createElement('script');
    script.id = OPENCV_SCRIPT_ID;
    script.async = true;
    script.src = OPENCV_SCRIPT_URL;
    script.onerror = () => {
      if (checkInterval) clearInterval(checkInterval);
      reject(new Error('No se pudo cargar opencv.js'));
    };
    script.onload = () => handleOnLoad();

    document.head.appendChild(script);
  });

  return openCvReadyPromise;
}

export class RubikOpenCvDetector {
  constructor({ gridSize = 3, detectionSize = 240 } = {}) {
    this.gridSize = gridSize;
    this.detectionSize = detectionSize;
  }

  detectFromCanvas(canvas, calibration = {}) {
    if (!isOpenCvReady(window.cv)) {
      throw new Error('OpenCV no esta listo.');
    }

    const cv = window.cv;
    const source = cv.imread(canvas);
    const blurred = new cv.Mat();
    const hsv = new cv.Mat();
    const rgb = new cv.Mat();

    try {
      cv.GaussianBlur(source, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      cv.cvtColor(blurred, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

      const globalMean = cv.mean(hsv);
      const adaptiveThresholds = computeAdaptiveThresholds(globalMean[2]);
      const colorRanges = buildAdaptiveRanges(calibration, adaptiveThresholds);

      const cellSize = Math.floor(this.detectionSize / this.gridSize);
      const margin = Math.floor(cellSize * 0.18);
      const colors = [];
      const confidences = [];

      for (let row = 0; row < this.gridSize; row += 1) {
        for (let col = 0; col < this.gridSize; col += 1) {
          const x = col * cellSize + margin;
          const y = row * cellSize + margin;
          const width = cellSize - margin * 2;
          const height = cellSize - margin * 2;
          const rect = new cv.Rect(x, y, width, height);
          const roi = hsv.roi(rect);

          const result = this.classifyCell(roi, colorRanges, adaptiveThresholds);
          colors.push(result.color);
          confidences.push(result.confidence);
          roi.delete();
        }
      }

      const confidence =
        confidences.reduce((acc, value) => acc + value, 0) / (confidences.length || 1);

      return {
        colors,
        confidence,
        brightness: globalMean[2],
      };
    } finally {
      source.delete();
      blurred.delete();
      rgb.delete();
      hsv.delete();
    }
  }

  classifyCell(cellMat, colorRanges, adaptiveThresholds) {
    const cv = window.cv;
    const keys = ['W', 'R', 'O', 'Y', 'G', 'B'];
    const totalPixels = cellMat.rows * cellMat.cols;
    const mask = new cv.Mat();
    const tempMask = new cv.Mat();
    const scoreByColor = {};

    try {
      for (const colorKey of keys) {
        let mergedCount = 0;

        for (const range of colorRanges[colorKey]) {
          cv.inRange(
            cellMat,
            new cv.Scalar(range.low[0], range.low[1], range.low[2], 0),
            new cv.Scalar(range.high[0], range.high[1], range.high[2], 255),
            tempMask
          );

          if (mergedCount === 0) {
            tempMask.copyTo(mask);
          } else {
            cv.bitwise_or(mask, tempMask, mask);
          }

          mergedCount += 1;
        }

        scoreByColor[colorKey] = cv.countNonZero(mask) / totalPixels;
      }
    } finally {
      mask.delete();
      tempMask.delete();
    }

    const sortedScores = Object.entries(scoreByColor).sort((a, b) => b[1] - a[1]);
    const [bestColor, bestScore] = sortedScores[0];
    const secondScore = sortedScores[1] ? sortedScores[1][1] : 0;

    if (bestScore < 0.055) {
      const mean = cv.mean(cellMat);
      const fallbackColor = classifyByMean(mean[0], mean[1], mean[2], adaptiveThresholds);
      return {
        color: fallbackColor,
        confidence: 0.08,
      };
    }

    return {
      color: bestColor,
      confidence: clampValue(bestScore - secondScore + bestScore * 0.2, 0.1, 1),
    };
  }

  sampleCenterHsv(canvas) {
    if (!isOpenCvReady(window.cv)) {
      return null;
    }

    const cv = window.cv;
    const source = cv.imread(canvas);
    const hsv = new cv.Mat();
    const rgb = new cv.Mat();

    try {
      cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

      const sampleSize = Math.floor(this.detectionSize * 0.18);
      const x = Math.floor(this.detectionSize / 2 - sampleSize / 2);
      const y = Math.floor(this.detectionSize / 2 - sampleSize / 2);
      const roi = hsv.roi(new cv.Rect(x, y, sampleSize, sampleSize));
      const mean = cv.mean(roi);
      roi.delete();

      return {
        h: mean[0] * 2,
        s: (mean[1] / 255) * 100,
        v: (mean[2] / 255) * 100,
      };
    } finally {
      source.delete();
      rgb.delete();
      hsv.delete();
    }
  }

  dispose() {
    return undefined;
  }
}
