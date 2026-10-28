import React, { useState, useEffect } from 'react';
import {
  stockGetSuppliers,
  stockSaveSupplier,
  stockUpdateSupplier
} from '../../utils/stockApiClient';
import {
  Users,
  Plus,
  Search,
  Phone,
  CreditCard,
  Calendar,
  DollarSign,
  FileText,
  Edit2,
  CheckCircle2,
  X,
  RefreshCw,
  Building2
} from 'lucide-react';

export default function StockSuppliersTab({ showToast = () => {} }) {
  const [suppliers, setSuppliers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const [formData, setFormData] = useState({
    supplier_code: '',
    name: '',
    phone: '',
    address: '',
    account_type: 'credit',
    credit_limit: 50000,
    credit_duration_days: 30,
    notes: ''
  });

  const loadSuppliers = async () => {
    try {
      setIsLoading(true);
      const res = await stockGetSuppliers(searchQuery);
      if (res?.success) {
        setSuppliers(res.suppliers || []);
      }
    } catch (err) {
      showToast('فشل تحميل قائمة الموردين', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [searchQuery]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData({
      supplier_code: `SUP-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      phone: '',
      address: '',
      account_type: 'credit',
      credit_limit: 50000,
      credit_duration_days: 30,
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (supp) => {
    setEditingSupplier(supp);
    setFormData({
      supplier_code: supp.supplier_code || '',
      name: supp.name || '',
      phone: supp.phone || '',
      address: supp.address || '',
      account_type: supp.account_type || 'credit',
      credit_limit: supp.credit_limit || 0,
      credit_duration_days: supp.credit_duration_days || 30,
      notes: supp.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('يرجى إدخال اسم المورد', 'error');
      return;
    }

    try {
      if (editingSupplier) {
        await stockUpdateSupplier(editingSupplier.id, formData);
        showToast('تم تحديث بيانات المورد بنجاح', 'success');
      } else {
        await stockSaveSupplier(formData);
        showToast('تمت إضافة المورد الجديد بنجاح', 'success');
      }
      setIsModalOpen(false);
      loadSuppliers();
    } catch (err) {
      showToast(err.message || 'فشل حفظ بيانات المورد', 'error');
    }
  };

  return (
    <div style={{ padding: '20px', direction: 'rtl', fontFamily: "'Cairo', Tahoma, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Building2 size={24} color="#0f766e" />
            إدارة الموردين وشركات الأدوية
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            سجل الموردين، شروط السداد، وسقوف الائتمان المرتبطة بتشغيلات الباركود
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadSuppliers}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button
            onClick={handleOpenAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#0f766e',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 2px 4px rgba(15,118,110,0.2)'
            }}
          >
            <Plus size={16} />
            إضافة مورد جديد
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          type="text"
          placeholder="بحث سريع باسم المورد، الكود، أو رقم الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '11px 42px 11px 16px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Grid of Suppliers */}
      {isLoading && suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>جاري تحميل الموردين...</div>
      ) : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          <Building2 size={40} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ margin: 0, fontSize: '16px', color: '#334155' }}>لا يوجد موردين مسجلين</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>قم بإضافة أول مورد أو شركة توزيع لربطها بالتشغيلات</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {suppliers.map((supp) => (
            <div
              key={supp.id}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ background: '#f0fdfa', color: '#0f766e', fontWeight: 800, fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                      {supp.supplier_code || 'SUP'}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: supp.account_type === 'cash' ? '#d97706' : '#2563eb' }}>
                      {supp.account_type === 'cash' ? 'نقدي (Cash)' : 'آجل (Credit)'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenEdit(supp)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                    title="تعديل المورد"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>

                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  {supp.name}
                </h3>

                {supp.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', marginBottom: '4px' }}>
                    <Phone size={13} color="#0f766e" />
                    <span>{supp.phone}</span>
                  </div>
                )}

                {supp.address && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    📍 {supp.address}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569' }}>
                <div>سقف الائتمان: <strong style={{ color: '#0f172a' }}>{parseFloat(supp.credit_limit || 0).toLocaleString()} ج.م</strong></div>
                <div>مدة السداد: <strong style={{ color: '#0f766e' }}>{supp.credit_duration_days || 30} يوم</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Add / Edit Supplier */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', background: '#0f766e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد / شركة جديدة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>كود المورد</label>
                  <input
                    type="text"
                    value={formData.supplier_code}
                    onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>اسم المورد / الشركة *</label>
                  <input
                    type="text"
                    placeholder="مثال: الشركة المتحدة للأدوية"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>رقم الهاتف / الواتساب</label>
                  <input
                    type="text"
                    placeholder="010XXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>نوع الحساب</label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                  >
                    <option value="credit">آجل (Credit)</option>
                    <option value="cash">نقدي (Cash)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>سقف الائتمان (ج.م)</label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>فترة السداد (أيام)</label>
                  <input
                    type="number"
                    value={formData.credit_duration_days}
                    onChange={(e) => setFormData({ ...formData, credit_duration_days: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>العنوان / مقر الشركة</label>
                <input
                  type="text"
                  placeholder="المدينة / المنطقة"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>ملاحظات وسياسة المرتجعات</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#0f766e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                >
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

