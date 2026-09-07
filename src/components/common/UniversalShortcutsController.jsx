import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import { getActiveShortcuts } from '../../utils/shortcutsConfig';

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

    // ── Universal Outside / Backdrop Click Handler ──────────────────────────────
    const handleGlobalClick = (e) => {
      const clickTarget = e.target;
      const mouseDownTarget = mouseDownTargetRef.current;

      // Find if clicked element is a modal overlay/backdrop
      const backdrop = clickTarget.closest(
        '.modal-overlay, .modal-backdrop, .central-modal-backdrop, .acc-modal-overlay, .portal-modal-overlay'
      );

      if (backdrop) {
        const cardSelectors =
          '.modal-card, .modal-content, .central-modal-card, .acc-modal, .acc-modal-card, .portal-modal-card, [role="document"]';
        const isClickInsideCard = Boolean(clickTarget.closest(cardSelectors));
        const wasMouseDownInsideCard = Boolean(mouseDownTarget && mouseDownTarget.closest(cardSelectors));

        // If clicked on backdrop outside card, and user didn't start click inside card (e.g. text selection)
        if (!isClickInsideCard && !wasMouseDownInsideCard) {
          // Look for close button inside this specific modal
          const closeBtn =
            backdrop.querySelector(
              '.modal-close-circle-btn, .modal-close-btn, .del-btn, [data-action="close"], [aria-label*="إغلاق"], [aria-label*="Close"], .btn-close'
            ) ||
            Array.from(backdrop.querySelectorAll('button')).find((b) => {
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
            // Fallback: reset global modal states in UIContext
            closeAllGlobalUIModals();
            window.dispatchEvent(
              new CustomEvent('app:modal-close-request', { detail: { source: 'outside-click' } })
            );
          }
        }
      }
    };

    // Helper to check if event matches a defined shortcut item
    const matchesItem = (item, e) => {
      if (!item) return false;
      const key = (e.key || '').toLowerCase();
      const targetKey = (item.key || '').toLowerCase();

      const isCtrl = Boolean(e.ctrlKey || e.metaKey);
      const isAlt = Boolean(e.altKey);
      const isShift = Boolean(e.shiftKey);

      const mods = item.modifiers || [];
      const reqCtrl = mods.includes('Ctrl');
      const reqAlt = mods.includes('Alt');
      const reqShift = mods.includes('Shift');

      if (key === targetKey && isCtrl === reqCtrl && isAlt === reqAlt && isShift === reqShift) {
        return true;
      }

      // Check fallback combination
      if (item.fallbackKey) {
        const fbTarget = item.fallbackKey.toLowerCase();
        const fbMods = item.fallbackModifiers || [];
        const fbCtrl = fbMods.includes('Ctrl');
        const fbAlt = fbMods.includes('Alt');
        const fbShift = fbMods.includes('Shift');
        if (key === fbTarget && isCtrl === fbCtrl && isAlt === fbAlt && isShift === fbShift) {
          return true;
        }
      }

      return false;
    };

    // ── Universal Keyboard Shortcuts Engine (Capture Phase) ─────────────────────
    const handleGlobalKeyDown = (e) => {
      const currentList = shortcutsRef.current || [];
      const getDef = (id) => currentList.find((s) => s.id === id);

      // ── 1. Escape Key (Universal Modal & Popup Closer) ────────────────────────
      if (e.key === 'Escape') {
        // If Shortcuts Modal itself is open
        if (isShortcutsModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          setIsShortcutsModalOpen(false);
          return;
        }

        // Find visible modal backdrops across the DOM
        const visibleModals = Array.from(
          document.querySelectorAll(
            '.modal-overlay, .modal-backdrop, .central-modal-backdrop, .acc-modal-overlay, .portal-modal-overlay, [role="dialog"], [aria-modal="true"]'
          )
        ).filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

        if (visibleModals.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();

          // Pick the top-most modal (last in DOM)
          const topModal = visibleModals[visibleModals.length - 1];

          // Try clicking its close button
          const closeBtn =
            topModal.querySelector(
              '.modal-close-circle-btn, .modal-close-btn, .del-btn, [data-action="close"], [aria-label*="إغلاق"], [aria-label*="Close"], .btn-close'
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
            // Simulate click on backdrop or reset global state
            topModal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            closeAllGlobalUIModals();
          }

          // Broadcast custom event
          window.dispatchEvent(
            new CustomEvent('app:modal-close-request', { detail: { source: 'escape' } })
          );
          return;
        }

        // If no modals were open, close any open dropdowns or menus
        window.dispatchEvent(new CustomEvent('app:dropdown-close-request'));
        return;
      }

      // ── 2. Help & Shortcuts Cheatsheet ────────────────────────────────────────
      const helpItem = getDef('help');
      if (
        (helpItem && matchesItem(helpItem, e)) ||
        e.key === 'F1' ||
        (e.altKey && (e.key || '').toLowerCase() === 'h')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setIsShortcutsModalOpen((prev) => !prev);
        return;
      }

      // ── 3. Quick Global Search ────────────────────────────────────────────────
      const searchItem = getDef('quickSearch');
      if (searchItem && matchesItem(searchItem, e)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        // Check for accounts search
        const accSearch = document.getElementById('acc-global-search-input');
        if (accSearch) {
          accSearch.focus();
          accSearch.select?.();
          return;
        }

        // Check for page search inputs
        const pageSearch = document.querySelector(
          'input[type="search"], input[placeholder*="بحث"], .search-box input, .filter-bar input'
        );
        if (pageSearch) {
          pageSearch.focus();
          pageSearch.select?.();
          return;
        }

        uiRef.current?.showToast?.('🔍 استخدم حقل البحث المتاح في الصفحة الحالية');
        return;
      }

      // ── 4. Table / Current View Search ─────────────────────────────────────────
      const findItem = getDef('findInTable');
      if (findItem && matchesItem(findItem, e)) {
        const activeElem = document.activeElement;
        const isInputFocused =
          activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA');

        if (!isInputFocused || e.ctrlKey) {
          const tableSearch = document.querySelector(
            'input[type="search"], input[placeholder*="بحث"], .search-box input'
          );
          if (tableSearch) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            tableSearch.focus();
            tableSearch.select?.();
            return;
          }
        }
      }

      // ── 5. Save Form / Submit Modal ────────────────────────────────────────────
      const saveItem = getDef('saveForm');
      if (saveItem && matchesItem(saveItem, e)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

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
            return text.includes('حفظ') || text.includes('تأكيد') || text.includes('Save');
          });

        if (saveBtn) {
          saveBtn.click();
          uiRef.current?.showToast?.('💾 تم استدعاء الحفظ عبر الاختصار');
        } else {
          uiRef.current?.showToast?.('ℹ️ لا يوجد نموذج مفتوح بحاجة للحفظ حالياً');
        }
        return;
      }

      // ── 6. Print Active View / Slip ────────────────────────────────────────────
      const printItem = getDef('printView');
      if (printItem && matchesItem(printItem, e)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

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

      // ── 7. New Item / New Entry ────────────────────────────────────────────────
      const newItem = getDef('newEntry');
      if (
        (newItem && matchesItem(newItem, e)) ||
        (e.altKey && (e.key || '').toLowerCase() === 'n')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

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
      for (let i = 1; i <= 9; i++) {
        const navItem = getDef(`nav${['Dashboard', 'Employees', 'Attendance', 'Payroll', 'Accounts', 'Branches', 'Leaves', 'Bylaws', 'Settings'][i - 1]}`);
        if (
          (navItem && matchesItem(navItem, e)) ||
          (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === String(i))
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          window.dispatchEvent(
            new CustomEvent('app:navigate-tab', { detail: { tabIndex: i - 1 } })
          );
          return;
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('click', handleGlobalClick, true);
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
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
