/* Root router — ungit-style URL navigation: #/ (home) and #/repository?path=… */

import { useRoute } from './lib/router';
import { Home } from './components/Home';
import { RepoView } from './RepoView';

export default function App() {
  const route = useRoute();
  if (route.page === 'repo') {
    // key resets all view state when switching repositories
    return <RepoView key={route.path} repoPath={route.path} />;
  }
  return <Home />;
}
