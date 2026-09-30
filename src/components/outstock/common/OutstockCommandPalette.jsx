import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Package,
  Truck,
  Building2,
  Sparkles,
  Pill,
  CreditCard,
  FileText,
  Users,
  BarChart3,
  MessageSquare,
  HelpCircle,
  Plus,
  ArrowRight,
  Printer,
  X,
  Command,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { outstockSearchMedications } from '../../../utils/outstockApiClient';

/**
 * OutstockCommandPalette.jsx
 * شريط الأوامر والبحث السريع المركزي (HUD / Command Palette - Ctrl+K)
 * يوفر تجربة مستخدم عالمية فائقة السرعة تتيح للصيدلي ومدير المشتريات:
 * 1. التنقل الفوري بين كافة أقسام النظام بضغطة زر
 * 2. البحث الحي عن الأدوية وسعر الجمهور من أي مكان في النظام
 * 3. تشغيل العمليات السريعة مثل تسجيل طلب جديد أو طباعة الإيصال
 */
export default function OutstockCommandPalette({
  isOpen,
  onClose,
  onNavigate,
  userRole = 'branch'
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [medResults, setMedResults] = useState([]);
  const [isSearchingMeds, setIsSearchingMeds] = useState(false);
  const inputRef = useRef(null);

  // قائمة الإجراءات والتنقلات السريعة المتاحة
  const navigationItems = useMemo(() => {
    const list = [
      {
        id: 'new_order',
        title: 'تسجيل طلب عميل جديد (نواقص أدوية)',
        category: 'إجراءات سريعة',
        icon: Plus,
        roles: ['branch'],
        action: () => {
          window.dispatchEvent(new CustomEvent('outstock:shortcut_new_order'));
          onClose();
        }
      },
      {
        id: 'quick_print',
        title: 'طباعة الفاتورة الفورية السريعة (Auto-Cut)',
        category: 'إجراءات سريعة',
        icon: Printer,
        roles: ['branch'],
        action: () => {
          window.dispatchEvent(new CustomEvent('outstock:shortcut_quick_print'));
          onClose();
        }
      },
      {
        id: 'orders',
        title: 'طلبات العملاء الحالية ونواقص الفرع',
        category: 'بوابة الصيدلية',
        icon: Package,
        roles: ['branch'],
        action: () => {
          onNavigate('orders');
          onClose();
        }
      },
      {
        id: 'branch_med_search',
        title: 'البحث عن صنف أو بديل وكارتة الدواء',
        category: 'بوابة الصيدلية',
        icon: Pill,
        roles: ['branch'],
        action: () => {
          onNavigate('branch_medication_search');
          onClose();
        }
      },
      {
        id: 'branch_orders',
        title: 'طلبات الفروع المجمعة للتوريد',
        category: 'إدارة المشتريات',
        icon: Building2,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_branches' : 'branch_orders');
          onClose();
        }
      },
      {
        id: 'discounts_comparison',
        title: 'رادار مقارنة خصومات الموردين وبوابة i\'SUPPLY 👑',
        category: 'إدارة المشتريات',
        icon: Sparkles,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_suppliers' : 'procurement_suppliers', 'discounts_comparison');
          onClose();
        }
      },
      {
        id: 'supplier_invoices',
        title: 'فواتير الشراء ومطابقة الأصناف والأرشفة على Drive',
        category: 'إدارة المشتريات',
        icon: FileText,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_suppliers' : 'procurement_suppliers', 'invoices');
          onClose();
        }
      },
      {
        id: 'supplier_accounts',
        title: 'حسابات الموردين وحدود الائتمان وفترات السداد',
        category: 'إدارة المشتريات',
        icon: CreditCard,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_suppliers' : 'procurement_suppliers', 'accounts');
          onClose();
        }
      },
      {
        id: 'delivery_tracking',
        title: 'متابعة تسليم الأصناف والشحن للفروع',
        category: 'إدارة المشتريات',
        icon: Activity,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate('delivery_tracking');
          onClose();
        }
      },
      {
        id: 'unavailable_items',
        title: 'أصناف غير متوفرة بالسوق والبدائل الدوائية',
        category: 'إدارة المشتريات',
        icon: AlertTriangle,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate('unavailable_items');
          onClose();
        }
      },
      {
        id: 'financial_reports',
        title: 'التقارير المالية والأرباح ومبيعات الفروع',
        category: 'إدارة المالك',
        icon: BarChart3,
        roles: ['owner'],
        action: () => {
          onNavigate('owner_financial_reports');
          onClose();
        }
      },
      {
        id: 'medications_catalog',
        title: 'كتالوج وتسعير الأدوية والربط بهيئة الدواء ودراج آي',
        category: 'كتالوج الأدوية',
        icon: Pill,
        roles: ['procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_medications' : 'procurement_medications');
          onClose();
        }
      },
      {
        id: 'whatsapp_center',
        title: 'مركز مراسلات الواتساب والإشعارات التلقائية',
        category: 'الاتصالات',
        icon: MessageSquare,
        roles: ['branch', 'procurement', 'owner'],
        action: () => {
          onNavigate(userRole === 'owner' ? 'owner_whatsapp' : userRole === 'procurement' ? 'procurement_whatsapp' : 'whatsapp');
          onClose();
        }
      }
    ];

    return list.filter(item => !item.roles || item.roles.includes(userRole));
  }, [userRole, onNavigate, onClose]);

  // تصفية العناصر بناءً على البحث
  const filteredNavItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navigationItems;
    return navigationItems.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [query, navigationItems]);

  // البحث الحي في كتالوج الأدوية عند كتابة كلمتين أو أكثر
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMedResults([]);
      setIsSearchingMeds(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingMeds(true);
        const res = await outstockSearchMedications(q, 6);
        if (res?.success) {
          setMedResults(res.medications || []);
        }
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setIsSearchingMeds(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  // دمج كافة النتائج لحساب التحديد بالأزرار
  const totalCombined = filteredNavItems.length + medResults.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // تركيز حقل الإدخال تلقائياً عند الفتح
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setMedResults([]);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // التنقل بمفاتيح الأسهم و Enter و Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (totalCombined || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + (totalCombined || 1)) % (totalCombined || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex < filteredNavItems.length) {
          filteredNavItems[selectedIndex]?.action();
        } else {
          const medIndex = selectedIndex - filteredNavItems.length;
          const chosenMed = medResults[medIndex];
          if (chosenMed) {
            window.dispatchEvent(new CustomEvent('outstock:inspect_medication', { detail: chosenMed }));
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalCombined, selectedIndex, filteredNavItems, medResults, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="outstock-command-palette-backdrop"
      onClick={onClose}
    >
      <div
        className="outstock-command-palette-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط الإدخال */}
        <div className="outstock-command-palette-search">
          <Search size={18} color="#059669" />
          <input
            ref={inputRef}
            type="text"
            placeholder="ابحث عن صنف دواء، كود، فاتورة، أو اختر شاشة للانتقال الفوري إليها..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
            >
              <X size={15} />
            </button>
          )}
          <span className="outstock-kbd-badge">Esc</span>
        </div>

        {/* نتائج البحث وقوائم التنقل */}
        <div className="outstock-command-palette-results">
          {filteredNavItems.length > 0 && (
            <div>
              <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>
                التنقل السريع والإجراءات
              </div>
              {filteredNavItems.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`outstock-command-palette-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: isSelected ? '#d1fae5' : '#f1f5f9',
                          color: isSelected ? '#059669' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.12s'
                        }}
                      >
                        <IconComp size={15} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 800 : 600 }}>
                        {item.title}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: isSelected ? '#059669' : '#94a3b8',
                        padding: '2px 7px',
                        borderRadius: '99px',
                        background: isSelected ? 'rgba(5, 150, 105, 0.1)' : '#f8fafc'
                      }}
                    >
                      {item.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* نتائج الأدوية الحية من الكتالوج */}
          {query.trim().length >= 2 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, color: '#059669', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>نتائج البحث في الأدوية ({medResults.length})</span>
                {isSearchingMeds && <span style={{ fontSize: '10px', color: '#94a3b8' }}>جاري البحث...</span>}
              </div>

              {medResults.length === 0 && !isSearchingMeds ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  لا توجد أدوية مطابقة لكلمة البحث في الكتالوج
                </div>
              ) : (
                medResults.map((med, mIdx) => {
                  const itemIndex = filteredNavItems.length + mIdx;
                  const isSelected = selectedIndex === itemIndex;
                  return (
                    <button
                      key={med.id || med.barcode || mIdx}
                      type="button"
                      className={`outstock-command-palette-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('outstock:inspect_medication', { detail: med }));
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: isSelected ? '#ecfdf5' : '#f8fafc',
                            color: isSelected ? '#059669' : '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Pill size={15} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                            {med.name || med.trade_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                            {med.active_substance || med.activeIngredient || med.company || 'مواصفة دوائية'}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 900,
                            color: '#059669',
                            fontFamily: 'var(--outstock-font-mono)'
                          }}
                        >
                          {med.price || med.public_price ? `${parseFloat(med.price || med.public_price).toFixed(2)} ج.م` : 'غير مسعر'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* تذييل لوحة الأوامر واختصارات التنقل */}
        <div className="outstock-command-palette-footer">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span>
              <span className="outstock-kbd-badge">↑</span> <span className="outstock-kbd-badge">↓</span> للتنقل
            </span>
            <span>
              <span className="outstock-kbd-badge">Enter</span> للاختيار
            </span>
          </div>
          <span>نظام النواقص السحابي المتكامل</span>
        </div>
      </div>
    </div>
  );
}
