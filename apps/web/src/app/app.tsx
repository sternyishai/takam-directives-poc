import { Route, Routes } from 'react-router';
import { DirectivePage } from './directive-page';
import { HomePage } from './home-page';

/**
 * The pages, by URL. The router itself (BrowserRouter) is added in main.tsx,
 * so tests can wrap App in a MemoryRouter at any URL instead.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/directive/:code" element={<DirectivePage />} />
    </Routes>
  );
}

export default App;
