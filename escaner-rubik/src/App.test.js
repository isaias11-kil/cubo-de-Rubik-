import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the initial OpenCV loading state', () => {
  render(<App />);
  const loadingElement = screen.getByText(/Cargando OpenCV.../i);
  expect(loadingElement).toBeInTheDocument();
});
