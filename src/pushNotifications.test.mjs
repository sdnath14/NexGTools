import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const listeners = {};
const scheduled = [];
const navigated = [];
const plugin = (prefix) => ({
  createChannel: async () => {}, removeAllListeners: async () => {},
  addListener: async (name, callback) => { listeners[`${prefix}:${name}`] = callback; },
  requestPermissions: async () => ({ display: 'granted', receive: 'granted' }),
  register: async () => {}, schedule: async (request) => { scheduled.push(request); },
});
globalThis.localStorage = { getItem: () => null };
globalThis.window = { dispatchEvent: () => {}, location: { assign: (path) => navigated.push(path) } };
const modules = {
  '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } },
  '@capacitor/push-notifications': { PushNotifications: plugin('push') },
  '@capacitor/local-notifications': { LocalNotifications: plugin('local') },
  './auth': { API_BASE_URL: '', authHeaders: () => ({}) },
};
const source = new SourceTextModule(await readFile(new URL('./pushNotifications.js', import.meta.url), 'utf8'));
await source.link(async (name) => {
  const exports = modules[name];
  return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); });
});
await source.evaluate();
await source.namespace.registerPushNotifications({ user: { id: 7 }, navigate: (path) => navigated.push(path) });
for (const type of ['task_assignment', 'task_status_update']) {
  listeners['push:pushNotificationActionPerformed']({ notification: { data: { type, taskId: '42' } } });
  listeners['local:localNotificationActionPerformed']({ notification: { extra: { type, taskId: '42' } } });
  listeners['push:pushNotificationReceived']({ title: 'Task update', data: { type, taskId: '42' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scheduled.at(-1).notifications[0].extra.type, type);
}
assert.deepEqual(navigated, ['/notifications', '/notifications', '/notifications', '/notifications']);
listeners['push:pushNotificationActionPerformed']({ notification: { data: { type: 'other' } } });
assert.equal(navigated.length, 4);
console.log('Push and local tap routing, foreground event types: passed.');
