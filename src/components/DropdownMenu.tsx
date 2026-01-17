import { useEffect, useRef } from 'react';
import type { Theme } from '../types';
import './DropdownMenu.css';

interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  darkMode: boolean;
  onThemeChange: (theme: Theme) => void;
  onDarkModeToggle: () => void;
  onQuit: () => void;
}

export function DropdownMenu({
  isOpen,
  onClose,
  theme,
  darkMode,
  onThemeChange,
  onDarkModeToggle,
  onQuit,
}: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dropdown-overlay">
      <div className="dropdown-menu" ref={menuRef} role="menu">
        <div className="dropdown-section">
          <span className="dropdown-section-label">Theme</span>
          <div className="dropdown-theme-options">
            <button
              className={`dropdown-theme-btn ${theme === 'obsidian' ? 'active' : ''}`}
              onClick={() => onThemeChange('obsidian')}
              role="menuitemradio"
              aria-checked={theme === 'obsidian'}
            >
              <span className="theme-preview obsidian-preview" />
              <span>Obsidian</span>
            </button>
            <button
              className={`dropdown-theme-btn ${theme === 'grove' ? 'active' : ''}`}
              onClick={() => onThemeChange('grove')}
              role="menuitemradio"
              aria-checked={theme === 'grove'}
            >
              <span className="theme-preview grove-preview" />
              <span>Grove</span>
            </button>
            <button
              className={`dropdown-theme-btn ${theme === 'miami_nights' ? 'active' : ''}`}
              onClick={() => onThemeChange('miami_nights')}
              role="menuitemradio"
              aria-checked={theme === 'miami_nights'}
            >
              <span className="theme-preview miami-nights-preview" />
              <span>Miami</span>
            </button>
          </div>
        </div>

        <div className="dropdown-divider" />

        <button
          className="dropdown-item"
          onClick={onDarkModeToggle}
          role="menuitemcheckbox"
          aria-checked={darkMode}
        >
          <span className="dropdown-item-icon">{darkMode ? '~' : 'o'}</span>
          <span>Dark Mode</span>
          <span className="dropdown-item-toggle">
            {darkMode ? 'On' : 'Off'}
          </span>
        </button>

        <div className="dropdown-divider" />

        <button className="dropdown-item" onClick={() => {}} role="menuitem">
          <span className="dropdown-item-icon">i</span>
          <span>About Atulify</span>
        </button>

        <div className="dropdown-divider" />

        <button
          className="dropdown-item dropdown-item-danger"
          onClick={onQuit}
          role="menuitem"
        >
          <span className="dropdown-item-icon">x</span>
          <span>Quit</span>
        </button>
      </div>
    </div>
  );
}
