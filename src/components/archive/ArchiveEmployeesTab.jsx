import React, { useState } from 'react';
import { Users, Search, Plus, Phone, FileText, ChevronLeft, Edit2, Trash2, Loader2, Shield } from 'lucide-react';
import { apiArchiveDeleteEmployee } from '../../utils/archiveApiClient';
import EmployeeInvoicesModal from './EmployeeInvoicesModal';

export default function ArchiveEmployeesTab({
  employees = [],
  invoices = [],
  isLoading = false,
  onOpenEmployeeModal,
  onSelectInvoice,
  onEmployeeSaved = () => {},
  onEmployeeDeleted = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpForInvoices, setSelectedEmpForInvoices] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.role || '').toLowerCase().includes(q) ||
      (emp.phone && emp.phone.includes(q))
    );
  });

  const handleDelete = async (emp, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}"؟`)) return;

    setDeletingId(emp.id);
    try {
      const res = await apiArchiveDeleteEmployee(emp.id);
      if (res.success) {
        onEmployeeDeleted(emp.id);
      } else {
        alert(res.error || 'فشل حذف الموظف');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 1.5rem 3.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── 1. Top Header Bar (Match Screenshot 5) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>👥</span>
            <span>دليل موظفي الصيدلية ({employees.length})</span>
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: '4px', fontWeight: 500 }}>
            سجل أسماء الموظفين المستلمين ومدخلي البيانات وتتبع الفواتير المسجلة لكل موظف
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenEmployeeModal && onOpenEmployeeModal(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.35rem',
            borderRadius: '12px',
            fontSize: '0.8125rem',
            fontWeight: 800,
            color: '#ffffff',
            backgroundColor: '#2563eb',
            border: '1px solid #3b82f6',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* ── 2. Content Area (Match Screenshot 5 Empty / Filled) ── */}
      {employees.length === 0 ? (
        <div style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '24px',
          padding: '5rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569'
          }}>
            <Users style={{ width: '32px', height: '32px', strokeWidth: 1.5 }} />
          </div>

          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#94a3b8', margin: 0 }}>
            لا يوجد موظفين مسجلين حالياً.
          </p>

          <button
            type="button"
            onClick={() => onOpenEmployeeModal && onOpenEmployeeModal(null)}
            style={{
              padding: '0.65rem 1.75rem',
              borderRadius: '12px',
              fontSize: '0.8125rem',
              fontWeight: 800,
              color: '#ffffff',
              backgroundColor: '#2563eb',
              border: '1px solid #3b82f6',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              cursor: 'pointer',
              marginTop: '0.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            إضافة أول موظف الآن
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredEmployees.map((emp) => {
            const empId = emp.id;
            const receivedCount = invoices.filter(i => String(i.receiverId || i.receiver_id) === String(empId)).length;
            const enteredCount = invoices.filter(i => String(i.entryClerkId || i.entry_clerk_id) === String(empId)).length;
            const isDel = deletingId === emp.id;

            return (
              <div
                key={emp.id}
                style={{
                  backgroundColor: '#0b1120',
                  border: '1px solid #1e293b',
                  borderRadius: '20px',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                      {(emp.name || 'م').charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                        {emp.name}
                      </h3>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px',
                        backgroundColor: '#070b14',
                        border: '1px solid #1e293b',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        color: '#38bdf8',
                        marginTop: '4px'
                      }}>
                        {emp.role || 'مسؤول أرشيف'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <button
                      type="button"
                      onClick={() => onOpenEmployeeModal && onOpenEmployeeModal(emp)}
                      title="تعديل"
                      style={{
                        padding: '0.4rem',
                        borderRadius: '8px',
                        backgroundColor: '#070b14',
                        border: '1px solid #1e293b',
                        color: '#cbd5e1',
                        cursor: 'pointer'
                      }}
                    >
                      <Edit2 style={{ width: '13px', height: '13px' }} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(emp, e)}
                      disabled={isDel}
                      title="حذف"
                      style={{
                        padding: '0.4rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        cursor: 'pointer'
                      }}
                    >
                      {isDel ? <Loader2 style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite' }} /> : <Trash2 style={{ width: '13px', height: '13px' }} />}
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #1e293b',
                  fontSize: '0.75rem',
                  color: '#94a3b8'
                }}>
                  <span>📥 المستلمة: <strong style={{ color: '#f8fafc' }}>{receivedCount}</strong></span>
                  <span>✍️ المدخلة: <strong style={{ color: '#f8fafc' }}>{enteredCount}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEmpForInvoices && (
        <EmployeeInvoicesModal
          employee={selectedEmpForInvoices}
          invoices={invoices}
          onClose={() => setSelectedEmpForInvoices(null)}
          onSelectInvoice={onSelectInvoice}
        />
      )}

    </div>
  );
}
