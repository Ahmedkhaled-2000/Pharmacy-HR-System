import React, { useState, useMemo } from 'react';
import {
  Clock,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Warehouse
} from 'lucide-react';

export default function StockBatchesTab({
  batches = [],
  locations = [],
  isLoading = false,
  onToggleQuarantine
}) {
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('all'); // 'all' | 'expired' | '30' | '90' | '180'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'quarantined'

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (selectedLocation && b.location_id !== selectedLocation) return false;

      const days = parseInt(b.days_to_expire !== undefined ? b.days_to_expire : 9999, 10);
      if (expiryFilter === 'expired' && days >= 0) return false;
      if (expiryFilter === '30' && (days < 0 || days > 30)) return false;
      if (expiryFilter === '90' && (days < 0 || days > 90)) return false;
      if (expiryFilter === '180' && (days < 0 || days > 180)) return false;

      if (statusFilter === 'quarantined' && !b.is_quarantined) return false;
      if (statusFilter === 'active' && b.is_quarantined) return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const medName = String(b.med_name || '').toLowerCase();
      const batchNo = String(b.batch_number || '').toLowerCase();
      const barcode = String(b.barcode || '').toLowerCase();

      return medName.includes(q) || batchNo.includes(q) || barcode.includes(q);
    });
  }, [batches, search, selectedLocation, expiryFilter, statusFilter]);

  return (
    <div className="stock-grid-wrapper">
      {/* ── شريط أدوات البحث وفلاتر الصلاحية ── */}
      <div className="stock-grid-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
          <div className="stock-search-input-box">
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="ابحث باسم الصنف الدوائي، رقم التشغيلة، أو الباركود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="stock-select-filter"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">🏢 كافة المستودعات والفروع</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          <select
            className="stock-select-filter"
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
          >
            <option value="all">⏳ كافة تواريخ الصلاحية</option>
            <option value="expired">🚫 منتهية الصلاحية تماماً</option>
            <option value="30">⚡ قريبة الانتهاء (أقل من 30 يوماً)</option>
            <option value="90">⚠️ قريبة الانتهاء (أقل من 90 يوماً)</option>
            <option value="180">📅 قريبة الانتهاء (أقل من 180 يوماً)</option>
          </select>

          <select
            className="stock-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">🛡️ كافة الحالات</option>
            <option value="active">✅ تشغيلات نشطة ومتاحة</option>
            <option value="quarantined">🛑 تشغيلات محجورة احترازياً</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          التشغيلات المطابقة: <strong>{filteredBatches.length}</strong>
        </div>
      </div>

      {/* ── جدول التشغيلات FEFO ── */}
      <div className="stock-table-container">
        <table className="stock-data-table">
          <thead>
            <tr>
              <th>الصنف الدوائي</th>
              <th>رقم التشغيلة</th>
              <th>المستودع / الموقع</th>
              <th>تاريخ الصلاحية</th>
              <th>الأيام المتبقية</th>
              <th>الكمية المتبقية</th>
              <th>سعر التكلفة</th>
              <th>الحالة</th>
              <th>إجراءات الرقابة الدوائية</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  جاري فحص التشغيلات وتواريخ الصلاحية...
                </td>
              </tr>
            ) : filteredBatches.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  لا توجد تشغيلات مطابقة للبحث.
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch) => {
                const days = parseInt(batch.days_to_expire !== undefined ? batch.days_to_expire : 9999, 10);
                const isExpired = days < 0;
                const isNearUrgent = days >= 0 && days <= 30;
                const isNearWarning = days > 30 && days <= 90;
                const qty = parseFloat(batch.quantity_base || 0);

                return (
                  <tr
                    key={batch.id}
                    className={batch.is_quarantined || isExpired ? 'row-danger' : isNearUrgent ? 'row-warning' : ''}
                  >
                    <td>
                      <div style={{ fontWeight: 800 }}>{batch.med_name || 'صنف دوائي'}</div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{batch.barcode || '—'}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--stock-font-mono)',
                          fontWeight: 800,
                          color: '#38bdf8',
                          background: 'rgba(14, 165, 233, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        {batch.batch_number || 'DEFAULT'}
                      </span>
                    </td>
                    <td>{batch.location_name || 'المستودع الرئيسي'}</td>
                    <td style={{ fontWeight: 800 }}>
                      {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td>
                      {isExpired ? (
                        <span className="stock-badge danger">
                          منتهية منذ {Math.abs(days)} يوم
                        </span>
                      ) : isNearUrgent ? (
                        <span className="stock-badge danger">
                          متبقي {days} يوم فقط!
                        </span>
                      ) : isNearWarning ? (
                        <span className="stock-badge warning">
                          متبقي {days} يوم
                        </span>
                      ) : (
                        <span className="stock-badge success">
                          متبقي {days} يوم
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        fontWeight: 900,
                        direction: 'ltr',
                        textAlign: 'right',
                        fontSize: '13px',
                        color: qty > 0 ? '#ffffff' : '#94a3b8'
                      }}
                    >
                      {qty.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ direction: 'ltr', textAlign: 'right' }}>
                      {parseFloat(batch.cost_price || 0).toFixed(2)} ج
                    </td>
                    <td>
                      {batch.is_quarantined ? (
                        <span className="stock-badge danger">🛑 محجورة وممنوعة من الصرف</span>
                      ) : isExpired ? (
                        <span className="stock-badge danger">🚫 منتهية الصلاحية</span>
                      ) : (
                        <span className="stock-badge success">✅ صالحة ومطابقة</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`stock-quick-action-btn ${batch.is_quarantined ? 'primary' : 'warning'}`}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => onToggleQuarantine?.(batch.id, !batch.is_quarantined)}
                      >
                        {batch.is_quarantined ? (
                          <>
                            <ShieldCheck size={12} />
                            <span>إلغاء الحجر وإتاحة الصرف</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={12} />
                            <span>حجر التشغيلة احترازياً</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
