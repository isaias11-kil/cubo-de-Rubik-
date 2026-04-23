// src/colorUtils.js

// Convierte valores RGB (0-255) a HSV (H: 0-360, S: 0-100, V: 0-100)
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, v = max;
  let d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max === min) {
    h = 0; // achromático (gris)
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

// Clasifica el color basándose en el Tono (Hue), Saturación y Valor
export function clasificarColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  // Filtro para el BLANCO (Baja saturación, alto brillo)
  if (s < 25 && v > 50) return 'W'; // White
  
  // Filtro para colores oscuros o negros (por si hay bordes)
  if (v < 20) return '?'; 

  // Clasificación por Tono (Hue) - Estos valores requieren calibración con tu luz
  if (h >= 0 && h <= 15) return 'R';      // Red
  if (h > 15 && h <= 45) return 'O';      // Orange
  if (h > 45 && h <= 75) return 'Y';      // Yellow
  if (h > 75 && h <= 150) return 'G';     // Green
  if (h > 150 && h <= 250) return 'B';    // Blue
  if (h > 250 && h <= 360) return 'R';    // Red (el rojo está al principio y al final del círculo cromático)

  return '?'; // Desconocido
}