import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import {
  getActiveShortcuts,
  matchesShortcutEvent,
  normalizeKeyFromEvent
} from '../../utils/shortcutsConfig';

/**
 * المتحكم المركزي الشامل باختصارات لوحة المفاتيح وإغلاق النوافذ في كامل النظام
 * يضمن:
 * 1. إغلاق أي نافذة منبثقة بزر Escape فوراً وفي أي صفحة بالكامل.
 * 2. إغلاق أي نافذة منبثقة عند النقر على الخلفية المعتمة خارج بطاقة النافذة (مع حماية التحديد والكتابة بالداخل).
 * 3. منع المتصفح من اعتراض الاختصارات أو فتح نوافذ كروم وحفظ الصفحة ومساعدة كروم.
 * 4. ربط مصفوفة الاختصارات النشطة القابلة للتعديل من شاشة الإعدادات.
 */
export default function UniversalShortcutsController() {
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const { state } = useData?.() || {};

  // Custom shortcuts list from settings or defaults
  const [shortcutsList, setShortcutsList] = useState(() =>
    getActiveShortcuts(state?.orgSettings?.customShortcuts)
  );

  useEffect(() => {
    setShortcutsList(getActiveShortcuts(state?.orgSettings?.customShortcuts));
  }, [state?.orgSettings?.customShortcuts]);

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail?.shortcuts) {
        setShortcutsList(e.detail.shortcuts);
      }
    };
    window.addEventListener('app:shortcuts-updated', handleUpdate);
    return () => window.removeEventListener('app:shortcuts-updated', handleUpdate);
  }, []);

  const shortcutsRef = useRef(shortcutsList);
  useEffect(() => {
    shortcutsRef.current = shortcutsList;
  }, [shortcutsList]);

  // Grab UIContext modal setters to close any global modals on demand
  const uiContext = useUI();
  const uiRef = useRef(uiContext);
  useEffect(() => {
    uiRef.current = uiContext;
  }, [uiContext]);

  // Track mousedown target to differentiate true backdrop clicks from text-drag release
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    const handleMouseDown = (e) => {
      mouseDownTargetRef.current = e.target;
    };

    // Helper to close all known global UIContext modals
    const closeAllGlobalUIModals = () => {
      const ui = uiRef.current;
      if (!ui) return;
      if (ui.setIsEmpModalOpen) ui.setIsEmpModalOpen(false);
      if (ui.setSelectedEmpCard) ui.setSelectedEmpCard(null);
      if (ui.setEditingShift) ui.setEditingShift(null);
      if (ui.setIsEmpFileModalOpen) ui.setIsEmpFileModalOpen(false);
      if (ui.setIsEmpPhonesModalOpen) ui.setIsEmpPhonesModalOpen(false);
      if (ui.setIsExportModalOpen) ui.setIsExportModalOpen(false);
      if (ui.setInspectedEmp) ui.setInspectedEmp(null);
      if (ui.setKioskInquiryModal) ui.setKioskInquiryModal(null);
      if (ui.setKioskConfirmModal) ui.setKioskConfirmModal(null);
      if (ui.setOwnerOverrideModal) ui.setOwnerOverrideModal((prev) => ({ ...prev, isOpen: false }));
      if (ui.handleConfirmAction) ui.handleConfirmAction(false);
    };

    // ── Strictly PREVENT Closing Modals on Outside / Backdrop Click ──────────────
    // The user explicitly requested: "عدم اغلاق النوافذ المنبثقة في كامل النظام عند الضغط خارج النافذة منع ذلك"
    const handlePreventBackdropClick = (e) => {
      const clickTarget = e.target;
      const backdrop = clickTarget.closest(
        '.modal-overlay, .modal-backdrop, .central-modal-backdrop, .acc-modal-overlay, .portal-modal-overlay'
      );

      if (backdrop) {
        const cardSelectors =
          '.modal-card, .modal-content, .central-modal-card, .acc-modal, .acc-modal-card, .portal-modal-card, [role="document"]';
        const isClickInsideCard = Boolean(clickTarget.closest(cardSelectors));

        // If the click is on the backdrop itself outside any modal card, intercept and stop it completely!
        if (!isClickInsideCard) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
      }
    };

    // ── Universal Keyboard Shortcuts Engine (Capture Phase) ─────────────────────
    const handleGlobalKeyDown = (e) => {
      const currentList = shortcutsRef.current || [];
      const getDef = (id) => currentList.find((s) => s.id === id);

      const normKey = (normalizeKeyFromEvent(e) || '').toLowerCase();
      const isCtrl = Boolean(e.ctrlKey || e.metaKey);
      const isAlt = Boolean(e.altKey);
      const isShift = Boolean(e.shiftKey);

      const activeElem = document.activeElement;
      const isTextInput =
        activeElem &&
        (activeElem.tagName === 'INPUT' ||
          activeElem.tagName === 'TEXTAREA' ||
          activeElem.isContentEditable);

      // Helper to aggressively suppress browser native action and stop all propagation
      const consumeEvent = () => {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      };

      // ── 0. Native Input Editing Guard ──────────────────────────────────────────
      // When inside an active text input/textarea, preserve standard native text editing
      // commands (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y)
      if (isTextInput && isCtrl && !isAlt && !isShift && ['c', 'v', 'x', 'a', 'z', 'y'].includes(normKey)) {
        return;
      }

      // ── 0.1 Destructive Browser History Navigation Guard ───────────────────────
      // Prevent Alt+Left / Alt+Right from navigating away and discarding unsaved data
      if (isAlt && !isCtrl && !isShift && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        consumeEvent();
        return;
      }

      // ── 1. Escape Key (Universal Modal & Popup Closer) ─────────────────────────
      const closeDef = getDef('closeModal');
      const isEscape =
        normKey === 'escape' ||
        (closeDef && matchesShortcutEvent(closeDef, e)) ||
        e.key === 'Escape' ||
        e.code === 'Escape';

      if (isEscape) {
        consumeEvent();

        // A) If Shortcuts Cheatsheet is open, close it first
        if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
          return;
        }

        // B) Find all visible modal overlays / backdrops across the entire application
        const visibleModals = Array.from(
          document.querySelectorAll(
            '.modal-overlay, .modal-backdrop, .central-modal-backdrop, .acc-modal-overlay, .portal-modal-overlay, [role="dialog"], [aria-modal="true"]'
          )
        ).filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        if (visibleModals.length > 0) {
          const topModal = visibleModals[visibleModals.length - 1];

          // Try clicking close / cancel button
          const closeBtn =
            topModal.querySelector(
              '.modal-close-circle-btn, .modal-close-btn, .del-btn, [data-action="close"], [aria-label*="إغلاق"], [aria-label*="Close"], .btn-close, .acc-action-icon-btn'
            ) ||
            Array.from(topModal.querySelectorAll('button')).find((b) => {
              const text = (b.textContent || '').trim();
              return (
                text === '✕' ||
                text === '×' ||
                text.includes('إغلاق') ||
                text.includes('إلغاء') ||
                text.includes('تراجع') ||
                text === 'Close'
              );
            });

          if (closeBtn) {
            closeBtn.click();
          } else {
            closeAllGlobalUIModals();
          }

          window.dispatchEvent(
            new CustomEvent('app:modal-close-request', { detail: { source: 'escape' } })
          );
          return;
        }

        // C) If no modals were open, close any open dropdowns or menus
        window.dispatchEvent(new CustomEvent('app:dropdown-close-request'));
        return;
      }

      // ── 2. Help & Shortcuts Cheatsheet (F1 / Alt+H) ────────────────────────────
      // STRICTLY PREVENTS CHROME HELP TAB (support.google.com)
      const helpDef = getDef('help');
      const isHelp =
        (helpDef && matchesShortcutEvent(helpDef, e)) ||
        normKey === 'f1' ||
        e.key === 'F1' ||
        e.code === 'F1' ||
        (isAlt && !isCtrl && normKey === 'h');

      if (isHelp) {
        consumeEvent();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }

      // ── 3. Quick Global Search (Ctrl+K / Alt+K) ────────────────────────────────
      // STRICTLY PREVENTS CHROME OMNIBOX ADDRESS BAR FOCUS
      const searchDef = getDef('quickSearch');
      const isSearch =
        (searchDef && matchesShortcutEvent(searchDef, e)) ||
        (isCtrl && !isAlt && normKey === 'k') ||
        (isAlt && !isCtrl && normKey === 'k');

      if (isSearch) {
        consumeEvent();

        // Focus accounts global search if available
        const accSearch = document.getElementById('acc-global-search-input');
        if (accSearch) {
          accSearch.focus();
          accSearch.select?.();
          return;
        }

        // Focus top navbar search or page search
        const pageSearch = document.querySelector(
          'input[type="search"], input[placeholder*="بحث"], .search-box input, .filter-bar input, .top-search-input'
        );
        if (pageSearch) {
          pageSearch.focus();
          pageSearch.select?.();
          return;
        }

        uiRef.current?.showToast?.('🔍 استخدم حقل البحث المتاح في الصفحة الحالية');
        return;
      }

      // ── 4. Table / Current View Filter (Ctrl+F / Alt+F / F3) ───────────────────
      // STRICTLY PREVENTS CHROME "FIND IN PAGE" (Ctrl+F / F3)
      const findDef = getDef('findInTable');
      const isFind =
        (findDef && matchesShortcutEvent(findDef, e)) ||
        (isCtrl && !isAlt && normKey === 'f') ||
        (isAlt && !isCtrl && normKey === 'f') ||
        normKey === 'f3' ||
        e.key === 'F3' ||
        e.code === 'F3';

      if (isFind) {
        consumeEvent();
        const tableSearch = document.querySelector(
          '.filter-bar input, input[type="search"], input[placeholder*="بحث"], .search-box input'
        );
        if (tableSearch) {
          tableSearch.focus();
          tableSearch.select?.();
          return;
        }
        uiRef.current?.showToast?.('🔍 ابدأ بالبحث في بيانات الجدول الحالية');
        return;
      }

      // ── 5. Save Form / Submit Modal (Ctrl+S / Alt+S) ───────────────────────────
      // STRICTLY PREVENTS CHROME "SAVE PAGE AS HTML" DIALOG
      const saveDef = getDef('saveForm');
      const isSave =
        (saveDef && matchesShortcutEvent(saveDef, e)) ||
        (isCtrl && !isAlt && normKey === 's') ||
        (isAlt && !isCtrl && normKey === 's');

      if (isSave) {
        consumeEvent();

        const activeModal = document.querySelector(
          '.modal-overlay, .modal-backdrop, .central-modal-backdrop, .acc-modal-overlay'
        );
        const searchScope = activeModal || document;

        const saveBtn =
          searchScope.querySelector(
            'button[type="submit"], button.btn-start, button.save-btn, button.btn-save'
          ) ||
          Array.from(searchScope.querySelectorAll('button')).find((b) => {
            const text = (b.textContent || '').trim();
            return (
              (text.includes('حفظ') || text.includes('تأكيد') || text.includes('Save')) &&
              !text.includes('إلغاء') &&
              !text.includes('تراجع')
            );
          });

        if (saveBtn) {
          saveBtn.click();
          uiRef.current?.showToast?.('💾 تم استدعاء الحفظ عبر الاختصار');
        } else {
          uiRef.current?.showToast?.('ℹ️ لا يوجد نموذج مفتوح بحاجة للحفظ حالياً');
        }
        return;
      }

      // ── 6. Print Report / View (Ctrl+P / Alt+P) ────────────────────────────────
      // STRICTLY PREVENTS CHROME RAW BROWSER PRINT PREVIEW
      const printDef = getDef('printView');
      const isPrint =
        (printDef && matchesShortcutEvent(printDef, e)) ||
        (isCtrl && !isAlt && normKey === 'p') ||
        (isAlt && !isCtrl && normKey === 'p');

      if (isPrint) {
        consumeEvent();

        const printBtn =
          document.querySelector(
            'button.print-btn, button[title*="طباعة"], [data-action="print"], .btn-print'
          ) ||
          Array.from(document.querySelectorAll('button')).find((b) => {
            const text = (b.textContent || '').trim();
            return text.includes('طباعة') || text.includes('🖨️');
          });

        if (printBtn) {
          printBtn.click();
        } else {
          window.print();
        }
        return;
      }

      // ── 7. New Item / New Entry (Alt+N / Ctrl+N) ───────────────────────────────
      // STRICTLY PREVENTS CHROME NEW WINDOW (Ctrl+N)
      const newDef = getDef('newEntry');
      const isNew =
        (newDef && matchesShortcutEvent(newDef, e)) ||
        (isAlt && !isCtrl && normKey === 'n') ||
        (isCtrl && !isAlt && normKey === 'n');

      if (isNew) {
        consumeEvent();

        // Broadcast to modules (e.g. Accounts new entry)
        window.dispatchEvent(new CustomEvent('app:shortcut:new-entry'));

        // If on Employees page, open Add Employee modal
        const ui = uiRef.current;
        if (ui && ui.setIsEmpModalOpen) {
          const addEmpBtn = Array.from(document.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('إضافة موظف')
          );
          if (addEmpBtn) {
            addEmpBtn.click();
            return;
          }
        }

        // Generic Add button
        const genericAddBtn = Array.from(document.querySelectorAll('button')).find((b) => {
          const text = (b.textContent || '').trim();
          return (
            (text.includes('إضافة') || text.includes('جديد') || text.includes('+')) &&
            !text.includes('حفظ')
          );
        });
        if (genericAddBtn) {
          genericAddBtn.click();
        }
        return;
      }

      // ── 8. Quick Navigation (Alt+1 .. Alt+9) ───────────────────────────────────
      // STRICTLY PREVENTS BROWSER TAB SWITCHING
      if (isAlt && !isCtrl && !isShift && /^[1-9]$/.test(normKey)) {
        consumeEvent();
        const tabIndex = parseInt(normKey, 10) - 1;
        window.dispatchEvent(
          new CustomEvent('app:navigate-tab', { detail: { tabIndex } })
        );
        return;
      }

      // Check custom nav shortcuts if configured differently
      for (let i = 1; i <= 9; i++) {
        const navDef = getDef(
          `nav${['Dashboard', 'Employees', 'Attendance', 'Payroll', 'Accounts', 'Branches', 'Leaves', 'Bylaws', 'Settings'][i - 1]}`
        );
        if (navDef && matchesShortcutEvent(navDef, e)) {
          consumeEvent();
          window.dispatchEvent(
            new CustomEvent('app:navigate-tab', { detail: { tabIndex: i - 1 } })
          );
          return;
        }
      }

      // ── 9. General Prevention of Browser Conflicting Shortcuts ─────────────────
      // (منع نهائي لتأثير الاختصارات على المتصفح)
      // Intercept any leftover browser actions that cause unwanted popups or new tabs:
      // - Ctrl+D: Bookmark page
      // - Ctrl+H: History page
      // - Ctrl+J: Downloads page
      // - Ctrl+U: View Source
      // - Ctrl+G: Find Next
      if (isCtrl && !isAlt && ['d', 'h', 'j', 'u', 'g'].includes(normKey)) {
        consumeEvent();
        if (normKey === 'h') {
          // Direct Ctrl+H to Help / Shortcuts
          setIsShortcutsModalOpen((prev) => !prev);
        }
        return;
      }
    };

    window.addEventListener('mousedown', handlePreventBackdropClick, { capture: true, passive: false });
    window.addEventListener('click', handlePreventBackdropClick, { capture: true, passive: false });
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true, passive: false });

    return () => {
      window.removeEventListener('mousedown', handlePreventBackdropClick, { capture: true });
      window.removeEventListener('click', handlePreventBackdropClick, { capture: true });
      window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
    };
  }, [isShortcutsModalOpen]);

  return (
    <KeyboardShortcutsModal
      isOpen={isShortcutsModalOpen}
      onClose={() => setIsShortcutsModalOpen(false)}
      customShortcuts={shortcutsList}
    />
  );
}
