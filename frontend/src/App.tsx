import { NavLink, Route, Routes } from 'react-router-dom';
import { UserSwitcher } from './components/UserSwitcher';
import { ErrorState } from './components/States';
import { DishDetail } from './pages/DishDetail';
import { Home } from './pages/Home';
import { LogMeal } from './pages/LogMeal';
import { Onboarding } from './pages/Onboarding';
import { TasteProfilePage } from './pages/TasteProfilePage';
import { UserProvider, useUser } from './state/UserContext';

function Shell() {
  const { error } = useUser();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink className="brand" to="/">
            MenuSnap
          </NavLink>
          <nav className="nav">
            <NavLink className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`} to="/" end>
              Feed
            </NavLink>
            <NavLink className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`} to="/log">
              Log a meal
            </NavLink>
            <NavLink className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`} to="/profile">
              Taste profile
            </NavLink>
          </nav>
          <UserSwitcher />
        </div>
      </header>

      <main className="content">
        {error && <ErrorState message={error} />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dish/:id" element={<DishDetail />} />
          <Route path="/log" element={<LogMeal />} />
          <Route path="/profile" element={<TasteProfilePage />} />
          <Route
            path="*"
            element={<ErrorState message="That page does not exist. Use the navigation above." />}
          />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <UserProvider>
      <Shell />
    </UserProvider>
  );
}
