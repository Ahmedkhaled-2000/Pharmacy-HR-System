import React, { useRef, useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import PosSalesWindow from './PosSalesWindow';
import { Minus, Square, Copy, X, ShoppingCart, Plus } from 'lucide-react';

export default function PosMultiWindowManager() {
  const {
    salesWindows,
    activeWindowId,
    bringWindowToFront,
    cycleActiveSalesWindow,
    closeSalesWindow,
    minimizeSalesWindow,
    toggleMaximizeSalesWindow,
    updateWindowPosition,
    updateWindowSize,
    openNewSalesWindow
  } = usePOS();

  // إدارة السحب والتحريك (Dragging)
  const [dragState, setDragState] = useState(null); // { windowId, startX, startY, origX, origY }

  // اختصار التبديل بين النوافذ Ctrl + Tab
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        cycleActiveSalesWindow(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [cycleActiveSalesWindow]);

  const handleTitleBarMouseDown = (e, windowId) => {
    // عدم بدء السحب إذا تم النقر على أزرار التحكم (إغلاق، تصغير، تكبير)
    if (e.target.closest('button')) return;

    bringWindowToFront(windowId);
    const win = salesWindows.find((w) => w.id === windowId);
    if (!win || win.isMaximized) return;

    setDragState({
      windowId,
      startX: e.clientX,
      startY: e.clientY,
      origX: win.position.x,
      origY: win.position.y
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;

      // سحب حر 360 درجة مع ضمان بقاء شريط العنوان مرئياً دائماً في أعلى الشاشة
      const newX = Math.max(0, Math.min(window.innerWidth - 300, dragState.origX - deltaX));
      const newY = Math.max(34, Math.min(window.innerHeight - 80, dragState.origY + deltaY));

      updateWindowPosition(dragState.windowId, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, updateWindowPosition]);

  // إدارة تغيير الأبعاد (Resizing)
  const [resizeState, setResizeState] = useState(null);

  const handleResizerMouseDown = (e, windowId) => {
    e.stopPropagation();
    bringWindowToFront(windowId);
    const win = salesWindows.find((w) => w.id === windowId);
    if (!win || win.isMaximized) return;

    setResizeState({
      windowId,
      startX: e.clientX,
      startY: e.clientY,
      origW: win.size.width,
      origH: win.size.height,
      origX: win.position.x
    });
  };

  useEffect(() => {
    if (!resizeState) return;

    const handleMouseMove = (e) => {
      // بما أن المقبض في الجهة اليسرى السفلية باللغة العربية (RTL):
      const deltaX = resizeState.startX - e.clientX;
      const deltaY = e.clientY - resizeState.startY;

      const newW = Math.max(750, Math.min(window.innerWidth - 40, resizeState.origW + deltaX));
      const newH = Math.max(480, Math.min(window.innerHeight - 80, resizeState.origH + deltaY));

      updateWindowSize(resizeState.windowId, { width: newW, height: newH });
    };

    const handleMouseUp = () => {
      setResizeState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState, updateWindowSize]);

  const handleCloseClick = (win) => {
    if (win.cart.length > 0) {
      const confirmClose = window.confirm(`شاشة البيع [${win.title}] تحتوي على ${win.cart.length} أصناف في السلة.\nهل أنت متأكد من إغلاقها؟`);
      if (!confirmClose) return;
    }
    closeSalesWindow(win.id);
  };

  return (
    <>
      {/* ── لوحة النوافذ العائمة المنبثقة (Floating Windows Canvas) ── */}
      <div className="pos-floating-windows-canvas">
        {salesWindows.map((win) => {
          if (win.isMinimized) return null;

          const isFocused = win.id === activeWindowId;

          const typeBadge = {
            otc: { label: 'OTC لا وصفية', icon: '🟢', color: '#10b981' },
            rx: { label: 'روشتة Rx', icon: '💊', color: '#0ea5e9' },
            customer_order: { label: 'طلب عميل', icon: '📋', color: '#f59e0b' },
            delivery: { label: 'دليفري', icon: '🛵', color: '#8b5cf6' }
          }[win.invoiceType || 'otc'] || { label: 'OTC', icon: '🟢', color: '#10b981' };

          const style = win.isMaximized
            ? { zIndex: win.zIndex }
            : {
                top: `${win.position.y}px`,
                right: `${win.position.x}px`,
                width: `${win.size.width}px`,
                height: `${win.size.height}px`,
                zIndex: win.zIndex
              };

          return (
            <div
              key={win.id}
              className={`pos-floating-window-frame ${isFocused ? 'is-focused' : ''} ${win.isMaximized ? 'is-maximized' : ''}`}
              style={style}
              onMouseDown={() => bringWindowToFront(win.id)}
            >
              {/* شريط عنوان النافذة العائمة القابل للسحب */}
              <div
                className="pos-window-titlebar"
                onMouseDown={(e) => handleTitleBarMouseDown(e, win.id)}
              >
                <div className="pos-window-title-text">
                  <ShoppingCart size={16} color="var(--primary, #0d9488)" />
                  <span>{win.title}</span>

                  {/* شارة نوع الفاتورة */}
                  <span
                    style={{
                      padding: '1px 8px',
                      borderRadius: '99px',
                      background: `${typeBadge.color}22`,
                      border: `1px solid ${typeBadge.color}50`,
                      color: typeBadge.color,
                      fontSize: '10.5px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <span>{typeBadge.icon}</span>
                    <span>{typeBadge.label}</span>
                  </span>

                  {win.cart.length > 0 && (
                    <span
                      style={{
                        padding: '1px 8px',
                        background: 'var(--primary, #0d9488)',
                        color: '#fff',
                        borderRadius: '99px',
                        fontSize: '11px',
                        fontWeight: 900
                      }}
                    >
                      {win.cart.length} أصناف
                    </span>
                  )}
                </div>

                <div className="pos-window-controls">
                  {/* تصغير */}
                  <button
                    type="button"
                    className="pos-win-btn"
                    title="تصغير إلى الشريط السفلي"
                    onClick={(e) => {
                      e.stopPropagation();
                      minimizeSalesWindow(win.id);
                    }}
                  >
                    <Minus size={14} />
                  </button>

                  {/* تكبير / استعادة */}
                  <button
                    type="button"
                    className="pos-win-btn"
                    title={win.isMaximized ? 'استعادة الحجم' : 'تكبير لملء الشاشة'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMaximizeSalesWindow(win.id);
                    }}
                  >
                    {win.isMaximized ? <Copy size={13} /> : <Square size={13} />}
                  </button>

                  {/* إغلاق النافذة */}
                  <button
                    type="button"
                    className="pos-win-btn close"
                    title="إغلاق شاشة البيع"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseClick(win);
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* محتوى شاشة البيع السريعة */}
              <div className="pos-window-body">
                <PosSalesWindow windowId={win.id} />
              </div>

              {/* مقبض تغيير الحجم (يظهر فقط إذا لم تكن مكبرة بالكامل) */}
              {!win.isMaximized && (
                <div
                  className="pos-window-resizer"
                  onMouseDown={(e) => handleResizerMouseDown(e, win.id)}
                  title="سحب لتغيير أبعاد النافذة"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.4 }}>
                    <path d="M12 2L2 12M12 7L7 12M12 12H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── شريط النوافذ السفلية الراسية (Bottom Docking Taskbar) ── */}
      <div className="pos-docking-taskbar">
        <button
          type="button"
          className="pos-dock-new-btn"
          onClick={() => openNewSalesWindow()}
          title="فتح شاشة بيع منبثقة جديدة (F1)"
        >
          <Plus size={15} />
          <span>شاشة بيع جديدة</span>
        </button>

        {salesWindows.map((w, idx) => {
          const isActive = w.id === activeWindowId && !w.isMinimized;
          const cartCount = w.cart.length;

          return (
            <button
              key={w.id}
              type="button"
              className={`pos-dock-item ${isActive ? 'is-active' : ''}`}
              onClick={() => bringWindowToFront(w.id)}
            >
              <ShoppingCart size={13} />
              <span>{w.title}</span>
              {cartCount > 0 && (
                <span
                  style={{
                    padding: '0 5px',
                    borderRadius: '99px',
                    background: isActive ? '#ffffff' : 'var(--primary, #0d9488)',
                    color: isActive ? 'var(--primary, #0d9488)' : '#ffffff',
                    fontSize: '10px',
                    fontWeight: 900
                  }}
                >
                  {cartCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
