import React, { useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { clasificarColorDesdeContexto, rgbToHsv } from './colorUtils';
import { RubikOpenCvDetector, loadOpenCv } from './rubikVision';
import './App.css';

const CAMERA_SIZE = 400;
const DETECTION_SIZE = 240;
const GRID_SIZE = 3;
const ORDEN_CARAS = ['U', 'R', 'F', 'D', 'L', 'B'];
const GRID_CELLS = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index);
const CALIBRATION_COLORS = ['W', 'R', 'O', 'Y', 'G', 'B'];
const CALIBRATION_STORAGE_KEY = 'rubik_color_calibration_v1';

const videoConstraints = {
  width: CAMERA_SIZE,
  height: CAMERA_SIZE,
  facingMode: 'user',
};

function crearEstadoInicial() {
  return {
    carasEscaneadas: 0,
    datos: { U: [], R: [], F: [], D: [], L: [], B: [] },
  };
}

function obtenerCentrosDeLectura(size) {
  const step = size / GRID_SIZE;
  const offset = step / 2;

  return Array.from({ length: GRID_SIZE }, (_, index) => Math.floor(index * step + offset));
}

function detectarColoresFallback(ctx) {
  const centros = obtenerCentrosDeLectura(ctx.canvas.width);
  const coloresDetectados = [];

  for (const y of centros) {
    for (const x of centros) {
      coloresDetectados.push(clasificarColorDesdeContexto(ctx, x, y, 12));
    }
  }

  return { colors: coloresDetectados, confidence: 0.3 };
}

function leerCalibracionGuardada() {
  try {
    const rawValue = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    return typeof parsedValue === 'object' && parsedValue ? parsedValue : {};
  } catch (error) {
    console.warn('No se pudo leer la calibracion guardada:', error);
    return {};
  }
}

function calcularPromedioRgb(ctx, sampleSize = 24) {
  const centerX = Math.floor(ctx.canvas.width / 2);
  const centerY = Math.floor(ctx.canvas.height / 2);
  const x = Math.max(0, centerX - Math.floor(sampleSize / 2));
  const y = Math.max(0, centerY - Math.floor(sampleSize / 2));
  const { data } = ctx.getImageData(x, y, sampleSize, sampleSize);

  let r = 0;
  let g = 0;
  let b = 0;

  for (let index = 0; index < data.length; index += 4) {
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
  }

  const totalPixels = data.length / 4;
  return {
    r: Math.round(r / totalPixels),
    g: Math.round(g / totalPixels),
    b: Math.round(b / totalPixels),
  };
}

function obtenerEtiquetaEstado(camaraLista, procesando, escaneoCompleto, opencvStatus) {
  if (escaneoCompleto) {
    return 'Completado';
  }

  if (procesando) {
    return 'Procesando';
  }

  if (opencvStatus === 'loading') {
    return 'Cargando OpenCV';
  }

  if (opencvStatus === 'error') {
    return 'Modo fallback';
  }

  return camaraLista ? 'Listo' : 'Esperando camara';
}

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const procesandoRef = useRef(false);
  const isMountedRef = useRef(true);

  const [capturaProgresiva, setCapturaProgresiva] = useState(crearEstadoInicial);
  const [mensajeEstado, setMensajeEstado] = useState('Alinea la cara frontal del cubo dentro de la cuadricula para empezar.');
  const [camaraLista, setCamaraLista] = useState(false);
  const [opencvStatus, setOpenCvStatus] = useState('loading');
  const [ultimaConfianza, setUltimaConfianza] = useState(null);
  const [colorCalibracionSeleccionado, setColorCalibracionSeleccionado] = useState('W');
  const [calibracionColores, setCalibracionColores] = useState(leerCalibracionGuardada);

  useEffect(() => {
    isMountedRef.current = true;

    loadOpenCv()
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }

        detectorRef.current = new RubikOpenCvDetector({
          gridSize: GRID_SIZE,
          detectionSize: DETECTION_SIZE,
        });
        setOpenCvStatus('ready');
        setMensajeEstado('OpenCV listo. La deteccion trabaja en HSV con reduccion de ruido.');
      })
      .catch((error) => {
        console.warn('OpenCV no se pudo cargar, se usara fallback:', error);
        if (!isMountedRef.current) {
          return;
        }

        setOpenCvStatus('error');
        setMensajeEstado('OpenCV no esta disponible. Se uso el detector fallback.');
      });

    return () => {
      isMountedRef.current = false;
      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibracionColores));
    } catch (error) {
      console.warn('No se pudo guardar calibracion:', error);
    }
  }, [calibracionColores]);

  const obtenerContextoCanvas = () => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = DETECTION_SIZE;
      canvas.height = DETECTION_SIZE;
      canvasRef.current = canvas;
    }

    return canvasRef.current.getContext('2d', { willReadFrequently: true });
  };

  const procesarFrame = (imageElement) => {
    const ctx = obtenerContextoCanvas();

    if (!ctx) {
      throw new Error('No se pudo inicializar el contexto del canvas.');
    }

    ctx.clearRect(0, 0, DETECTION_SIZE, DETECTION_SIZE);
    ctx.drawImage(imageElement, 0, 0, DETECTION_SIZE, DETECTION_SIZE);

    if (opencvStatus === 'ready' && detectorRef.current) {
      return detectorRef.current.detectFromCanvas(ctx.canvas, calibracionColores);
    }

    return detectarColoresFallback(ctx);
  };

  const capturarCaraActual = () => {
    if (procesandoRef.current) {
      setMensajeEstado('Estoy procesando la captura anterior. Espera un momento.');
      return;
    }

    if (capturaProgresiva.carasEscaneadas >= ORDEN_CARAS.length) {
      setMensajeEstado('El escaneo ya esta completo.');
      return;
    }

    if (!webcamRef.current) {
      setMensajeEstado('La camara todavia no esta disponible.');
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();

    if (!imageSrc) {
      setMensajeEstado('No se pudo obtener una imagen de la camara. Revisa permisos.');
      return;
    }

    const indiceCara = capturaProgresiva.carasEscaneadas;
    const caraNombre = ORDEN_CARAS[indiceCara];
    const img = new Image();

    procesandoRef.current = true;
    setMensajeEstado(`Procesando cara ${caraNombre} con ${opencvStatus === 'ready' ? 'OpenCV' : 'fallback'}...`);

    img.onload = () => {
      try {
        const resultado = procesarFrame(img);

        setCapturaProgresiva((prev) => {
          if (prev.carasEscaneadas !== indiceCara) {
            return prev;
          }

          return {
            carasEscaneadas: prev.carasEscaneadas + 1,
            datos: {
              ...prev.datos,
              [caraNombre]: resultado.colors,
            },
          };
        });

        setUltimaConfianza(resultado.confidence);

        if (resultado.confidence < 0.11) {
          setMensajeEstado(`Cara ${caraNombre} capturada, pero con confianza baja (${resultado.confidence.toFixed(2)}).`);
        } else {
          setMensajeEstado(`Cara ${caraNombre} capturada con confianza ${resultado.confidence.toFixed(2)}.`);
        }
      } catch (error) {
        console.error('Error procesando colores:', error);
        setMensajeEstado('Error al procesar colores. Revisa la consola para mas detalle.');
      } finally {
        procesandoRef.current = false;
      }
    };

    img.onerror = () => {
      procesandoRef.current = false;
      setMensajeEstado('No se pudo cargar la imagen capturada desde la camara.');
    };

    img.src = imageSrc;
  };

  const capturarMuestraCalibracion = () => {
    if (!webcamRef.current) {
      setMensajeEstado('La camara no esta lista para calibrar.');
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      setMensajeEstado('No se pudo capturar imagen para calibrar.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const ctx = obtenerContextoCanvas();
        if (!ctx) {
          throw new Error('Canvas de calibracion no disponible.');
        }

        ctx.clearRect(0, 0, DETECTION_SIZE, DETECTION_SIZE);
        ctx.drawImage(img, 0, 0, DETECTION_SIZE, DETECTION_SIZE);

        let sampleHsv = null;

        if (opencvStatus === 'ready' && detectorRef.current) {
          sampleHsv = detectorRef.current.sampleCenterHsv(ctx.canvas);
        }

        if (!sampleHsv) {
          const meanRgb = calcularPromedioRgb(ctx);
          sampleHsv = rgbToHsv(meanRgb.r, meanRgb.g, meanRgb.b);
        }

        setCalibracionColores((prev) => ({
          ...prev,
          [colorCalibracionSeleccionado]: sampleHsv,
        }));

        setMensajeEstado(
          `Calibracion ${colorCalibracionSeleccionado} guardada (H:${sampleHsv.h.toFixed(1)} S:${sampleHsv.s.toFixed(1)} V:${sampleHsv.v.toFixed(1)}).`
        );
      } catch (error) {
        console.error('Error al calibrar:', error);
        setMensajeEstado('No se pudo guardar calibracion para ese color.');
      }
    };

    img.src = imageSrc;
  };

  const limpiarCalibracion = () => {
    setCalibracionColores({});
    setMensajeEstado('Calibracion eliminada. Se retomaron rangos base.');
  };

  const reiniciarEscaneo = () => {
    procesandoRef.current = false;
    setCapturaProgresiva(crearEstadoInicial());
    setUltimaConfianza(null);
    setMensajeEstado('Escaneo reiniciado. Vuelve a alinear la primera cara.');
  };

  const caraSiguiente = ORDEN_CARAS[capturaProgresiva.carasEscaneadas];
  const escaneoCompleto = capturaProgresiva.carasEscaneadas === ORDEN_CARAS.length;
  const botonDeshabilitado = !camaraLista || procesandoRef.current;
  const pasosRestantes = ORDEN_CARAS.length - capturaProgresiva.carasEscaneadas;
  const progreso = Math.round((capturaProgresiva.carasEscaneadas / ORDEN_CARAS.length) * 100);
  const etiquetaEstado = obtenerEtiquetaEstado(camaraLista, procesandoRef.current, escaneoCompleto, opencvStatus);
  const totalCalibrados = useMemo(() => Object.keys(calibracionColores).length, [calibracionColores]);

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <main className="app-layout">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Escaner inteligente</span>
            <h1>Escaner del Robot de Rubik</h1>
            <p className="hero-description">
              Deteccion por OpenCV: conversion HSV, blur, segmentacion por color y clasificacion dominante en grilla 3x3.
            </p>
          </div>

          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-label">Progreso</span>
              <strong>{progreso}%</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Estado</span>
              <strong>{etiquetaEstado}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Restantes</span>
              <strong>{pasosRestantes}</strong>
            </div>
          </div>
        </section>

        <section className="scanner-grid">
          <section className="scanner-card">
            <header className="panel-header">
              <div>
                <span className="section-kicker">Captura guiada</span>
                <h2>Flujo de escaneo</h2>
              </div>
              <span className={`status-pill ${camaraLista ? 'status-pill-ready' : 'status-pill-pending'}`}>
                {camaraLista ? 'Camara activa' : 'Conectando camara'}
              </span>
            </header>

            <div className="progress-block" aria-label="Progreso del escaneo">
              <div className="progress-meta">
                <span>
                  Paso {!escaneoCompleto ? capturaProgresiva.carasEscaneadas + 1 : ORDEN_CARAS.length} de {ORDEN_CARAS.length}
                </span>
                <span>{progreso}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progreso}%` }} />
              </div>
            </div>

            <div className="status-card">
              <p className="status-title">Siguiente accion</p>
              <p className="status-text">
                {escaneoCompleto
                  ? 'El cubo ya fue escaneado. Puedes revisar datos o iniciar un nuevo ciclo.'
                  : `Muestra la cara ${caraSiguiente} y manten el cubo centrado antes de capturar.`}
              </p>
              <p className="status-note">{mensajeEstado}</p>
              {ultimaConfianza !== null ? (
                <p className="status-note">
                  Confianza ultima captura: <strong>{ultimaConfianza.toFixed(2)}</strong>
                </p>
              ) : null}
            </div>

            {!escaneoCompleto ? (
              <>
                <div className="camera-frame">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={videoConstraints}
                    onUserMedia={() => {
                      setCamaraLista(true);
                      setMensajeEstado('Camara lista. Mantenga el cubo centrado y capture una cara a la vez.');
                    }}
                    onUserMediaError={() => {
                      setCamaraLista(false);
                      setMensajeEstado('No se pudo acceder a la camara. Cierre otras apps y revise permisos.');
                    }}
                    className="webcam-feed"
                  />

                  <div className="grid-overlay">
                    {GRID_CELLS.map((cell) => (
                      <div key={cell} className="grid-cell">
                        <div className="center-dot" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="action-row">
                  <button className="btn btn-primary" onClick={capturarCaraActual} disabled={botonDeshabilitado}>
                    {procesandoRef.current ? 'Procesando...' : `Capturar cara ${caraSiguiente}`}
                  </button>
                  <button className="btn btn-secondary" onClick={reiniciarEscaneo}>
                    Reiniciar
                  </button>
                </div>
              </>
            ) : (
              <div className="completion-card">
                <div>
                  <span className="section-kicker">Listo para usar</span>
                  <h3>Escaneo completo</h3>
                  <p>Los datos del cubo ya estan listos para enviarse al robot.</p>
                </div>
                <button className="btn btn-primary" onClick={reiniciarEscaneo}>
                  Escanear de nuevo
                </button>
              </div>
            )}
          </section>

          <aside className="info-card">
            <header className="panel-header panel-header-compact">
              <div>
                <span className="section-kicker">Asistencia</span>
                <h2>Guia rapida</h2>
              </div>
            </header>

            <ul className="tips-list">
              <li>Usa luz uniforme para elevar precision en HSV y evitar saturaciones falsas.</li>
              <li>Evita reflejos fuertes, la etapa blur reduce ruido pero no elimina brillos especulares.</li>
              <li>Si el entorno cambia, usa la calibracion y vuelve a capturar las muestras.</li>
            </ul>

            <div className="face-sequence">
              <p className="face-sequence-label">Orden de captura</p>
              <div className="face-badges">
                {ORDEN_CARAS.map((cara, index) => {
                  const activa = index === capturaProgresiva.carasEscaneadas && !escaneoCompleto;
                  const completada = index < capturaProgresiva.carasEscaneadas;

                  return (
                    <span
                      key={cara}
                      className={`face-badge ${activa ? 'face-badge-active' : ''} ${completada ? 'face-badge-done' : ''}`}
                    >
                      {cara}
                    </span>
                  );
                })}
              </div>
            </div>

            <section className="calibration-card">
              <div className="calibration-header">
                <span className="section-kicker">Calibracion opcional</span>
                <span className="status-pill status-pill-pending">{totalCalibrados} colores guardados</span>
              </div>
              <p className="resultados-copy">
                Selecciona un color y apunta el sticker al centro de la camara. Esto ajusta rangos HSV para tu luz.
              </p>
              <div className="calibration-controls">
                <label className="select-field" htmlFor="color-calibration-select">
                  Color
                </label>
                <select
                  id="color-calibration-select"
                  value={colorCalibracionSeleccionado}
                  onChange={(event) => setColorCalibracionSeleccionado(event.target.value)}
                >
                  {CALIBRATION_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
                <div className="action-row action-row-compact">
                  <button className="btn btn-primary" onClick={capturarMuestraCalibracion} disabled={!camaraLista}>
                    Guardar muestra
                  </button>
                  <button className="btn btn-secondary" onClick={limpiarCalibracion}>
                    Limpiar calibracion
                  </button>
                </div>
                <div className="chip-row">
                  {CALIBRATION_COLORS.map((color) => (
                    <span key={color} className={`chip ${calibracionColores[color] ? 'chip-ready' : ''}`}>
                      {color}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <EstadoDelCuboVisualizado datos={capturaProgresiva.datos} completado={escaneoCompleto} />
          </aside>
        </section>
      </main>
    </div>
  );
}

function EstadoDelCuboVisualizado({ datos, completado }) {
  return (
    <section className="resultados">
      <div className="resultados-header">
        <div>
          <span className="section-kicker">Salida</span>
          <h3>Datos para el robot</h3>
        </div>
        <span className={`status-pill ${completado ? 'status-pill-ready' : 'status-pill-pending'}`}>
          {completado ? 'Disponible' : 'Pendiente'}
        </span>
      </div>

      <p className="resultados-copy">
        {completado
          ? 'Resultado final listo para integrarse con el robot.'
          : 'Los datos apareceran aqui al completar la captura de las 6 caras.'}
      </p>

      <pre>{JSON.stringify(datos, null, 2)}</pre>
    </section>
  );
}

export default App;
