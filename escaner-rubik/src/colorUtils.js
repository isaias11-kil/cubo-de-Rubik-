const COLOR_DESCONOCIDO = '?';

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function promediarCanales(data) {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  const totalPixeles = data.length / 4;

  for (let index = 0; index < data.length; index += 4) {
    totalR += data[index];
    totalG += data[index + 1];
    totalB += data[index + 2];
  }

  return {
    r: Math.round(totalR / totalPixeles),
    g: Math.round(totalG / totalPixeles),
    b: Math.round(totalB / totalPixeles),
  };
}

export function rgbToHsv(r, g, b) {
  const rojo = r / 255;
  const verde = g / 255;
  const azul = b / 255;

  const max = Math.max(rojo, verde, azul);
  const min = Math.min(rojo, verde, azul);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    switch (max) {
      case rojo:
        h = ((verde - azul) / delta + (verde < azul ? 6 : 0)) * 60;
        break;
      case verde:
        h = ((azul - rojo) / delta + 2) * 60;
        break;
      case azul:
        h = ((rojo - verde) / delta + 4) * 60;
        break;
      default:
        h = 0;
    }
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  return { h, s, v };
}

export function clasificarColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < 25 && v > 55) {
    return 'W';
  }

  if (v < 20) {
    return COLOR_DESCONOCIDO;
  }

  if (h >= 0 && h <= 15) return 'R';
  if (h > 15 && h <= 45) return 'O';
  if (h > 45 && h <= 75) return 'Y';
  if (h > 75 && h <= 150) return 'G';
  if (h > 150 && h <= 250) return 'B';
  if (h > 250 && h <= 360) return 'R';

  return COLOR_DESCONOCIDO;
}

export function clasificarColorDesdeContexto(ctx, centerX, centerY, sampleSize = 12) {
  const x = limitar(Math.round(centerX - sampleSize / 2), 0, ctx.canvas.width - sampleSize);
  const y = limitar(Math.round(centerY - sampleSize / 2), 0, ctx.canvas.height - sampleSize);
  const { data } = ctx.getImageData(x, y, sampleSize, sampleSize);
  const promedio = promediarCanales(data);

  return clasificarColor(promedio.r, promedio.g, promedio.b);
}
