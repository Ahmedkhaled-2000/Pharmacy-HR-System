import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Edit2,
  History,
  X,
  User,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Building2,
  Wallet,
  Tag,
  MessageSquare,
  RefreshCw,
  Users,
  ShieldCheck,
  TrendingUp,
  Download,
  Filter,
  FileSpreadsheet,
  Upload
} from 'lucide-react';
import ExcelJS from 'exceljs';
import {
  outstockGetCustomers,
  outstockSaveCustomer,
  outstockGetCustomerHistory,
  outstockDeleteCustomer,
  outstockGetBranches
} from '../../../utils/outstockApiClient';
import CustomerWalletModal from '../common/CustomerWalletModal';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';
import CustomerBulkImportModal from './CustomerBulkImportModal';
import { useDeliveryZones } from '../../../utils/deliveryZonesService';

/**
 * OwnerCustomersDirectoryTab.jsx
 * الدليل المركزي الموحد لعملاء المجموعة - بوابة المالك والمشرف العام
 * - مزامنة وعرض كافة عملاء فروع المجموعة كاملة مع مؤشرات إحصائية
 * - كامل مميزات شاشة الفرع: إضافة عميل، تعديل، حذف، محفظة إلكترونية، وسجل طلبات تفصيلي
 * - مراسلة واتساب فورية للعميل بنقرة زر
 * - فلترة متقدمة بالفرع والمنطقة ونوع الطلب واسم الدواء المطلوب
 */
export default function OwnerCustomersDirectoryTab({ showToast = alert }) {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // ── قائمة المناطق / الأحياء المعتمدة من إعدادات المالك (الخدمة المركزية) ──
  const deliveryZones = useDeliveryZones();

  // نافذة إضافة/تعديل عميل
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLandline, setFormLandline] = useState('');
  const [formBranchId, setFormBranchId] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDiscountType, setFormDiscountType] = useState('none'); // 'none' | 'percentage' | 'amount'
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formMinOrderAmount, setFormMinOrderAmount] = useState('');
  const [formDiscountScope, setFormDiscountScope] = useState('all'); // 'all' | 'cosmetics' | 'specific_items'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // نافذة تأكيد حذف عميل
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // نافذة استعراض سجل العميل السابق
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // نافذة محفظة العميل الإلكترونية
  const [walletCustomer, setWalletCustomer] = useState(null);
  const [walletTargetCustomer, setWalletTargetCustomer] = useState(null);
  const [isWalletAuthOpen, setIsWalletAuthOpen] = useState(false);
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState(null);

  const handleOpenWallet = (cust) => {
    setWalletTargetCustomer(cust);
    // للمالك يمكن فتح المحفظة مباشرة كمالك موثق
    setAuthenticatedEmployee({
      employee_code: 'OWNER-01',
      name: 'المالك والمشرف العام'
    });
    setWalletCustomer(cust);
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // تصدير دليل العملاء بالكامل إلى شيت إكسل فاخر
  const handleExportCustomersExcel = async () => {
    if (filteredCustomers.length === 0) {
      showToast?.('⚠️ لا توجد بيانات عملاء للتصدير حالياً');
      return;
    }
    setIsExportingExcel(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'منظومة إدارة النواقص والمشتريات';
      wb.created = new Date();

      const ws = wb.addWorksheet('دليل عملاء المجموعة', {
        views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 2 }]
      });

      // ترويسة الشيت
      ws.mergeCells('A1:K1');
      const titleCell = ws.getCell('A1');
      titleCell.value = '👥 الدليل المركزي الموحد لعملاء المجموعة — الإدارة العامة';
      titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 36;

      const headers = [
        'م',
        'كود العميل',
        'اسم العميل',
        'رقم الواتساب',
        'الهاتف الأرضي',
        'الفرع المسجل فيه',
        'المنطقة / الحي',
        'العنوان التفصيلي',
        'رصيد المحفظة (ج.م)',
        'الخصم الدائم',
        'إجمالي الطلبات'
      ];

      const headRow = ws.getRow(2);
      headRow.values = headers;
      headRow.height = 28;
      headRow.eachCell((cell) => {
        cell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '115E59' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      ws.columns = [
        { key: 'idx', width: 6 },
        { key: 'code', width: 16 },
        { key: 'name', width: 28 },
        { key: 'phone', width: 18 },
        { key: 'landline', width: 16 },
        { key: 'branch', width: 22 },
        { key: 'zone', width: 18 },
        { key: 'address', width: 32 },
        { key: 'wallet', width: 18 },
        { key: 'discount', width: 16 },
        { key: 'orders', width: 14 }
      ];

      filteredCustomers.forEach((c, i) => {
        const branchName = branches.find(b => b.id === c.primary_branch_id)?.name || c.primary_branch_id || 'الفرع الرئيسي';
        const discountLabel = c.custom_discount_type && c.custom_discount_type !== 'none'
          ? `${c.custom_discount_value} ${c.custom_discount_type === 'percentage' ? '%' : 'ج.م'}`
          : 'بدون خصم';

        const row = ws.addRow([
          i + 1,
          c.customer_code || '—',
          c.full_name || '',
          c.whatsapp_phone || '',
          c.landline_phone || '—',
          branchName,
          c.zone || '—',
          c.address || '—',
          parseFloat(c.wallet_balance || 0).toFixed(2),
          discountLabel,
          Number(c.total_orders_count || 0)
        ]);
        row.height = 24;

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { vertical: 'middle' };
          if (colNum === 1 || colNum === 2 || colNum === 4 || colNum === 5 || colNum === 9 || colNum === 10 || colNum === 11) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `دليل_عملاء_المجموعة_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast?.('📊 تم استخراج وتنزيل شيت إكسل عملاء المجموعة بنجاح');
    } catch (err) {
      console.error(err);
      showToast?.('حدث خطأ أثناء تصدير ملف الإكسل');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // جلب كافة بيانات العملاء والفروع
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const [custRes, branchRes] = await Promise.all([
        outstockGetCustomers({
          productSearch: productSearchQuery || undefined
        }),
        outstockGetBranches().catch(() => null)
      ]);

      if (custRes?.success && Array.isArray(custRes.customers)) {
        setCustomers(custRes.customers);
      }
      if (branchRes?.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
        if (!formBranchId && branchRes.branches.length > 0) {
          setFormBranchId(branchRes.branches[0].id);
        }
      }
    } catch (e) {
      console.warn('Fetch customers error:', e);
      showToast?.(`⚠️ خطأ في جلب بيانات العملاء: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [productSearchQuery, formBranchId, showToast]);

  useEffect(() => {
    fetchCustomers();

    const handleRealtimeCustomerUpdate = () => {
      fetchCustomers();
    };

    window.addEventListener('outstock:customer_updated', handleRealtimeCustomerUpdate);
    window.addEventListener('outstock:customer_deleted', handleRealtimeCustomerUpdate);
    window.addEventListener('outstock:order_created', handleRealtimeCustomerUpdate);
    window.addEventListener('outstock:refresh_notifications', handleRealtimeCustomerUpdate);

    return () => {
      window.removeEventListener('outstock:customer_updated', handleRealtimeCustomerUpdate);
      window.removeEventListener('outstock:customer_deleted', handleRealtimeCustomerUpdate);
      window.removeEventListener('outstock:order_created', handleRealtimeCustomerUpdate);
      window.removeEventListener('outstock:refresh_notifications', handleRealtimeCustomerUpdate);
    };
  }, [fetchCustomers]);

  // فتح نافذة الإضافة
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormLandline('');
    setFormBranchId(branches[0]?.id || 'main');
    setFormZone(deliveryZones[0] || '');
    setFormAddress('');
    setFormNotes('');
    setFormDiscountType('none');
    setFormDiscountValue('');
    setFormMinOrderAmount('');
    setFormDiscountScope('all');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // فتح نافذة التعديل
  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust);
    setFormName(cust.full_name || '');
    setFormPhone(cust.whatsapp_phone || '');
    setFormLandline(cust.landline_phone || '');
    setFormBranchId(cust.primary_branch_id || branches[0]?.id || 'main');
    setFormZone(cust.zone || deliveryZones[0] || '');
    setFormAddress(cust.address || '');
    setFormNotes(cust.notes || '');

    const dType = cust.custom_discount_type || 'none';
    setFormDiscountType(dType);
    setFormDiscountValue(cust.custom_discount_value ? String(cust.custom_discount_value) : '');
    setFormMinOrderAmount(cust.discount_min_order_amount ? String(cust.discount_min_order_amount) : '');
    setFormDiscountScope(cust.discount_scope || 'all');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // حفظ العميل (إضافة أو تعديل)
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanName = String(formName || '').trim();
    const cleanPhone = String(formPhone || '').replace(/\D/g, '');
    const cleanLandline = String(formLandline || '').trim();

    if (!cleanName) {
      setFormError('يرجى إدخال اسم العميل');
      return;
    }

    if (!cleanPhone || cleanPhone.length !== 11) {
      setFormError(`رقم هاتف العميل غير صحيح (${cleanPhone.length} أرقام)! يجب أن يتكون من 11 رقماً بالضبط`);
      return;
    }

    if (!cleanPhone.startsWith('01')) {
      setFormError('رقم هاتف العميل يجب أن يبدأ بـ 01 (أرقام المحمول المصرية المعتمدة)');
      return;
    }

    let parsedDiscVal = parseFloat(formDiscountValue);
    if (formDiscountType !== 'none') {
      if (isNaN(parsedDiscVal) || parsedDiscVal <= 0) {
        setFormError('يرجى إدخال قيمة خصم صحيحة أكبر من الصفر');
        return;
      }
      if (formDiscountType === 'percentage' && parsedDiscVal > 100) {
        setFormError('نسبة الخصم المئوية لا يمكن أن تتجاوز 100%');
        return;
      }
    } else {
      parsedDiscVal = null;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: editingCustomer?.id || undefined,
        fullName: cleanName,
        whatsappPhone: cleanPhone,
        landlinePhone: cleanLandline || null,
        branchId: formBranchId || editingCustomer?.primary_branch_id || branches[0]?.id || 'main',
        zone: formZone || null,
        address: formAddress ? String(formAddress).trim() : null,
        notes: formNotes ? String(formNotes).trim() : null,
        customDiscountType: formDiscountType,
        customDiscountValue: parsedDiscVal,
        discountMinOrderAmount: formMinOrderAmount ? parseFloat(formMinOrderAmount) : null,
        discountScope: formDiscountScope
      };

      const res = await outstockSaveCustomer(payload);
      if (res?.success) {
        showToast?.(editingCustomer ? '✅ تم تحديث بيانات العميل بنجاح' : '✅ تم إضافة العميل الجديد وتعميم حسابه بنجاح');
        setIsEditModalOpen(false);
        fetchCustomers();
      } else {
        setFormError(res?.error || 'تعذر حفظ بيانات العميل');
      }
    } catch (err) {
      setFormError(err.message || 'حدث خطأ غير متوقع أثناء الحفظ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // فتح نافذة سجل الطلبات للعميل
  const handleOpenHistory = async (cust) => {
    setHistoryCustomer(cust);
    setIsLoadingHistory(true);
    try {
      const res = await outstockGetCustomerHistory(cust.id);
      if (res?.success && Array.isArray(res.orders)) {
        setCustomerOrders(res.orders);
      } else {
        setCustomerOrders([]);
      }
    } catch (e) {
      setCustomerOrders([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // تأكيد وتنفيذ حذف العميل
  const handleConfirmDelete = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const res = await outstockDeleteCustomer(deletingCustomer.id);
      if (res?.success) {
        showToast?.('🗑️ تم حذف العميل بنجاح مع الحفاظ على الفواتير التاريخية بأمان');
        setDeletingCustomer(null);
        fetchCustomers();
      } else {
        showToast?.(`⚠️ فشل الحذف: ${res?.error || 'خطأ غير معروف'}`);
      }
    } catch (e) {
      showToast?.(`❌ خطأ أثناء الحذف: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // فتح رابط محادثة واتساب مباشر للعميل
  const handleOpenWhatsAppChat = (cust) => {
    const cleanPh = String(cust.whatsapp_phone || '').replace(/\D/g, '');
    if (!cleanPh) return;
    const intlPhone = cleanPh.startsWith('01') ? `2${cleanPh}` : cleanPh;
    const msg = encodeURIComponent(`أهلاً بحضرتك أستاذ ${cust.full_name || ''} 🌸\nنتواصل معك من الإدارة المركزية لمجموعة الصيدليات بخصوص متابعة طلباتكم واستفساراتكم.`);
    window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank');
  };

  // تطبيق الفلاتر على العملاء
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (selectedBranchFilter !== 'all' && c.primary_branch_id !== selectedBranchFilter) {
        return false;
      }
      if (selectedZoneFilter !== 'all' && c.zone !== selectedZoneFilter) {
        return false;
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const name = String(c.full_name || '').toLowerCase();
        const phone = String(c.whatsapp_phone || '').toLowerCase();
        const code = String(c.customer_code || '').toLowerCase();
        const landline = String(c.landline_phone || '').toLowerCase();
        const address = String(c.address || '').toLowerCase();
        const zone = String(c.zone || '').toLowerCase();

        return (
          name.includes(q) ||
          phone.includes(q) ||
          code.includes(q) ||
          landline.includes(q) ||
          address.includes(q) ||
          zone.includes(q)
        );
      }
      return true;
    });
  }, [customers, selectedBranchFilter, selectedZoneFilter, searchQuery]);

  // إحصائيات سريعة للعملاء
  const stats = useMemo(() => {
    const total = customers.length;
    const totalWithOrders = customers.filter(c => (c.real_orders_count || c.total_orders_count || 0) > 0).length;
    const totalWallet = customers.reduce((sum, c) => sum + (parseFloat(c.wallet_balance) || 0), 0);
    const totalDiscountCusts = customers.filter(c => c.custom_discount_type && c.custom_discount_type !== 'none').length;
    return { total, totalWithOrders, totalWallet, totalDiscountCusts };
  }, [customers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── بطاقات الإحصائيات المركزية للمجموعة ── */}
      <div className="outstock-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي عملاء المجموعة الموحدين</p>
            <h3 style={{ color: '#0d9488' }}>{stats.total} عميل</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Users size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عملاء نشطون (لديهم طلبيات)</p>
            <h3 style={{ color: '#0284c7' }}>{stats.totalWithOrders} عميل</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي أرصدة محافظ العملاء</p>
            <h3 style={{ color: '#16a34a' }}>{stats.totalWallet.toFixed(2)} ج.م</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Wallet size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عملاء مخصص لهم خصم خاص</p>
            <h3 style={{ color: '#9333ea' }}>{stats.totalDiscountCusts} عميل</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
            <Tag size={22} />
          </div>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث والأزرار ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
            {/* البحث المباشر */}
            <div className="outstock-search-bar" style={{ flex: '1 1 240px' }}>
              <Search size={16} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="ابحث بالاسم، الهاتف، كود العميل، أو العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* البحث باسم الدواء المطلوب */}
            <div className="outstock-search-bar" style={{ flex: '1 1 200px' }}>
              <Search size={16} className="outstock-search-icon" style={{ color: '#d97706' }} />
              <input
                type="text"
                placeholder="بحث باسم الدواء المحجوز..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* فلتر الفرع */}
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '160px', height: '40px' }}
            >
              <option value="all">🏢 جميع الفروع ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* فلتر المنطقة / الحي */}
            <select
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '150px', height: '40px' }}
            >
              <option value="all">📍 جميع المناطق</option>
              {deliveryZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* زر تصدير إكسل لعملاء المجموعة */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportCustomersExcel}
              disabled={isExportingExcel || filteredCustomers.length === 0}
              style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#15803d', fontWeight: '800' }}
              title="تصدير شيت إكسل فاخر بقاعدة بيانات العملاء"
            >
              <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
              <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير إكسل'}</span>
            </button>

            {/* زر استيراد مجمع للعملاء من إكسل أو CSV */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={() => setIsImportModalOpen(true)}
              style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', fontWeight: '800' }}
              title="استيراد وتحديث قاعدة بيانات العملاء دفعة واحدة من ملف إكسل أو CSV"
            >
              <Upload size={15} style={{ color: '#0284c7' }} />
              <span>استيراد مجمّع (Excel/CSV)</span>
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchCustomers}
              title="تحديث واسترجاع البيانات"
            >
              <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={handleOpenAdd}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>إضافة عميل جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── جدول العملاء الشامل ── */}
      <div className="outstock-card">
        <div className="outstock-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="outstock-card-title">
            <span>👥 قاعدة بيانات عملاء المجموعة الموحدة</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredCustomers.length} عميل مسجل)
            </span>
          </h3>

          <span style={{ fontSize: '12px', color: '#64748b' }}>
            عرض متكامل لكافة الفروع مع صلاحيات التعديل، المحفظة، وسجل الطلبات
          </span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 12px auto' }} />
            <p>جاري جلب قاعدة بيانات عملاء المجموعة الموحدة...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <Users size={40} style={{ opacity: 0.3, margin: '0 auto 12px auto' }} />
            <p style={{ fontWeight: 'bold', fontSize: '15px' }}>لا يوجد عملاء يطابقون خيارات البحث والفلترة</p>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>يمكنك إضافة عميل جديد بالضغط على زر "إضافة عميل جديد" أعلاه</p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>كود العميل</th>
                  <th>اسم العميل</th>
                  <th>رقم الهاتف / الواتساب</th>
                  <th>الفرع المسجل فيه</th>
                  <th>المنطقة / الحي</th>
                  <th>رصيد المحفظة</th>
                  <th>الخصم الدائم</th>
                  <th>إجمالي الطلبات</th>
                  <th>الإجراءات والعمليات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => {
                  const hasDiscount = cust.custom_discount_type && cust.custom_discount_type !== 'none';
                  const walletVal = parseFloat(cust.wallet_balance || 0);

                  return (
                    <tr key={cust.id}>
                      <td>
                        <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px' }}>
                          {cust.customer_code || '—'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{cust.full_name}</strong>
                          {cust.notes && (
                            <span style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }} title={cust.notes}>
                              📝 {cust.notes.length > 28 ? cust.notes.slice(0, 28) + '...' : cust.notes}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#0284c7', fontWeight: '700', direction: 'ltr', fontSize: '13px' }}>
                            {cust.whatsapp_phone}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsAppChat(cust)}
                            style={{
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#16a34a',
                              padding: '3px 6px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title="مراسلة العميل بالواتساب مباشرة"
                          >
                            <MessageSquare size={12} />
                          </button>
                        </div>
                      </td>

                      <td>
                        <span style={{
                          background: '#f0fdfa',
                          border: '1px solid #ccfbf1',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: '800',
                          fontSize: '11.5px',
                          color: '#0f766e',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Building2 size={11} /> {cust.branch_name || cust.primary_branch_id || 'الفرع الرئيسي'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: '#475569' }}>
                          {cust.zone || cust.address || '—'}
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            background: walletVal > 0 ? '#ecfdf5' : '#f8fafc',
                            color: walletVal > 0 ? '#059669' : '#64748b',
                            border: `1px solid ${walletVal > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Wallet size={11} />
                          {walletVal.toFixed(2)} ج.م
                        </span>
                      </td>

                      <td>
                        {hasDiscount ? (
                          <span style={{
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #e9d5ff',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}>
                            {cust.custom_discount_type === 'percentage' ? `${cust.custom_discount_value}%` : `${cust.custom_discount_value} ج.م`}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                        )}
                      </td>

                      <td>
                        <span className="outstock-badge info" style={{ fontSize: '11px' }}>
                          {cust.real_orders_count || cust.total_orders_count || 0} طلب
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="outstock-btn"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11.5px',
                              background: '#ecfdf5',
                              color: '#065f46',
                              border: '1px solid #a7f3d0',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            onClick={() => handleOpenWallet(cust)}
                            title="إدارة وشحن محفظة العميل"
                          >
                            <Wallet size={12} />
                            <span>المحفظة</span>
                          </button>

                          <button
                            type="button"
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            onClick={() => handleOpenHistory(cust)}
                            title="عرض سجل طلبات العميل السابقة"
                          >
                            <History size={12} />
                            <span>الطلبات</span>
                          </button>

                          <button
                            type="button"
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '4px 7px', fontSize: '11.5px' }}
                            onClick={() => handleOpenEdit(cust)}
                            title="تعديل بيانات العميل"
                          >
                            <Edit2 size={12} />
                          </button>

                          <button
                            type="button"
                            className="outstock-btn"
                            style={{
                              padding: '4px 7px',
                              fontSize: '11.5px',
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              cursor: 'pointer'
                            }}
                            onClick={() => setDeletingCustomer(cust)}
                            title="حذف العميل"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة إضافة / تعديل عميل ── */}
      {isEditModalOpen && (
        <div className="outstock-modal-backdrop" onClick={() => !isSubmitting && setIsEditModalOpen(false)}>
          <div className="outstock-modal-panel" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                {editingCustomer ? `✏️ تعديل بيانات العميل: ${editingCustomer.full_name}` : '➕ إضافة عميل جديد لمنظومة المجموعة'}
              </h3>
              <button
                className="outstock-modal-close"
                onClick={() => !isSubmitting && setIsEditModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer}>
              <div className="outstock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {formError && (
                  <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#b91c1c',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="outstock-form-label">
                      اسم العميل بالكامل <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="outstock-form-input"
                      placeholder="مثال: أحمد محمد علي"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="outstock-form-label">
                      رقم هاتف الواتساب (11 رقماً) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      className="outstock-form-input"
                      placeholder="01012345678"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      required
                      disabled={isSubmitting}
                      style={{ direction: 'ltr' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="outstock-form-label">الهاتف الأرضي (اختياري)</label>
                    <input
                      type="text"
                      className="outstock-form-input"
                      placeholder="02xxxxxxx"
                      value={formLandline}
                      onChange={(e) => setFormLandline(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="outstock-form-label">
                      الفرع التابع له <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="outstock-form-select"
                      value={formBranchId}
                      onChange={(e) => setFormBranchId(e.target.value)}
                      disabled={isSubmitting}
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="outstock-form-label">المنطقة / الحي المعتمد</label>
                    <select
                      className="outstock-form-select"
                      value={formZone}
                      onChange={(e) => setFormZone(e.target.value)}
                      disabled={isSubmitting}
                    >
                      {deliveryZones.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="outstock-form-label">العنوان التفصيلي</label>
                    <input
                      type="text"
                      className="outstock-form-input"
                      placeholder="الشارع، رقم العمارة، الشقة، علامة مميزة"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* قسم الخصم الدائم للعميل */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                    🏷️ الخصم الدائم للعميل (صلاحية الإدارة)
                  </span>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    <div>
                      <label className="outstock-form-label">نوع الخصم</label>
                      <select
                        className="outstock-form-select"
                        value={formDiscountType}
                        onChange={(e) => setFormDiscountType(e.target.value)}
                        disabled={isSubmitting}
                      >
                        <option value="none">بدون خصم دائم</option>
                        <option value="percentage">نسبة مئوية (%)</option>
                        <option value="amount">مبلغ ثابت (ج.م)</option>
                      </select>
                    </div>

                    {formDiscountType !== 'none' && (
                      <>
                        <div>
                          <label className="outstock-form-label">قيمة الخصم</label>
                          <input
                            type="number"
                            step="any"
                            className="outstock-form-input"
                            placeholder={formDiscountType === 'percentage' ? 'مثال: 5%' : 'مثال: 20 ج.م'}
                            value={formDiscountValue}
                            onChange={(e) => setFormDiscountValue(e.target.value)}
                            disabled={isSubmitting}
                          />
                        </div>

                        <div>
                          <label className="outstock-form-label">نطاق الخصم</label>
                          <select
                            className="outstock-form-select"
                            value={formDiscountScope}
                            onChange={(e) => setFormDiscountScope(e.target.value)}
                            disabled={isSubmitting}
                          >
                            <option value="all">كافة الأصناف</option>
                            <option value="cosmetics">مستحضرات التجميل فقط</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="outstock-form-label">ملاحظات دائمة على العميل</label>
                  <textarea
                    className="outstock-form-input"
                    rows={2}
                    placeholder="ملاحظات تظهر للصيدلي عند كل طلب (مثال: عميل VIP، توصيل مسائي فقط)"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="outstock-modal-footer">
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmitting}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'جاري الحفظ...' : editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── نافذة سجل طلبات العميل التاريخي ── */}
      {historyCustomer && (
        <div className="outstock-modal-backdrop" onClick={() => setHistoryCustomer(null)}>
          <div className="outstock-modal-panel modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                📋 سجل طلبات العميل: <strong>{historyCustomer.full_name}</strong> ({historyCustomer.customer_code})
              </h3>
              <button className="outstock-modal-close" onClick={() => setHistoryCustomer(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>هاتف العميل:</span>
                  <div style={{ fontWeight: 'bold', color: '#0284c7', direction: 'ltr', textAlign: 'right' }}>
                    {historyCustomer.whatsapp_phone}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>الفرع الأساسي:</span>
                  <div style={{ fontWeight: 'bold', color: '#0f766e' }}>
                    {historyCustomer.branch_name || historyCustomer.primary_branch_id}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>رصيد المحفظة:</span>
                  <div style={{ fontWeight: 'bold', color: '#16a34a' }}>
                    {(parseFloat(historyCustomer.wallet_balance) || 0).toFixed(2)} ج.م
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>إجمالي الطلبات السابقة:</span>
                  <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                    {customerOrders.length} طلب
                  </div>
                </div>
              </div>

              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  جاري جلب سجل طلبات العميل...
                </div>
              ) : customerOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  لا توجد طلبات سابقة مسجلة لهذا العميل.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                  {customerOrders.map((ord) => (
                    <div
                      key={ord.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px',
                        background: '#ffffff'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '13px' }}>
                            طلب #{ord.order_number}
                          </strong>
                          <span style={{ fontSize: '11px', color: '#64748b', marginRight: '8px' }}>
                            ({new Date(ord.created_at).toLocaleDateString('ar-EG')})
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className={`outstock-badge ${ord.order_status === 'delivered' ? 'success' : ord.order_status === 'cancelled' ? 'danger' : 'info'}`}>
                            {ord.order_status === 'delivered' ? 'تم التسليم' : ord.order_status === 'cancelled' ? 'ملغي' : 'نشط / قيد التنفيذ'}
                          </span>
                          <span style={{ fontWeight: 'bold', color: '#0f766e', fontSize: '12px' }}>
                            {ord.branch_name}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {(ord.items || []).map((it, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              color: '#334155'
                            }}
                          >
                            {it.medicationName || it.medication_name} ({it.quantity} علبة) - {it.unitPrice || it.unit_price} ج.م
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#64748b', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
                        <span>الإجمالي: <strong style={{ color: '#0f172a' }}>{ord.total_amount || ord.totalAmount} ج.م</strong></span>
                        <span>المدفوع: <strong style={{ color: '#16a34a' }}>{ord.paid_amount || ord.paidAmount} ج.م</strong></span>
                        <span>المتبقي: <strong style={{ color: '#dc2626' }}>{ord.remaining_amount || ord.remainingAmount} ج.م</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="outstock-modal-footer">
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setHistoryCustomer(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة تأكيد حذف العميل ── */}
      {deletingCustomer && (
        <div className="outstock-modal-backdrop" onClick={() => !isDeleting && setDeletingCustomer(null)}>
          <div className="outstock-modal-panel" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-header">
              <h3 style={{ color: '#b91c1c' }}>⚠️ تأكيد حذف العميل</h3>
              <button className="outstock-modal-close" onClick={() => !isDeleting && setDeletingCustomer(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#334155' }}>
                هل أنت متأكد من حذف العميل <strong>{deletingCustomer.full_name}</strong> ({deletingCustomer.whatsapp_phone})؟
              </p>
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '10px',
                marginTop: '12px',
                fontSize: '12px',
                color: '#991b1b'
              }}>
                🔒 سيتم حذف بيانات العميل مع الحفاظ التام على سجل فواتيره وطلباته التاريخية بأمان لمنع أي اختلال محاسبي.
              </div>
            </div>

            <div className="outstock-modal-footer">
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setDeletingCustomer(null)}
                disabled={isDeleting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="outstock-btn"
                style={{ background: '#dc2626', color: '#fff' }}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'جاري الحذف...' : 'نعم، حذف العميل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة محفظة العميل الرقمية ── */}
      {walletCustomer && (
        <CustomerWalletModal
          isOpen={Boolean(walletCustomer)}
          customer={walletCustomer}
          branchId={walletCustomer.primary_branch_id || 'main'}
          authenticatedEmployee={authenticatedEmployee}
          onClose={() => {
            setWalletCustomer(null);
            setWalletTargetCustomer(null);
          }}
          onSuccess={() => {
            setWalletCustomer(null);
            setWalletTargetCustomer(null);
            fetchCustomers();
            showToast?.('✅ تم تحديث حركة المحفظة الرقمية بنجاح');
          }}
          showToast={showToast}
        />
      )}

      {/* ── نافذة استيراد قاعدة بيانات العملاء المجمعة ── */}
      <CustomerBulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          fetchCustomers();
          showToast?.('✅ تم تحديث دليل العملاء بنجاح');
        }}
        branches={branches}
        showToast={showToast}
      />
    </div>
  );
}
