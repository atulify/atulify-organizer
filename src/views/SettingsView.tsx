import { Button } from '../components';
import type { AppData, Theme } from '../types';
import './Views.css';

interface SettingsViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

export function SettingsView({ data, onDataChange }: SettingsViewProps) {
  const updateSettings = (updates: Partial<AppData['settings']>) => {
    onDataChange({
      ...data,
      settings: {
        ...data.settings,
        ...updates,
      },
    });
  };

  return (
    <div className="view">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <p className="view-subtitle">Customize your experience</p>
      </div>
      <div className="view-content">
        <div className="settings-section">
          <h2 className="section-title">Profile</h2>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Your Name</div>
              <div className="settings-item-description">
                Used for personalized greetings
              </div>
            </div>
            <input
              type="text"
              value={data.settings.user_name}
              onChange={(e) => updateSettings({ user_name: e.target.value })}
              placeholder="Enter your name"
              style={{ width: '150px' }}
            />
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Appearance</h2>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Theme</div>
              <div className="settings-item-description">
                Choose your preferred color scheme
              </div>
            </div>
            <select
              value={data.settings.theme}
              onChange={(e) =>
                updateSettings({ theme: e.target.value as Theme })
              }
              style={{ width: '140px' }}
            >
              <option value="obsidian">Obsidian</option>
              <option value="grove">Grove</option>
              <option value="miami_nights">Miami Nights</option>
            </select>
          </div>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Dark Mode</div>
              <div className="settings-item-description">
                Toggle dark/light mode
              </div>
            </div>
            <Button
              variant={data.settings.dark_mode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() =>
                updateSettings({ dark_mode: !data.settings.dark_mode })
              }
            >
              {data.settings.dark_mode ? 'On' : 'Off'}
            </Button>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">System</h2>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Launch at Login</div>
              <div className="settings-item-description">
                Start Atulify when you log in
              </div>
            </div>
            <Button
              variant={data.settings.launch_at_login ? 'primary' : 'secondary'}
              size="sm"
              onClick={() =>
                updateSettings({
                  launch_at_login: !data.settings.launch_at_login,
                })
              }
            >
              {data.settings.launch_at_login ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">Data</h2>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Backup</div>
              <div className="settings-item-description">
                Create a manual backup of your data
              </div>
            </div>
            <Button variant="secondary" size="sm">
              Create Backup
            </Button>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="section-title">About</h2>
          <div className="settings-item">
            <div>
              <div className="settings-item-label">Atulify</div>
              <div className="settings-item-description">
                Version 0.1.0
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
