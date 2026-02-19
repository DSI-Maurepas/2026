// src/services/uiService.js
// Petit service UI pour remplacer alert/confirm du navigateur par des modals/toasts contrôlés par App.
// Usage:
//   import uiService from '../services/uiService';
//   await uiService.confirm({ title, message, confirmText, cancelText });
//   uiService.toast('success'|'error'|'info'|'warn', { title, message, durationMs });

const uiService = {
  _handlers: null,

  init(handlers) {
    this._handlers = handlers;
  },

  toast(type, { title, message, durationMs = 4000 } = {}) {
    if (!this._handlers?.showToast) return;
    this._handlers.showToast({ type, title, message, durationMs });
  },

  confirm({ title = 'Confirmation', message = '', confirmText = 'Confirmer', cancelText = 'Annuler' } = {}) {
    if (!this._handlers?.showConfirm) return Promise.resolve(false);
    return this._handlers.showConfirm({ title, message, confirmText, cancelText });
  }
};

export default uiService;
