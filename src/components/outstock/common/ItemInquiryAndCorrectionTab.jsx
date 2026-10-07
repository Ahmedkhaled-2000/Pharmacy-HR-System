import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  Edit,
  PlusCircle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Building2,
  Pill,
  Send,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  FileText,
  User,
  ShieldCheck,
  Tag,
  Camera,
  UploadCloud,
  AlertTriangle
} from 'lucide-react';
import {
  outstockGetMedicationRequests,
  outstockCreateMedicationRequest,
  outstockReplyMedicationRequest,
  outstockApproveNewItemRequest,
  outstockSearchMedications,
  outstockSendInquiryComplaint
} from '../../../utils/outstockApiClient';
import MedicationAutocompleteInput from '../pharmacy/MedicationAutocompleteInput';
import EmployeeCodeAuthModal from './EmployeeCodeAuthModal';

/**
 * ItemInquiryAndCorrectionTab.jsx
 * وحدة الاستعلامات، تصحيح بيانات الأصناف، واعتماد الأصناف الجديدة
 * نظام تبادلي متقدم يربط فروع الصيدليات بإدارة المشتريات:
 * 1. استعلام عن سعر / توفر صنف
 * 2. طلب تصحيح بيانات صنف مسجل (سعر، حجم عبوة، مسمى)
 * 3. طلب اعتماد وإضافة صنف جديد كلياً للكتالوج
 */
export default function ItemInquiryAndCorrectionTab({
  userRole = 'branch', // 'branch' | 'procurement_manager' | 'procurement_officer' | 'owner'
  branchId = null,
  currentBranch = null,
  currentUser = null,
  showToast = (msg) => alert(msg)
}) {
  const isProcurement = userRole === 'procurement_manager' || userRole === 'procurement_officer' || userRole === 'owner';

  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all' | 'inquiry' | 'correction' | 'new_item'
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'resolved' | 'approved' | 'rejected'

  // التحقق من كود الموظف قبل فتح الاستعلام أو التصحيح
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState(null);

  // نافذة تقديم طلب جديد (للفرع)
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [newRequestType, setNewRequestType] = useState('inquiry'); // 'inquiry' | 'correction' | 'new_item'
  const [selectedMed, setSelectedMed] = useState(null);
  const [medicationName, setMedicationName] = useState('');
  const [notes, setNotes] = useState('');
  const [attachmentImage, setAttachmentImage] = useState(null); // base64 string
  const [attachmentName, setAttachmentName] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState(null); // Lightbox
  const [proposedData, setProposedData] = useState({
    public_price: '',
    pack_size: 1,
    dosage_form: '',
    manufacturer: '',
    active_ingredient: '',
    invoice_display_name: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // نافذة الرد على الطلب (للمشتريات)
  const [replyTargetRequest, setReplyTargetRequest] = useState(null);
  const [replyNotes, setReplyNotes] = useState('');
  const [replyStatus, setReplyStatus] = useState('resolved');
  const [isReplying, setIsReplying] = useState(false);

  // تصعيد شكوى لعدم الرد على الاستعلام
  const [complaintTargetInquiry, setComplaintTargetInquiry] = useState(null);
  const [complaintNotes, setComplaintNotes] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalatedInquiryIds, setEscalatedInquiryIds] = useState(new Set());

  // جلب الطلبات
  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (!isProcurement && branchId) {
        params.branchId = branchId;
      }
      if (activeSubTab !== 'all') {
        params.requestType = activeSubTab;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const res = await outstockGetMedicationRequests(params);
      if (res?.success && Array.isArray(res.requests)) {
        setRequests(res.requests);
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.warn('Fetch medication requests error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [activeSubTab, statusFilter, branchId]);

  // عند نجاح التحقق من كود الموظف
  const handleAuthSuccess = (emp) => {
    setAuthenticatedEmployee(emp);
    setIsAuthModalOpen(false);
    setIsNewRequestModalOpen(true);
  };

  // إرسال طلب جديد
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!medicationName.trim()) {
      showToast('⚠️ يرجى إدخال اسم الدواء أو الصنف');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        branchId: branchId || currentBranch?.id || null,
        requestType: newRequestType,
        medicationId: selectedMed?.id || null,
        medicationName: medicationName.trim(),
        proposedData: newRequestType !== 'inquiry' ? proposedData : null,
        notes: notes.trim(),
        requestedBy: authenticatedEmployee?.name || currentUser?.name || currentUser?.full_name || 'صيدلي الفرع',
        employeeCode: authenticatedEmployee?.code || null,
        employeeName: authenticatedEmployee?.name || null,
        attachmentUrl: attachmentImage || null,
        attachmentName: attachmentName || null
      };

      const res = await outstockCreateMedicationRequest(payload);
      if (res?.success) {
        showToast('✅ تم إرسال الطلب لإدارة المشتريات بنجاح!');
        setIsNewRequestModalOpen(false);
        setAuthenticatedEmployee(null);
        setMedicationName('');
        setSelectedMed(null);
        setNotes('');
        setAttachmentImage(null);
        setAttachmentName('');
        setProposedData({
          public_price: '',
          pack_size: 1,
          dosage_form: '',
          manufacturer: '',
          active_ingredient: '',
          invoice_display_name: ''
        });
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر إرسال الطلب'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // إرسال رد المشتريات
  const handleSendReply = async () => {
    if (!replyTargetRequest) return;
    setIsReplying(true);
    try {
      const res = await outstockReplyMedicationRequest(replyTargetRequest.id, {
        status: replyStatus,
        responseNotes: replyNotes.trim(),
        respondedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast('✅ تم تسجيل رد المشتريات بنجاح!');
        setReplyTargetRequest(null);
        setReplyNotes('');
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر تسجيل الرد'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // اعتماد صنف جديد كلياً للكتالوج من قبل المشتريات
  const handleApproveNewItem = async (reqItem) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في اعتماد الصنف "${reqItem.medication_name}" وإضافته فوراً للكتالوج المركزي؟`)) {
      return;
    }
    try {
      const res = await outstockApproveNewItemRequest(reqItem.id, {
        approvedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast(`✅ تم اعتماد وإضافة الصنف "${reqItem.medication_name}" للكتالوج المركزي بنجاح!`);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر اعتماد الصنف'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    }
  };

  // تصعيد شكوى لعدم الرد على الاستعلام للمالك والمشتريات
  const handleSendComplaint = async (e) => {
    e?.preventDefault();
    if (!complaintTargetInquiry) return;
    setIsEscalating(true);
    try {
      const pharmacist = currentUser?.name || authenticatedEmployee?.name || 'صيدلي الفرع';
      const res = await outstockSendInquiryComplaint(complaintTargetInquiry.id, {
        notes: complaintNotes,
        pharmacistName: pharmacist
      });
      if (res?.success) {
        setEscalatedInquiryIds((prev) => new Set(prev).add(complaintTargetInquiry.id));
        showToast?.(res?.message || '🚨 تم تصعيد شكوى عدم الرد للمالك وإدارة المشتريات بنجاح');
        setComplaintTargetInquiry(null);
        setComplaintNotes('');
      } else {
        showToast?.(res?.error || 'تعذر تصعيد الشكوى');
      }
    } catch (err) {
      showToast?.('حدث خطأ في الاتصال أثناء تصعيد الشكوى');
    } finally {
      setIsEscalating(false);
    }
  };

  // تصفية الطلبات المعروضة
  const filteredRequests = useMemo(() => {
    let list = requests;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => {
        const name = String(r.medication_name || '').toLowerCase();
        const branch = String(r.branch_name || '').toLowerCase();
        const by = String(r.requested_by || '').toLowerCase();
        return name.includes(q) || branch.includes(q) || by.includes(q);
      });
    }
    return list;
  }, [requests, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
      {/* ── الرأس التعريفي - مظهر فاتح مؤسسي راقي ── */}
      <div
        className="outstock-card"
        style={{
          padding: '20px 24px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          color: '#0f172a',
          borderRadius: '16px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: '#e0f2fe',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <HelpCircle size={26} color="#0284c7" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
                مركز الاستعلامات، تصحيح الأصناف، واعتماد الأدوية
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                قناة تواصل فورية بين الصيدليات وإدارة المشتريات للتحقق من الأسعار وتحديث الكتالوج المركزي
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={fetchRequests}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '9px 16px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}
            >
              <RefreshCw size={15} />
              <span>تحديث</span>
            </button>

            {!isProcurement && (
              <button
                type="button"
                onClick={() => {
                  if (authenticatedEmployee) {
                    setIsNewRequestModalOpen(true);
                  } else {
                    setIsAuthModalOpen(true);
                  }
                }}
                className="outstock-btn outstock-btn-primary"
                style={{
                  padding: '9px 20px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
                }}
              >
                <PlusCircle size={16} />
                <span>إرسال استفسار / طلب تصحيح</span>
              </button>
            )}
          </div>
        </div>

        {/* التبويبات الفرعية */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'كافة المعاملات', icon: FileText },
            { id: 'inquiry', label: 'استعلامات الأسعار والتوفر', icon: HelpCircle },
            { id: 'correction', label: 'طلبات تصحيح بيانات صنف', icon: Edit },
            { id: 'new_item', label: 'طلبات اعتماد صنف جديد', icon: PlusCircle }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  background: active ? '#0284c7' : '#f8fafc',
                  color: active ? '#ffffff' : '#475569',
                  border: active ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── شريط البحث والفلترة ── */}
      <div className="outstock-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div className="outstock-search-bar" style={{ flex: 1, minWidth: '260px' }}>
          <Search size={18} className="outstock-search-icon" />
          <input
            type="text"
            placeholder="ابحث باسم الصنف، الفرع، أو الصيدلي المسؤول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outstock-search-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#475569' }}>الحالة:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="outstock-form-select"
            style={{ minHeight: '38px', fontSize: '13px', fontWeight: 'bold' }}
          >
            <option value="all">الكل</option>
            <option value="pending">⏳ قيد المراجعة</option>
            <option value="resolved">✅ تم الرد / المعالجة</option>
            <option value="approved">⭐ تم الاعتماد</option>
            <option value="rejected">❌ مرفوض</option>
          </select>
        </div>
      </div>

      {/* ── جدول وقائمة الطلبات ── */}
      <div className="outstock-card" style={{ padding: '0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ marginBottom: '8px' }} />
            <div>جاري تحميل الاستعلامات والطلبات...</div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <HelpCircle size={40} color="#cbd5e1" style={{ marginBottom: '10px' }} />
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد طلبات أو استعلامات مطابقة
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              {isProcurement ? 'لم يتم إرسال طلبات من الفروع حالياً' : 'يمكنك الضغط على زر "إرسال استفسار / طلب تصحيح" للتواصل مع المشتريات'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="outstock-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12.5px' }}>
                  <th style={{ padding: '12px 16px' }}>نوع المعاملة</th>
                  <th style={{ padding: '12px 16px' }}>الصنف المطلوب</th>
                  <th style={{ padding: '12px 16px' }}>الفرع ومقدم الطلب</th>
                  <th style={{ padding: '12px 16px' }}>البيانات والملاحظات</th>
                  <th style={{ padding: '12px 16px' }}>الحالة</th>
                  <th style={{ padding: '12px 16px' }}>رد المشتريات</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((reqItem) => {
                  const typeBadge =
                    reqItem.request_type === 'inquiry'
                      ? { label: 'استعلام سعر/توفر', bg: '#e0f2fe', color: '#0369a1' }
                      : reqItem.request_type === 'correction'
                      ? { label: 'تصحيح بيانات صنف', bg: '#fef3c7', color: '#b45309' }
                      : { label: 'اعتماد صنف جديد', bg: '#dcfce7', color: '#15803d' };

                  const statusBadge =
                    reqItem.status === 'resolved'
                      ? { label: 'تم الرد بنجاح', bg: '#dcfce7', color: '#15803d' }
                      : reqItem.status === 'approved'
                      ? { label: 'معتمد بالكتالوج', bg: '#dbeafe', color: '#1d4ed8' }
                      : reqItem.status === 'rejected'
                      ? { label: 'مرفوض', bg: '#fee2e2', color: '#b91c1c' }
                      : { label: 'قيد الانتظار', bg: '#f1f5f9', color: '#64748b' };

                  const propData = reqItem.proposed_data || {};

                  return (
                    <tr key={reqItem.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {/* نوع المعاملة */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: typeBadge.bg,
                            color: typeBadge.color
                          }}
                        >
                          {typeBadge.label}
                        </span>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          {reqItem.created_at ? new Date(reqItem.created_at).toLocaleDateString('ar-EG') : ''}
                        </div>
                      </td>

                      {/* الصنف */}
                      <td style={{ padding: '12px 16px' }}>
                        <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'block' }}>
                          {reqItem.medication_name}
                        </strong>
                        {propData.active_ingredient && (
                          <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                            المادة: {propData.active_ingredient}
                          </span>
                        )}
                      </td>

                      {/* الفرع ومقدم الطلب */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#334155', fontSize: '12.5px' }}>
                          {reqItem.branch_name || 'فرع الصيدلية'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <User size={12} />
                          <span>بواسطة: <strong>{reqItem.employee_name || reqItem.requested_by || 'الصيدلي'}</strong></span>
                        </div>
                        {reqItem.employee_code && (
                          <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 'bold', marginTop: '1px' }}>
                            كود: {reqItem.employee_code}
                          </div>
                        )}
                      </td>

                      {/* البيانات المقترحة / الملاحظات */}
                      <td style={{ padding: '12px 16px', maxWidth: '280px' }}>
                        {reqItem.notes && (
                          <div style={{ fontSize: '12.5px', color: '#1e293b', marginBottom: '4px' }}>
                            "{reqItem.notes}"
                          </div>
                        )}
                        {reqItem.request_type !== 'inquiry' && propData.public_price && (
                          <div style={{ fontSize: '11.5px', color: '#047857', fontWeight: 'bold' }}>
                            السعر المقترح: {parseFloat(propData.public_price).toFixed(2)} ج.م (حجم: {propData.pack_size || 1})
                          </div>
                        )}
                        {reqItem.attachment_url && (
                          <div style={{ marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(reqItem.attachment_url)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                fontSize: '11.5px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="عرض الصورة المرفقة مع الطلب"
                            >
                              <Camera size={13} color="#2563eb" />
                              <span>📷 عرض الصورة المرفقة</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* الحالة */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: statusBadge.bg,
                            color: statusBadge.color
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* رد المشتريات */}
                      <td style={{ padding: '12px 16px', maxWidth: '240px' }}>
                        {reqItem.response_notes ? (
                          <div style={{ fontSize: '12.5px', color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                            {reqItem.response_notes}
                            <div style={{ fontSize: '10.5px', color: '#0284c7', marginTop: '2px', fontWeight: 'bold' }}>
                              — {reqItem.responded_by || 'المشتريات'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>في انتظار رد المشتريات...</span>
                        )}
                      </td>

                      {/* الإجراء */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {isProcurement ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {reqItem.request_type === 'new_item' && reqItem.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => handleApproveNewItem(reqItem)}
                                style={{
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  cursor: 'pointer'
                                }}
                                title="اعتماد الصنف وإضافته فوراً للكتالوج المركزي"
                              >
                                اعتماد صنف ⭐
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setReplyTargetRequest(reqItem);
                                setReplyNotes(reqItem.response_notes || '');
                                setReplyStatus(reqItem.status === 'pending' ? 'resolved' : reqItem.status);
                              }}
                              style={{
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '12px',
                                fontWeight: '800',
                                cursor: 'pointer'
                              }}
                            >
                              رد / تحديث
                            </button>
                          </div>
                        ) : (
                          <div>
                            {reqItem.status === 'pending' ? (
                              reqItem.has_complaint || escalatedInquiryIds.has(reqItem.id) ? (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="تم تصعيد شكوى للمالك وإدارة المشتريات لعدم الرد"
                                >
                                  <AlertTriangle size={12} />
                                  <span>تم التصعيد 🚨</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setComplaintTargetInquiry(reqItem);
                                    setComplaintNotes('');
                                  }}
                                  style={{
                                    background: '#fff1f2',
                                    color: '#e11d48',
                                    border: '1px solid #fecdd3',
                                    borderRadius: '6px',
                                    padding: '5px 9px',
                                    fontSize: '11.5px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="تصعيد شكوى للمالك والمشتريات لعدم الرد على هذا الاستعلام"
                                >
                                  <AlertTriangle size={13} color="#e11d48" />
                                  <span>تصعيد شكوى لعدم الرد 🚨</span>
                                </button>
                              )
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>-</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 1. نافذة تقديم استفسار / طلب تصحيح (للصيدلية) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {isNewRequestModalOpen && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isSubmitting && setIsNewRequestModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            className="outstock-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '820px',
              width: '100%',
              minHeight: '620px',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: '18px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                تقديم طلب / استعلام لإدارة المشتريات
              </h3>
              <button
                type="button"
                onClick={() => setIsNewRequestModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, minHeight: '520px' }}>
              {/* شارة التحقق من الموظف */}
              {authenticatedEmployee && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', fontSize: '13px', color: '#065f46' }}>
                  <ShieldCheck size={18} style={{ color: '#059669', flexShrink: 0 }} />
                  <div>
                    تم التحقق من هوية مقدم الطلب: <strong>{authenticatedEmployee.name}</strong> (كود: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{authenticatedEmployee.code}</span>)
                  </div>
                </div>
              )}

              {/* اختيار نوع الطلب */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  نوع الطلب:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'inquiry', label: 'استعلام سعر / توفر' },
                    { id: 'correction', label: 'تصحيح بيانات صنف' },
                    { id: 'new_item', label: 'طلب صنف جديد كلياً' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewRequestType(t.id)}
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: newRequestType === t.id ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        background: newRequestType === t.id ? '#e0f2fe' : '#f8fafc',
                        color: newRequestType === t.id ? '#0369a1' : '#475569'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* اختيار أو كتابة اسم الصنف */}
              <div style={{ position: 'relative', zIndex: 100 }}>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  اسم الصنف الدوائي * :
                </label>
                {newRequestType !== 'new_item' ? (
                  <MedicationAutocompleteInput
                    value={medicationName}
                    selectedMed={selectedMed}
                    onMedicationSelect={(name, med) => {
                      setMedicationName(name);
                      setSelectedMed(med);
                      if (med) {
                        setProposedData({
                          public_price: med.public_price || '',
                          pack_size: med.pack_size || 1,
                          dosage_form: med.dosage_form || '',
                          manufacturer: med.manufacturer || '',
                          active_ingredient: med.active_ingredient || '',
                          invoice_display_name: med.invoice_display_name || ''
                        });
                      }
                    }}
                    onTextChange={(val) => setMedicationName(val)}
                    placeholder="ابحث بالاسم التجاري أو الباركود..."
                    required
                  />
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="اكتب الاسم التجاري للصنف الجديد بدقة..."
                    value={medicationName}
                    onChange={(e) => setMedicationName(e.target.value)}
                    className="outstock-form-input"
                  />
                )}
              </div>

              {/* تفاصيل إضافية للصنف الجديد أو تصحيح البيانات */}
              {newRequestType !== 'inquiry' && (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#0369a1' }}>
                    بيانات الصنف المقترحة / الصحيحة:
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                        السعر الرسمي الصحيح للعلبة (ج.م):
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        placeholder="0.00"
                        value={proposedData.public_price}
                        onChange={(e) => setProposedData({ ...proposedData, public_price: e.target.value })}
                        className="outstock-form-input"
                        style={{ minHeight: '36px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                        حجم العبوة (عدد الوحدات):
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={proposedData.pack_size}
                        onChange={(e) => setProposedData({ ...proposedData, pack_size: e.target.value })}
                        className="outstock-form-input"
                        style={{ minHeight: '36px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                        المادة الفعالة:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: Paracetamol"
                        value={proposedData.active_ingredient}
                        onChange={(e) => setProposedData({ ...proposedData, active_ingredient: e.target.value })}
                        className="outstock-form-input"
                        style={{ minHeight: '36px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                        الشركة المصنعة:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: Novartis"
                        value={proposedData.manufacturer}
                        onChange={(e) => setProposedData({ ...proposedData, manufacturer: e.target.value })}
                        className="outstock-form-input"
                        style={{ minHeight: '36px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ملاحظات واستفسار */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  ملاحظات أو تفاصيل الاستفسار * :
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="اكتب استفسارك بالتفصيل (مثل: هل الصنف متوفر حالياً لدى أي مورد؟ أو تم استلام تشغيلة بسعر جديد...)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="outstock-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* إرفاق صورة للصنف أو الروشتة */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Camera size={16} color="#0284c7" />
                  <span>إرفاق صورة للصنف أو الروشتة (اختياري):</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1.5px dashed #94a3b8',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <UploadCloud size={16} color="#0284c7" />
                    <span>{attachmentImage ? 'تغيير الصورة المرفقة' : 'رفع صورة (كاميرا أو ملف)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          showToast('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
                          return;
                        }
                        setAttachmentName(file.name);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setAttachmentImage(event.target.result);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  {attachmentImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '8px' }}>
                      <img
                        src={attachmentImage}
                        alt="معاينة"
                        onClick={() => setPreviewImageUrl(attachmentImage)}
                        style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid #86efac' }}
                        title="انقر لتكبير الصورة"
                      />
                      <span style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>
                        {attachmentName || 'تم إرفاق الصورة'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentImage(null);
                          setAttachmentName('');
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="حذف الصورة"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* الأزرار */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  disabled={isSubmitting}
                  className="outstock-btn outstock-btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="outstock-btn outstock-btn-primary"
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                >
                  {isSubmitting ? 'جاري الإرسال...' : 'إرسال للمشتريات ✉️'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 2. نافذة الرد وتحديث الحالة (لإدارة المشتريات) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {replyTargetRequest && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isReplying && setReplyTargetRequest(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            className="outstock-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px', width: '100%', background: '#ffffff', borderRadius: '18px', overflow: 'hidden' }}
          >
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                رد إدارة المشتريات على طلب: {replyTargetRequest.medication_name}
              </h3>
              <button
                type="button"
                onClick={() => setReplyTargetRequest(null)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  تحديث حالة المعاملة:
                </label>
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value)}
                  className="outstock-form-select"
                  style={{ fontWeight: 'bold' }}
                >
                  <option value="resolved">✅ تم الرد والمعالجة بنجاح</option>
                  <option value="approved">⭐ معتمد رسمياً</option>
                  <option value="rejected">❌ رفض الطلب</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  نص رد المشتريات وتفاصيل التوفر / التسعير:
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="مثال: الصنف متوفر لدى شركة ابن سينا بخصم 20%، السعر الرسمي الجديد 45 ج.م وتم تحديثه..."
                  value={replyNotes}
                  onChange={(e) => setReplyNotes(e.target.value)}
                  className="outstock-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setReplyTargetRequest(null)}
                  disabled={isReplying}
                  className="outstock-btn outstock-btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={isReplying}
                  className="outstock-btn outstock-btn-primary"
                >
                  {isReplying ? 'جاري الحفظ...' : 'حفظ وإرسال الرد للفرع'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة التحقق من كود الموظف */}
      <EmployeeCodeAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(emp) => {
          setAuthenticatedEmployee(emp);
          setIsAuthModalOpen(false);
          setIsNewRequestModalOpen(true);
        }}
        title="التحقق من هوية الصيدلي / الموظف"
        actionDescription="تقديم استفسار، تصحيح صنف، أو طلب إضافة دواء جديد للمشتريات"
      />

      {/* نافذة معاينة الصورة بالحجم الكامل (Lightbox) */}
      {previewImageUrl && (
        <div
          className="outstock-modal-backdrop"
          style={{ zIndex: 99999, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0284c7" />
                <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>معاينة الصورة المرفقة بالطلب</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewImageUrl}
              alt="معاينة الصورة"
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
          </div>
        </div>
      )}

      {/* ── نافذة تصعيد شكوى لعدم الرد ── */}
      {complaintTargetInquiry && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isEscalating && setComplaintTargetInquiry(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            className="outstock-modal-panel"
            style={{ maxWidth: '480px', width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header" style={{ background: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#e11d48" />
                <h3 style={{ margin: 0, color: '#9f1239', fontSize: '15px', fontWeight: '900' }}>
                  تصعيد شكوى لعدم الرد (للمالك والمشتريات) 🚨
                </h3>
              </div>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => !isEscalating && setComplaintTargetInquiry(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendComplaint}>
              <div className="outstock-modal-body" style={{ padding: '16px 20px', fontSize: '13px' }}>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', color: '#9a3412', marginBottom: '14px', fontSize: '12.5px' }}>
                  ⚠️ سيتم تصعيد هذا الاستعلام فوراً إلى <strong>المالك والمشرف العام</strong> مع إشعار إدارة المشتريات للتنبيه على التأخر في الرد.
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div>الصنف: <strong style={{ color: '#0f172a' }}>{complaintTargetInquiry.medication_name}</strong></div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    تاريخ إرسال الاستعلام: {complaintTargetInquiry.created_at ? new Date(complaintTargetInquiry.created_at).toLocaleString('ar-EG') : 'غير محدد'}
                  </div>
                </div>

                <div className="outstock-form-group">
                  <label style={{ fontWeight: '700', color: '#1e293b', fontSize: '12.5px' }}>
                    ملاحظات إضافية على الشكوى (اختياري):
                  </label>
                  <textarea
                    rows={3}
                    value={complaintNotes}
                    onChange={(e) => setComplaintNotes(e.target.value)}
                    placeholder="مثال: العميل متواجد بالصيدلية ومستعجل جداً ولم يتم الرد منذ ساعتين..."
                    className="outstock-form-textarea"
                    style={{ fontSize: '13px' }}
                  />
                </div>
              </div>

              <div className="outstock-modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setComplaintTargetInquiry(null)}
                  disabled={isEscalating}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isEscalating}
                  className="outstock-btn"
                  style={{
                    background: '#e11d48',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    fontWeight: '800',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>{isEscalating ? 'جاري التصعيد...' : 'تأكيد تصعيد الشكوى 🚨'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
