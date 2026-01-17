import { useState } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button, Modal } from '../components';
import type { AppData, Notification, ScheduleType } from '../types';
import './Views.css';
import './NotificationsView.css';

interface NotificationsViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', fullLabel: 'Sunday' },
  { value: 1, label: 'Mon', fullLabel: 'Monday' },
  { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, label: 'Thu', fullLabel: 'Thursday' },
  { value: 5, label: 'Fri', fullLabel: 'Friday' },
  { value: 6, label: 'Sat', fullLabel: 'Saturday' },
];

export function NotificationsView({ data, onDataChange }: NotificationsViewProps) {
  const [showAddNotification, setShowAddNotification] = useState(false);
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily_weekdays');
  const [time, setTime] = useState('09:00');
  const [date, setDate] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday

  // Reset form
  const resetForm = () => {
    setTitle('');
    setMessage('');
    setScheduleType('daily_weekdays');
    setTime('09:00');
    setDate('');
    setDayOfWeek(1);
  };

  // Open add modal
  const handleOpenAdd = () => {
    resetForm();
    setShowAddNotification(true);
  };

  // Open edit modal
  const handleOpenEdit = (notification: Notification) => {
    setEditingNotification(notification);
    setTitle(notification.title);
    setMessage(notification.message);
    setScheduleType(notification.schedule_type);
    setTime(notification.time);
    setDate(notification.date || '');
    setDayOfWeek(notification.day_of_week ?? 1);
  };

  // Save notification
  const handleSave = () => {
    if (!title.trim()) return;

    if (editingNotification) {
      onDataChange({
        ...data,
        notifications: data.notifications.map((n) =>
          n.id === editingNotification.id
            ? {
                ...n,
                title: title.trim(),
                message: message.trim(),
                schedule_type: scheduleType,
                time,
                date: scheduleType === 'one_off' ? date : null,
                day_of_week: scheduleType === 'weekly' ? dayOfWeek : null,
              }
            : n
        ),
      });
      setEditingNotification(null);
    } else {
      const newNotification: Notification = {
        id: crypto.randomUUID(),
        title: title.trim(),
        message: message.trim(),
        schedule_type: scheduleType,
        time,
        date: scheduleType === 'one_off' ? date : null,
        day_of_week: scheduleType === 'weekly' ? dayOfWeek : null,
        enabled: true,
      };

      onDataChange({
        ...data,
        notifications: [...data.notifications, newNotification],
      });
      setShowAddNotification(false);
    }

    resetForm();
  };

  // Toggle enabled
  const handleToggleEnabled = (notificationId: string) => {
    onDataChange({
      ...data,
      notifications: data.notifications.map((n) =>
        n.id === notificationId ? { ...n, enabled: !n.enabled } : n
      ),
    });
  };

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    const confirmed = await ask('Delete this notification?', { title: 'Confirm Delete', kind: 'warning' });
    if (!confirmed) return;
    onDataChange({
      ...data,
      notifications: data.notifications.filter((n) => n.id !== notificationId),
    });
    if (editingNotification?.id === notificationId) {
      setEditingNotification(null);
    }
  };

  // Format schedule description
  const formatSchedule = (notification: Notification) => {
    const timeStr = formatTime(notification.time);

    switch (notification.schedule_type) {
      case 'one_off':
        if (notification.date) {
          const date = new Date(notification.date + 'T00:00:00');
          return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`;
        }
        return `One-time at ${timeStr}`;
      case 'daily_weekdays':
        return `Weekdays at ${timeStr}`;
      case 'weekly':
        const day = DAYS_OF_WEEK.find((d) => d.value === notification.day_of_week);
        return `${day?.fullLabel || 'Weekly'}s at ${timeStr}`;
      default:
        return timeStr;
    }
  };

  // Format time to 12-hour
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Check if one-off is in the past
  const isPastOneOff = (notification: Notification) => {
    if (notification.schedule_type !== 'one_off' || !notification.date) return false;
    const notifDateTime = new Date(`${notification.date}T${notification.time}`);
    return notifDateTime < new Date();
  };

  return (
    <div className="view notifications-view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">Notifications</h1>
            <p className="view-subtitle">Schedule reminders and alerts</p>
          </div>
          <Button onClick={handleOpenAdd}>+ Add Reminder</Button>
        </div>
      </div>

      <div className="view-content">
        {data.notifications.length === 0 ? (
          <div className="empty-state">
            <p>No reminders set</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenAdd}
              style={{ marginTop: '12px' }}
            >
              Create Reminder
            </Button>
          </div>
        ) : (
          <div className="notifications-list">
            {data.notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-card ${!notification.enabled ? 'disabled' : ''} ${isPastOneOff(notification) ? 'past' : ''}`}
              >
                <div className="notification-toggle">
                  <button
                    className={`toggle-btn ${notification.enabled ? 'on' : 'off'}`}
                    onClick={() => handleToggleEnabled(notification.id)}
                    aria-label={notification.enabled ? 'Disable' : 'Enable'}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
                <div className="notification-content">
                  <span className="notification-title">{notification.title}</span>
                  {notification.message && (
                    <span className="notification-message">{notification.message}</span>
                  )}
                  <span className="notification-schedule">
                    <span className={`schedule-type ${notification.schedule_type}`}>
                      {notification.schedule_type === 'one_off' ? 'One-time' :
                       notification.schedule_type === 'daily_weekdays' ? 'Weekdays' :
                       'Weekly'}
                    </span>
                    {formatSchedule(notification)}
                  </span>
                  {isPastOneOff(notification) && (
                    <span className="notification-past-badge">Past</span>
                  )}
                </div>
                <div className="notification-actions">
                  <button
                    className="notification-action-btn"
                    onClick={() => handleOpenEdit(notification)}
                  >
                    Edit
                  </button>
                  <button
                    className="notification-action-btn danger"
                    onClick={() => handleDelete(notification.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddNotification || !!editingNotification}
        onClose={() => {
          setShowAddNotification(false);
          setEditingNotification(null);
          resetForm();
        }}
        title={editingNotification ? 'Edit Reminder' : 'Add Reminder'}
        size="md"
      >
        <div className="notification-form">
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reminder title"
              className="form-input"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional message..."
              className="form-input form-textarea"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Schedule Type</label>
            <div className="schedule-type-buttons">
              <button
                type="button"
                className={`schedule-type-btn ${scheduleType === 'daily_weekdays' ? 'active' : ''}`}
                onClick={() => setScheduleType('daily_weekdays')}
              >
                Weekdays
                <span className="schedule-type-desc">Mon - Fri</span>
              </button>
              <button
                type="button"
                className={`schedule-type-btn ${scheduleType === 'weekly' ? 'active' : ''}`}
                onClick={() => setScheduleType('weekly')}
              >
                Weekly
                <span className="schedule-type-desc">One day/week</span>
              </button>
              <button
                type="button"
                className={`schedule-type-btn ${scheduleType === 'one_off' ? 'active' : ''}`}
                onClick={() => setScheduleType('one_off')}
              >
                One-time
                <span className="schedule-type-desc">Single date</span>
              </button>
            </div>
          </div>

          {/* Time */}
          <div className="form-group">
            <label className="form-label">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="form-input"
              style={{ width: 'auto' }}
            />
          </div>

          {/* Day of Week (for weekly) */}
          {scheduleType === 'weekly' && (
            <div className="form-group">
              <label className="form-label">Day of Week</label>
              <div className="day-of-week-buttons">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={`day-btn ${dayOfWeek === day.value ? 'active' : ''}`}
                    onClick={() => setDayOfWeek(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date (for one-off) */}
          {scheduleType === 'one_off' && (
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input"
                style={{ width: 'auto' }}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowAddNotification(false);
                setEditingNotification(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!title.trim() || (scheduleType === 'one_off' && !date)}
            >
              {editingNotification ? 'Save Changes' : 'Create Reminder'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
