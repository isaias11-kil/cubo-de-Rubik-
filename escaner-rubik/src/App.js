import React, { useRef, useState, useCallback } from 'react';
import Webcam from "react-webcam";
import { clasificarColor } from './colorUtils'; 
import './App.css';

const videoConstraints = {
  width: 400,
  height: 400,
  facingMode: "user"
};

const ORDEN_CARAS = ['U', 'R', 'F', 'D', 'L', 'B'];

function App() {
  const webcamRef = useRef(null);
  const [capturaProgresiva, setCapturaProgresiva] = useState({
    carasEscaneadas: 0,
    datos: { U: [], R: [], F: [], D: [], L: [], B: [] },
  });

  // Función para capturar la cara actual
  const capturarCaraActual = () => {
    console.log("Intentando capturar cara...");

    if (capturaProgresiva.carasEscaneadas >= 6) {
      alert("¡Escaneo ya completado!");
      return;
    }

    if (webcamRef.current) {
      // Tomamos la captura
      const imageSrc = webcamRef.current.getScreenshot();
      
      if (!imageSrc) {
        alert("Error: No se pudo obtener imagen de la cámara. Revisa los permisos.");
        console.error("screenshot null");
        return;
      }

      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 400, 400);

        const step = 400 / 3;
        const offset = step / 2;
        const centros = [0, 1, 2].map(i => Math.floor(i * step + offset));

        let coloresDetectados = [];

        try {
          for (let y of centros) {
            for (let x of centros) {
              const pixel = ctx.getImageData(x, y, 1, 1).data; 
              // Asegúrate de que clasificarColor exista en colorUtils.js
              const letraColor = clasificarColor(pixel[0], pixel[1], pixel[2]);
              coloresDetectados.push(letraColor);
            }
          }

          const caraNombre = ORDEN_CARAS[capturaProgresiva.carasEscaneadas];
          
          setCapturaProgresiva(prev => ({
            carasEscaneadas: prev.carasEscaneadas + 1,
            datos: {
              ...prev.datos,
              [caraNombre]: coloresDetectados
            }
          }));
          console.log(`Cara ${caraNombre} capturada:`, coloresDetectados);

        } catch (error) {
          console.error("Error procesando colores:", error);
          alert("Error al procesar los colores. Revisa la consola (F12).");
        }
      };
    }
  };

  const reiniciarEscaneo = () => {
    setCapturaProgresiva({
      carasEscaneadas: 0,
      datos: { U: [], R: [], F: [], D: [], L: [], B: [] },
    });
  };

  const caraSiguiente = ORDEN_CARAS[capturaProgresiva.carasEscaneadas];

  return (
    <div className="App">
      <h1>Escaner del Robot de Rubik</h1>
      
      {capturaProgresiva.carasEscaneadas < 6 ? (
        <>
          <h3>Paso {capturaProgresiva.carasEscaneadas + 1} de 6: Muestra la cara {caraSiguiente}</h3>
          <div className="camera-container">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              onUserMediaError={() => alert("¡Error de cámara! Asegúrate de que ninguna otra app la esté usando.")}
              className="webcam-feed"
            />
            
            <div className="grid-overlay">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="grid-cell">
                   <div className="center-dot"></div>
                </div>
              ))}
            </div>
          </div>
          
          <button className="btn-capturar" onClick={capturarCaraActual}>
            Capturar Cara {caraSiguiente}
          </button>
        </>
      ) : (
        <div className="final-container">
          <h2>¡Escaneo Completo!</h2>
          <button className="btn-capturar" onClick={reiniciarEscaneo}>Escanear de Nuevo</button>
        </div>
      )}
      
      <EstadoDelCuboVisualizado datos={capturaProgresiva.datos} completado={capturaProgresiva.carasEscaneadas === 6} />
    </div>
  );
}

function EstadoDelCuboVisualizado({ datos, completado }) {
  if (!completado) return null;
  return (
    <div className="resultados">
      <h3>Datos para el Robot:</h3>
      <pre>{JSON.stringify(datos, null, 2)}</pre>
    </div>
  );
}

export default App;