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

  // اختصار التبديل بين النوافذ (Ctrl + Tab / Alt + W / Ctrl + Q / Alt + 1..9 / Alt + الأسهم)
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      const isCtrlTab = e.ctrlKey && e.key === 'Tab';
      const isAltW = e.altKey && (e.key === 'w' || e.key === 'W' || e.key === 'ص');
      const isCtrlQ = e.ctrlKey && (e.key === 'q' || e.key === 'Q' || e.key === 'ض');
      const isAltArrow = e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft');

      if (isCtrlTab || isAltW || isCtrlQ || isAltArrow) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const dir = (e.shiftKey || e.key === 'ArrowLeft') ? -1 : 1;
        cycleActiveSalesWindow(dir);
        return;
      }

      // Alt + 1..9 للتبديل المباشر لرقم الشاشة
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const targetIndex = parseInt(e.key, 10) - 1;
        if (salesWindows[targetIndex]) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          bringWindowToFront(salesWindows[targetIndex].id);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalShortcuts, { capture: true });
  }, [cycleActiveSalesWindow, bringWindowToFront, salesWindows]);

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

      const currentWin = salesWindows.find((w) => w.id === dragState.windowId);
      const winW = currentWin?.size?.width || 1000;

      // سحب حر 360 درجة في كامل محيط الشاشة وفوق الشريط الجانبي بسلاسة مطلقة
      const newX = Math.max(-winW + 120, Math.min(window.innerWidth - 80, dragState.origX + deltaX));
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragState.origY + deltaY));

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

  // إدارة تغيير الأبعاد بثمانية اتجاهات من كافة الجوانب والأطراف (8-Direction Resizing)
  const [resizeState, setResizeState] = useState(null);

  const handleResizerMouseDown = (e, windowId, dir = 'se') => {
    e.stopPropagation();
    bringWindowToFront(windowId);
    const win = salesWindows.find((w) => w.id === windowId);
    if (!win || win.isMaximized) return;

    setResizeState({
      windowId,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origW: win.size.width,
      origH: win.size.height,
      origX: win.position.x,
      origY: win.position.y
    });
  };

  useEffect(() => {
    if (!resizeState) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizeState.startX;
      const deltaY = e.clientY - resizeState.startY;

      let newW = resizeState.origW;
      let newH = resizeState.origH;
      let newX = resizeState.origX;
      let newY = resizeState.origY;

      // المحور الأفقي: التمدد لليمين أو لليسار
      if (resizeState.dir.includes('e')) {
        newW = Math.max(720, Math.min(window.innerWidth - 30, resizeState.origW + deltaX));
      } else if (resizeState.dir.includes('w')) {
        const potentialW = resizeState.origW - deltaX;
        if (potentialW >= 720 && resizeState.origX + deltaX >= 10) {
          newW = potentialW;
          newX = resizeState.origX + deltaX;
        }
      }

      // المحور الرأسي: التمدد لأسفل أو لأعلى
      if (resizeState.dir.includes('s')) {
        newH = Math.max(460, Math.min(window.innerHeight - 60, resizeState.origH + deltaY));
      } else if (resizeState.dir.includes('n')) {
        const potentialH = resizeState.origH - deltaY;
        if (potentialH >= 460 && resizeState.origY + deltaY >= 10) {
          newH = potentialH;
          newY = resizeState.origY + deltaY;
        }
      }

      updateWindowSize(resizeState.windowId, { width: newW, height: newH });
      if (newX !== resizeState.origX || newY !== resizeState.origY) {
        updateWindowPosition(resizeState.windowId, { x: newX, y: newY });
      }
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
  }, [resizeState, updateWindowSize, updateWindowPosition]);

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
        {salesWindows.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: '340px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              direction: 'rtl',
              zIndex: 5,
              padding: '20px',
              pointerEvents: 'auto'
            }}
          >
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '24px',
                padding: '36px 40px',
                textAlign: 'center',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
                maxWidth: '520px',
                width: '100%'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '18px',
                  background: '#f0fdfa',
                  border: '1.5px solid #99f6e4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: '32px'
                }}
              >
                🛒
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>
                طرفية البيع جاهزة لبدء المعاملات
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
                لا توجد فواتير نشطة حالياً. انقر على الزر أدناه أو اضغط على اختصار <strong>[F1]</strong> لبدء تسجيل عملية بيع فورية.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => openNewSalesWindow()}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '13px 24px',
                    fontSize: '14.5px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Plus size={18} />
                  <span>فتح شاشة بيع جديدة [F1]</span>
                </button>
              </div>
            </div>
          </div>
        )}

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
                left: `${win.position.x}px`,
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

              {/* مقابض تغيير الأبعاد بثمانية اتجاهات من كافة أطراف وجوانب النافذة */}
              {!win.isMaximized && (
                <>
                  <div
                    className="pos-resize-handle pos-resize-n"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'n')}
                    title="سحب لتغيير الارتفاع لأعلى"
                  />
                  <div
                    className="pos-resize-handle pos-resize-s"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 's')}
                    title="سحب لتغيير الارتفاع لأسفل"
                  />
                  <div
                    className="pos-resize-handle pos-resize-w"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'w')}
                    title="سحب لتغيير العرض يساراً"
                  />
                  <div
                    className="pos-resize-handle pos-resize-e"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'e')}
                    title="سحب لتغيير العرض يميناً"
                  />
                  <div
                    className="pos-resize-handle pos-resize-nw"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'nw')}
                    title="سحب قطري أعلى-يسار"
                  />
                  <div
                    className="pos-resize-handle pos-resize-ne"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'ne')}
                    title="سحب قطري أعلى-يمين"
                  />
                  <div
                    className="pos-resize-handle pos-resize-sw"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'sw')}
                    title="سحب قطري أسفل-يسار"
                  />
                  <div
                    className="pos-resize-handle pos-resize-se"
                    onMouseDown={(e) => handleResizerMouseDown(e, win.id, 'se')}
                    title="سحب لتغيير الأبعاد بحرية"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.45, position: 'absolute', bottom: 2, right: 2 }}>
                      <path d="M12 2L2 12M12 7L7 12M12 12H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </>
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
