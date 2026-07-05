// Mock natif `expo-task-manager` (MOB-5.2 — tâche de localisation background).
// Le module natif est absent hors device. `defineTask` doit **capturer** le handler
// pour que les tests `location-task` puissent le déclencher avec un payload
// `{ data, error }` simulé. `__getTask(name)` expose le handler enregistré.
const _tasks = new Map();

module.exports = {
  defineTask: jest.fn((taskName, handler) => {
    _tasks.set(taskName, handler);
  }),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => undefined),
  unregisterAllTasksAsync: jest.fn(async () => undefined),
  // Helpers de test (non présents dans l'API réelle) :
  __getTask: (taskName) => _tasks.get(taskName),
  __reset: () => _tasks.clear(),
};
