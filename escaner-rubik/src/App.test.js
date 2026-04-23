import { render, screen } from '@testing-library/react';
import App from './App';


jest.mock('react-webcam', () => ({
  __esModule: true,
  default: () => <div data-testid="webcam-mock" />,
}));

test('muestra el estado inicial del escaneo', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /Escaner del Robot de Rubik/i })).toBeInTheDocument();
  expect(screen.getByText(/Paso 1 de 6/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Capturar cara U/i })).toBeDisabled();
  expect(screen.getByText(/Guia rapida/i)).toBeInTheDocument();
});
