// The owner page (/owner/): its own entry, so visitors' code (the map list, walks, the door) never loads here.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerApp from './OwnerApp';
import './styles.css';
import './journey.css';
import './owner.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OwnerApp />
  </StrictMode>,
);
