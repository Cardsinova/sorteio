import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.jsx';
import './styles/base.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* "user": quem pede menos movimento no sistema recebe as trocas sem deslocamento. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
