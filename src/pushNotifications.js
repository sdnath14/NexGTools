import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { API_BASE_URL, authHeaders } from './auth';

const CHANNEL_ID = 'task_assignments';
const APP_PACKAGE = 'com.nexgpetrolube.tools';
const APP_VERSION = '1.0';
const DEVICE_ID_KEY = 'nexgtools_push_device_id';
const PUSH_TOKEN_KEY = 'nexgtools_fcm_token';

let registrationPromise = null;
let registeredUserId = null;
let currentToken = localStorage.getItem(PUSH_TOKEN_KEY) || '';
let navigateToTask = null;

const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const createNotificationChannels = async () => {
  const channel = {
    id: CHANNEL_ID,
    name: 'Task Assignments',
    description: 'Notifications for newly assigned employee tasks',
    importance: 4,
    visibility: 1,
    sound: 'default',
  };
  await Promise.allSettled([
    PushNotifications.createChannel?.(channel),
    LocalNotifications.createChannel?.(channel),
  ]);
};

const sendTokenToBackend = async (token) => {
  if (!token) return;
  const response = await fetch(`${API_BASE_URL}/api/push/device-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      token,
      platform: 'android',
      app_package: APP_PACKAGE,
      app_version: APP_VERSION,
      device_id: getDeviceId(),
      device_model: navigator.userAgent.slice(0, 240),
    }),
  });
  if (!response.ok) throw new Error('Could not register this device for push notifications.');
  currentToken = token;
  localStorage.setItem(PUSH_TOKEN_KEY, token);
};

const taskDataFromNotification = (notification) => {
  const data = notification?.data || notification?.extra || notification?.notification?.data || {};
  if (!['task_assignment', 'task_status_update'].includes(data.type)) return null;
  return { taskId: data.taskId || data.task_id || '' };
};

const openTaskNotification = (notification) => {
  const task = taskDataFromNotification(notification);
  if (!task) return;
  if (typeof navigateToTask === 'function') {
    navigateToTask('/my-tasks', { state: { taskId: task.taskId } });
    return;
  }
  window.location.assign('/my-tasks');
};

const showForegroundNotification = async (notification) => {
  const task = taskDataFromNotification(notification);
  if (!task) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: Math.floor(Date.now() % 2147483647),
      title: notification.title || 'New Task Assigned',
      body: notification.body || 'You have been assigned a new task.',
      channelId: CHANNEL_ID,
      schedule: { at: new Date(Date.now() + 100) },
      extra: { type: 'task_assignment', taskId: task.taskId },
    }],
  });
};

const attachListeners = async () => {
  await PushNotifications.removeAllListeners();
  await LocalNotifications.removeAllListeners();

  await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      await sendTokenToBackend(value);
    } catch (error) {
      console.warn(error.message || 'Push token registration failed.');
    }
  });

  await PushNotifications.addListener('registrationError', (error) => {
    console.warn(error?.error || 'Push notification registration failed.');
  });

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    showForegroundNotification(notification).catch(() => {});
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    openTaskNotification(notification);
  });

  await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    openTaskNotification(notification);
  });
};

export const registerPushNotifications = async ({ user, navigate } = {}) => {
  if (!isNativeAndroid() || !user?.id) return { registered: false, reason: 'not_android' };
  navigateToTask = navigate || navigateToTask;
  if (registeredUserId === user.id && currentToken) return { registered: true, token: currentToken };
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    try {
      await createNotificationChannels();
      await attachListeners();

      const localPermission = await LocalNotifications.requestPermissions();
      const pushPermission = await PushNotifications.requestPermissions();
      if (localPermission.display === 'denied' || pushPermission.receive === 'denied') {
        return { registered: false, reason: 'permission_denied' };
      }

      registeredUserId = user.id;
      await PushNotifications.register();
      return { registered: true };
    } finally {
      registrationPromise = null;
    }
  })();

  return registrationPromise;
};

export const deactivatePushNotifications = async () => {
  if (!isNativeAndroid()) return;
  const token = currentToken || localStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/api/push/device-tokens`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ token, platform: 'android' }),
    });
  } catch {
    // Logout should continue even if the cleanup request cannot reach the server.
  } finally {
    currentToken = '';
    registeredUserId = null;
    localStorage.removeItem(PUSH_TOKEN_KEY);
    await PushNotifications.removeAllListeners().catch(() => {});
    await LocalNotifications.removeAllListeners().catch(() => {});
  }
};
