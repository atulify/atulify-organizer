import { useEffect, useRef, useCallback } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { Notification } from '../types';

type PermissionState = 'granted' | 'denied' | 'default';

interface UseNotificationsOptions {
  notifications: Notification[];
  enabled?: boolean;
}

/**
 * Hook to manage native macOS notifications
 * Schedules notifications based on time and recurrence settings
 */
export function useNotifications({
  notifications,
  enabled = true,
}: UseNotificationsOptions) {
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTriggeredRef = useRef<Map<string, string>>(new Map());

  // Check and request permission
  const checkPermission = useCallback(async (): Promise<boolean> => {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    return permissionGranted;
  }, []);

  // Get permission state
  const getPermissionState = useCallback(async (): Promise<PermissionState> => {
    const granted = await isPermissionGranted();
    return granted ? 'granted' : 'default';
  }, []);

  // Calculate milliseconds until next occurrence
  const calculateNextTrigger = useCallback(
    (notification: Notification): number | null => {
      const now = new Date();
      const [hours, minutes] = notification.time.split(':').map(Number);

      // Create target date/time
      const target = new Date();
      target.setHours(hours, minutes, 0, 0);

      switch (notification.schedule_type) {
        case 'one_off': {
          // For one-off, use the specific date
          if (!notification.date) return null;
          const [year, month, day] = notification.date.split('-').map(Number);
          target.setFullYear(year, month - 1, day);

          // If it's in the past, don't schedule
          if (target.getTime() <= now.getTime()) return null;

          return target.getTime() - now.getTime();
        }

        case 'daily_weekdays': {
          // For weekday notifications, find next weekday occurrence
          const dayOfWeek = target.getDay();

          // If today's time has passed or it's a weekend, find next occurrence
          if (target.getTime() <= now.getTime() || dayOfWeek === 0 || dayOfWeek === 6) {
            // Move to tomorrow
            target.setDate(target.getDate() + 1);

            // Skip to Monday if we land on a weekend
            const nextDay = target.getDay();
            if (nextDay === 0) {
              target.setDate(target.getDate() + 1); // Skip Sunday to Monday
            } else if (nextDay === 6) {
              target.setDate(target.getDate() + 2); // Skip Saturday to Monday
            }
          }

          return target.getTime() - now.getTime();
        }

        case 'weekly': {
          // For weekly, schedule for specific day of week
          if (notification.day_of_week === null) return null;

          const targetDay = notification.day_of_week;
          const currentDay = now.getDay();
          let daysUntil = targetDay - currentDay;

          if (daysUntil < 0 || (daysUntil === 0 && target.getTime() <= now.getTime())) {
            daysUntil += 7;
          }

          target.setDate(target.getDate() + daysUntil);

          return target.getTime() - now.getTime();
        }

        default:
          return null;
      }
    },
    []
  );

  // Schedule a single notification
  const scheduleNotification = useCallback(
    async (notification: Notification) => {
      // Clear existing timeout for this notification
      const existingTimeout = timeoutsRef.current.get(notification.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        timeoutsRef.current.delete(notification.id);
      }

      // Don't schedule if disabled
      if (!notification.enabled || !enabled) return;

      const msUntilTrigger = calculateNextTrigger(notification);
      if (msUntilTrigger === null || msUntilTrigger < 0) return;

      // Cap at 24 hours to prevent setTimeout overflow issues
      // The notification will be rescheduled after being triggered or on app restart
      const maxDelay = 24 * 60 * 60 * 1000;
      const actualDelay = Math.min(msUntilTrigger, maxDelay);

      const timeoutId = setTimeout(async () => {
        // Only trigger if the full delay has passed
        if (actualDelay < msUntilTrigger) {
          // Reschedule for remaining time
          scheduleNotification(notification);
          return;
        }

        // Create a unique key for today's trigger
        const today = new Date().toISOString().split('T')[0];
        const triggerKey = `${notification.id}-${today}`;

        // Prevent duplicate triggers
        if (lastTriggeredRef.current.get(notification.id) === triggerKey) {
          return;
        }

        const hasPermission = await checkPermission();
        if (hasPermission) {
          sendNotification({
            title: notification.title,
            body: notification.message,
          });
          lastTriggeredRef.current.set(notification.id, triggerKey);
        }

        // Reschedule for recurring notifications
        if (notification.schedule_type !== 'one_off') {
          // Wait a bit before rescheduling to avoid immediate re-trigger
          setTimeout(() => {
            scheduleNotification(notification);
          }, 60000); // 1 minute buffer
        }
      }, actualDelay);

      timeoutsRef.current.set(notification.id, timeoutId);
    },
    [enabled, calculateNextTrigger, checkPermission]
  );

  // Clear all scheduled notifications
  const clearAllScheduled = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();
  }, []);

  // Schedule all notifications
  useEffect(() => {
    // Clear existing schedules
    clearAllScheduled();

    // Schedule each enabled notification
    notifications
      .filter((n) => n.enabled)
      .forEach((notification) => {
        scheduleNotification(notification);
      });

    // Cleanup on unmount
    return () => {
      clearAllScheduled();
    };
  }, [notifications, enabled, scheduleNotification, clearAllScheduled]);

  return {
    checkPermission,
    getPermissionState,
    clearAllScheduled,
  };
}

/**
 * Request notification permission
 * Returns true if permission is granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }
  return permissionGranted;
}

/**
 * Check if notification permission is granted
 */
export async function checkNotificationPermission(): Promise<boolean> {
  return isPermissionGranted();
}
