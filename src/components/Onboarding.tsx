import { useState, useEffect } from 'react';
import type { Settings, Theme } from '../types';
import { Button } from './Button';
import {
  requestNotificationPermission,
  checkNotificationPermission,
} from '../hooks/useNotifications';
import { enable as enableAutostart } from '@tauri-apps/plugin-autostart';
import './Onboarding.css';

interface OnboardingProps {
  settings: Settings;
  onComplete: (settings: Partial<Settings>) => void;
}

type Step = 'welcome' | 'name' | 'theme' | 'permissions' | 'complete';

const STEPS: Step[] = ['welcome', 'name', 'theme', 'permissions', 'complete'];

type NotificationPermissionStatus = 'unknown' | 'granted' | 'denied' | 'requesting';

export function Onboarding({ settings, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [userName, setUserName] = useState(settings.user_name);
  const [selectedTheme, setSelectedTheme] = useState<Theme>(settings.theme);
  const [darkMode, setDarkMode] = useState(settings.dark_mode);
  const [launchAtLogin, setLaunchAtLogin] = useState(settings.launch_at_login);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus>('unknown');

  // Check notification permission on mount and when step changes
  useEffect(() => {
    if (currentStep === 'permissions') {
      checkNotificationPermission().then((granted) => {
        setNotificationPermission(granted ? 'granted' : 'unknown');
      });
    }
  }, [currentStep]);

  const handleRequestNotificationPermission = async () => {
    setNotificationPermission('requesting');
    const granted = await requestNotificationPermission();
    setNotificationPermission(granted ? 'granted' : 'denied');
  };

  const handleLaunchAtLoginToggle = async () => {
    const newValue = !launchAtLogin;
    setLaunchAtLogin(newValue);
    if (newValue) {
      try {
        await enableAutostart();
      } catch (e) {
        console.error('Failed to enable autostart:', e);
      }
    }
  };

  const stepIndex = STEPS.indexOf(currentStep);
  const isLastStep = currentStep === 'complete';

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleComplete = () => {
    onComplete({
      user_name: userName,
      theme: selectedTheme,
      dark_mode: darkMode,
      launch_at_login: launchAtLogin,
      onboarding_complete: true,
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="onboarding-step">
            <div className="onboarding-icon">*</div>
            <h1 className="onboarding-title">Welcome to Atulify</h1>
            <p className="onboarding-description">
              Your personal work companion for tracking tasks, notes, and
              achievements. Let's get you set up in just a few steps.
            </p>
          </div>
        );

      case 'name':
        return (
          <div className="onboarding-step">
            <div className="onboarding-icon">~</div>
            <h1 className="onboarding-title">What's your name?</h1>
            <p className="onboarding-description">
              We'll use this for personalized greetings throughout the app.
            </p>
            <input
              type="text"
              className="onboarding-input"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </div>
        );

      case 'theme':
        return (
          <div className="onboarding-step">
            <div className="onboarding-icon">o</div>
            <h1 className="onboarding-title">Choose your style</h1>
            <p className="onboarding-description">
              Select a theme that suits you. You can always change this later in
              settings.
            </p>
            <div className="onboarding-themes">
              <button
                className={`onboarding-theme-card ${selectedTheme === 'obsidian' ? 'active' : ''}`}
                onClick={() => setSelectedTheme('obsidian')}
              >
                <div className="theme-swatch obsidian-swatch" />
                <span className="theme-name">Obsidian</span>
                <span className="theme-desc">Dark & amber</span>
              </button>
              <button
                className={`onboarding-theme-card ${selectedTheme === 'grove' ? 'active' : ''}`}
                onClick={() => setSelectedTheme('grove')}
              >
                <div className="theme-swatch grove-swatch" />
                <span className="theme-name">Grove</span>
                <span className="theme-desc">Earthy & calming</span>
              </button>
              <button
                className={`onboarding-theme-card ${selectedTheme === 'miami_nights' ? 'active' : ''}`}
                onClick={() => setSelectedTheme('miami_nights')}
              >
                <div className="theme-swatch miami-nights-swatch" />
                <span className="theme-name">Miami Nights</span>
                <span className="theme-desc">Dark & vibrant</span>
              </button>
            </div>
            <div className="onboarding-toggle">
              <span>Dark Mode</span>
              <Button
                variant={darkMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDarkMode(!darkMode)}
              >
                {darkMode ? 'On' : 'Off'}
              </Button>
            </div>
          </div>
        );

      case 'permissions':
        return (
          <div className="onboarding-step">
            <div className="onboarding-icon">!</div>
            <h1 className="onboarding-title">System preferences</h1>
            <p className="onboarding-description">
              Configure how Atulify behaves on your system.
            </p>
            <div className="onboarding-permissions">
              <div className="permission-card">
                <div className="permission-info">
                  <div className="permission-title">Notifications</div>
                  <div className="permission-desc">
                    Allow Atulify to send you reminders and alerts
                  </div>
                </div>
                <Button
                  variant={notificationPermission === 'granted' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={handleRequestNotificationPermission}
                  disabled={notificationPermission === 'requesting' || notificationPermission === 'granted'}
                >
                  {notificationPermission === 'granted'
                    ? 'Allowed'
                    : notificationPermission === 'requesting'
                      ? 'Requesting...'
                      : notificationPermission === 'denied'
                        ? 'Denied'
                        : 'Allow'}
                </Button>
              </div>
              <div className="permission-card">
                <div className="permission-info">
                  <div className="permission-title">Launch at login</div>
                  <div className="permission-desc">
                    Start Atulify automatically when you log in to your Mac
                  </div>
                </div>
                <Button
                  variant={launchAtLogin ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={handleLaunchAtLoginToggle}
                >
                  {launchAtLogin ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="onboarding-step">
            <div className="onboarding-icon complete-icon">+</div>
            <h1 className="onboarding-title">
              {userName ? `You're all set, ${userName}!` : "You're all set!"}
            </h1>
            <p className="onboarding-description">
              Atulify is ready to help you stay organized and track your
              achievements. Let's get started!
            </p>
          </div>
        );
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        <div className="onboarding-progress">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`progress-dot ${i <= stepIndex ? 'active' : ''} ${i === stepIndex ? 'current' : ''}`}
            />
          ))}
        </div>

        <div key={currentStep}>{renderStep()}</div>

        <div className="onboarding-actions">
          {stepIndex > 0 && !isLastStep && (
            <Button variant="ghost" onClick={goBack}>
              Back
            </Button>
          )}
          {!isLastStep ? (
            <Button variant="primary" onClick={goNext}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={handleComplete}>
              Get Started
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
