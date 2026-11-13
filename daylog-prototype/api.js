/* 异步服务占位层：签名与未来真实接口保持一致，后续只换实现不改调用方
   真实后端对接时，把每个方法体替换为 fetch(...) 即可 */

(function (global) {
  'use strict';

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const Api = {
    // POST /api/tasks  body: { title, date, time, cat, note }
    async createTask(payload) {
      await wait(360);
      // TODO: replace with fetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
      return {
        id: 't' + Date.now().toString(36),
        done: false,
        ...payload
      };
    },

    // PATCH /api/tasks/:id  body: { done } | { title } | ...
    async updateTask(id, patch) {
      await wait(140);
      // TODO: replace with fetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      return { id, ...patch };
    },

    // DELETE /api/tasks/:id
    async deleteTask(id) {
      await wait(140);
      // TODO: replace with fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      return { id, deleted: true };
    },

    // POST /api/sync  body: { tasks, categories, settings }
    async sync(payload) {
      await wait(900);
      // TODO: replace with the self-hosted sync endpoint (last-write-wins by updatedAt)
      return { ok: true, at: Date.now(), received: (payload && payload.tasks && payload.tasks.length) || 0 };
    }
  };

  global.Api = Api;
})(window);
