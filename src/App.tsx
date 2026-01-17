import { useState, useEffect, useCallback } from 'react';
import { exit } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { Navigation, DropdownMenu, Onboarding } from './components';
import {
  TodayView,
  TasksView,
  BacklogView,
  NotesView,
  BragDocView,
  PrsView,
  MyPrsView,
  NotificationsView,
  SettingsView,
} from './views';
import { useAppData } from './hooks/useAppData';
import { useNotifications } from './hooks/useNotifications';
import { usePrData } from './hooks/usePrData';
import type { ViewType, Theme, AppData, Settings } from './types';
import './styles/global.css';

function App() {
  const { data, loading, error, saveData, loadData } = useAppData();
  const [activeView, setActiveView] = useState<ViewType>('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const prData = usePrData();

  // Initialize notification scheduling
  useNotifications({
    notifications: data.notifications,
    enabled: data.settings.onboarding_complete,
  });

  // Listen for system wake events to reload data
  useEffect(() => {
    const unlisten = listen('system-wake', () => {
      console.log('System woke from sleep, reloading data...');
      loadData();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadData]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', data.settings.theme);
    document.documentElement.setAttribute(
      'data-mode',
      data.settings.dark_mode ? 'dark' : 'light'
    );
  }, [data.settings.theme, data.settings.dark_mode]);

  const handleThemeChange = useCallback(
    async (theme: Theme) => {
      await saveData({
        ...data,
        settings: {
          ...data.settings,
          theme,
        },
      });
    },
    [data, saveData]
  );

  const handleDarkModeToggle = useCallback(async () => {
    await saveData({
      ...data,
      settings: {
        ...data.settings,
        dark_mode: !data.settings.dark_mode,
      },
    });
  }, [data, saveData]);

  const handleDataChange = useCallback(
    async (newData: AppData) => {
      await saveData(newData);
    },
    [saveData]
  );

  const handleQuit = useCallback(async () => {
    await exit(0);
  }, []);

  const handleOnboardingComplete = useCallback(
    async (settings: Partial<Settings>) => {
      await saveData({
        ...data,
        settings: {
          ...data.settings,
          ...settings,
        },
      });
    },
    [data, saveData]
  );

  // Keyboard shortcuts
  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      // Escape to close menu
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }

      // Cmd+W to hide window
      if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        event.preventDefault();
        const window = getCurrentWindow();
        await window.hide();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  // Show onboarding if not completed
  if (!data.settings.onboarding_complete) {
    return (
      <Onboarding
        settings={data.settings}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'today':
        return <TodayView data={data} onDataChange={handleDataChange} onNavigate={setActiveView} prData={prData} />;
      case 'tasks':
        return <TasksView data={data} onDataChange={handleDataChange} />;
      case 'backlog':
        return <BacklogView data={data} onDataChange={handleDataChange} />;
      case 'notes':
        return <NotesView data={data} onDataChange={handleDataChange} />;
      case 'brag-doc':
        return <BragDocView data={data} onDataChange={handleDataChange} />;
      case 'prs':
        return <PrsView prData={prData} />;
      case 'my-prs':
        return <MyPrsView prData={prData} />;
      case 'notifications':
        return (
          <NotificationsView data={data} onDataChange={handleDataChange} />
        );
      case 'settings':
        return <SettingsView data={data} onDataChange={handleDataChange} />;
      default:
        return <TodayView data={data} onDataChange={handleDataChange} onNavigate={setActiveView} prData={prData} />;
    }
  };

  return (
    <div className="app">
      <Navigation
        activeView={activeView}
        onViewChange={setActiveView}
        onMenuClick={() => setMenuOpen(true)}
      />
      <main className="app-main">{renderView()}</main>
      <DropdownMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        theme={data.settings.theme}
        darkMode={data.settings.dark_mode}
        onThemeChange={handleThemeChange}
        onDarkModeToggle={handleDarkModeToggle}
        onQuit={handleQuit}
      />
    </div>
  );
}

export default App;
