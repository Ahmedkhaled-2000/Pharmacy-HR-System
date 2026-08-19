import React, { useState } from 'react';
import { Building2, Search, Plus, Phone, FileText, ChevronLeft, Loader2 } from 'lucide-react';
import { apiArchiveSaveSupplier } from '../../utils/archiveApiClient';

export default function ArchiveSuppliersTab({
  suppliers = [],
  isLoading = false,
  onSelectSupplier,
  onSupplierSaved = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    const tempName = name.trim();
    const tempPhone = phone.trim();
    if (!tempName) return;

    setIsSaving(true);
    try {
      const res = await apiArchiveSaveSupplier({
        name: tempName,
        phone: tempPhone || null
      });
      if (res.success) {
        setName('');
        setPhone('');
        onSupplierSaved(res.supplier || { id: res.id || 'sup_' + Date.now(), name: tempName, phone: tempPhone });
      } else {
        alert(res.error || 'فشل إضافة المورد');
      }
    } catch {
      alert('حدث خطأ أثناء حفظ المورد');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((sup) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (sup.name || '').toLowerCase().includes(q) ||
      (sup.phone && sup.phone.includes(q))
    );
  });

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 1.5rem 3.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── 1. Top Header Bar with Search (Match Screenshot 4) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🏢</span>
            <span>دليل شركات الأدوية والموردين ({suppliers.length})</span>
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: '4px', fontWeight: 500 }}>
            إدارة وشاشة استعلام الشركات ومعاينة إجمالي الفواتير والمسحوبات لكل مورد
          </p>
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن اسم الشركة أو المورد..."
            style={{
              width: '100%',
              padding: '0.625rem 2.5rem 0.625rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#0b1120',
              border: '1px solid #1e293b',
              fontSize: '0.8125rem',
              color: '#f8fafc',
              outline: 'none'
            }}
          />
          <Search style={{
            position: 'absolute',
            right: '0.875rem',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '16px',
            height: '16px',
            color: '#64748b'
          }} />
        </div>
      </div>

      {/* ── 2. Quick Add Supplier Card (Match Screenshot 4 Exactly) ── */}
      <div style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '20px',
        padding: '1rem 1.25rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        <form onSubmit={handleAddSupplier} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم شركة الأدوية أو المورد الجديد..."
            style={{
              flex: 1,
              minWidth: '240px',
              padding: '0.65rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.8125rem',
              color: '#f8fafc',
              outline: 'none'
            }}
          />
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف (اختياري)..."
            style={{
              width: '100%',
              maxWidth: '240px',
              padding: '0.65rem 1rem',
              borderRadius: '12px',
              backgroundColor: '#070b14',
              border: '1px solid #1e293b',
              fontSize: '0.8125rem',
              color: '#f8fafc',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '12px',
              fontSize: '0.8125rem',
              fontWeight: 800,
              color: '#ffffff',
              backgroundColor: '#2563eb',
              border: '1px solid #3b82f6',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
              opacity: isSaving ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {isSaving ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : <Plus style={{ width: '14px', height: '14px' }} />}
            <span>إضافة مورد</span>
          </button>
        </form>
      </div>

      {/* ── 3. Suppliers Content / Grid (Match Screenshot 4) ── */}
      {filteredSuppliers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 1rem',
          color: '#64748b',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          <p style={{ margin: 0 }}>لا يوجد موردين مسجلين بهذه المواصفات.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredSuppliers.map((sup) => {
            const invoicesCount = sup._count?.invoices || sup.invoicesCount || sup.invoices_count || 0;
            return (
              <div
                key={sup.id}
                onClick={() => onSelectSupplier && onSelectSupplier(sup)}
                style={{
                  backgroundColor: '#0b1120',
                  border: '1px solid #1e293b',
                  borderRadius: '20px',
                  padding: '1.25rem 1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#1e293b';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    color: '#60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.125rem'
                  }}>
                    {(sup.name || 'م').charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                      {sup.name}
                    </h3>
                    {sup.phone ? (
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Phone style={{ width: '12px', height: '12px', color: '#38bdf8' }} />
                        <span style={{ direction: 'ltr' }}>{sup.phone}</span>
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, marginTop: '2px' }}>
                        بدون رقم هاتف
                      </p>
                    )}
                  </div>
                </div>

                <div style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '10px',
                  backgroundColor: '#070b14',
                  border: '1px solid #1e293b',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#94a3b8'
                }}>
                  {invoicesCount} فاتورة
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
