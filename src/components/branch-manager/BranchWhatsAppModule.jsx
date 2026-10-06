import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Send,
  FileText,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Trash2,
  RefreshCw,
  Sparkles,
  Users,
  UserCheck,
  Smartphone,
  ExternalLink,
  MessageSquare,
  QrCode,
  Check,
  Search,
  Eye,
  Clock,
  ChevronDown,
  Info
} from 'lucide-react';
import { getEmpDisplayName, getEmpWhatsAppPhone } from '../../utils/formatters';
import { getResolvedWhatsAppServerUrl } from '../../utils/systemUrlHelper';

// Ready-made Branch Directives Templates
const BRANCH_DIRECTIVE_TEMPLATES = [
  {
    id: 'opening_closing',
    title: '🌟 تعليمات افتتاح وتسليم الشفت',
    icon: '🌟',
    text: `السلام عليكم ورحمة الله وبركاته،
الزميل العزيز: *{اسم_الموظف}* 🌸
(فرع: {اسم_الفرع})

📌 *توجيهات تسليم وافتتاح الشفت:*
1. مراجعة رصيد الخزينة ومطابقة النقدية والفيزا مع نظام ERP بدقة.
2. استلام وتسليم النواقص وطلبات العملاء المعلقة للشفت القادم.
3. التأكد من نظافة وجاهزية كاونترات الصرف وثلاجة الأدوية.
4. تسجيل بصمة الحضور والانصراف في مواعيدها المحددة.

مع تمنياتنا لكم بدوام التوفيق والتميز.
مدير الفرع: *{اسم_المدير}* 🌿`
  },
  {
    id: 'cleanliness_order',
    title: '🧼 توجيهات نظافة وترتيب الصيدلية',
    icon: '🧼',
    text: `السلام عليكم ورحمة الله وبركاته،
فريق عمل صيدلية: *{اسم_الفرع}* 🌸

📌 *تعليمات هامة بشأن الترتيب والنظافة العامة:*
• يرجى فحص الرفوف وإعادة ترتيب العبوات وفق الترتيب الأبجدي وتواريخ الصلاحية (FIFO).
• الحفاظ على المظهر اللائق للكاونترات وتنسيق أجهزة الكمبيوتر وباركود المسح.
• تنظيف واجهات العرض وممرات الصيدلية قبل بدء ساعات الذروة.

مظهر الصيدلية يعكس احترافيتنا أمام عملائنا. شكراً لتعاونكم!
مدير الفرع: *{اسم_المدير}*`
  },
  {
    id: 'attendance_discipline',
    title: '⏰ تنبيه الالتزام بمواعيد الحضور والبصمة',
    icon: '⏰',
    text: `السلام عليكم ورحمة الله وبركاته،
الزميل: *{اسم_الموظف}* 🌸

📌 *تذكير إداري بالانضباط ومواعيد الحضور:*
• مواعيد الحضور والانصراف التزام وظيفي أساسي، ونؤكد على ضرورة التسجيل في الموعد المققر للوردية.
• في حال وجود أي ظرف طارئ، يرجى التنسيق المسبق مع مدير الفرع لترتيب البديل.
• عدم البصمة أو التأخير غير المبرر يؤثر سلباً على تقييم الأداء الشهري.

شاكرين لكم حرصكم الدائم والتزامكم المعهود.
إدارة فرع: *{اسم_الفرع}*`
  },
  {
    id: 'outstock_orders',
    title: '💊 تعليمات صرف وتخزين النواقص',
    icon: '💊',
    text: `السلام عليكم ورحمة الله وبركاته،
فريق صيدلية: *{اسم_الفرع}* 🌸

📌 *تعليمات التعامل مع طلبيات ونواقص الأدوية:*
1. عند وصول شحنة الأدوية، يجب فحص الفاتورة والتشغيلات فوراً قبل التخزين.
2. وضع الأدوية الثلاجة في درجة الحرارة المقررة (2 - 8 مئوية) فور الاستلام دون أي تأخير.
3. تسجيل أي نقص في السيستم لتحديث قائمة النواقص المركزية.

شاكرين دقة أدائكم واهتمامكم بسلامة المرضى.
مدير الفرع: *{اسم_المدير}*`
  },
  {
    id: 'urgent_notice',
    title: '📢 تعميم وتنبيه إداري عاجل',
    icon: '📢',
    text: `⚠️ *تعميم إداري عاجل وهام* ⚠️
إلى كافة موظفي وكادر: *{اسم_الفرع}*

{اكتب_هنا_التوجيه_أو_التعليمات_العاجلة}

يرجى الالتزام التام والاطلاع الفوري والعمل بموجبه من تاريخه.
مدير الفرع: *{اسم_المدير}*
تاريخ: {تاريخ_اليوم}`
  },
  {
    id: 'appreciation',
    title: '🌸 رسالة شكر وتحفيز للفريق',
    icon: '🌸',
    text: `السلام عليكم ورحمة الله وبركاته،
أبطال فريق: *{اسم_الفرع}* 🌟

أود أن أتقدم إليكم بجزيل الشكر والتقدير على جهودكم المتميزة وتفانيكم في خدمة رواد الصيدلية خلال الفترة الماضية.
نجاح الفرع وتحقيق أهدافه هو نتاج عملكم الجماعي الرائع وإخلاصكم.
فخور بكم دائماً وأتمنى لكم مزيداً من النجاح والتألق! 💐

مدير الفرع: *{اسم_المدير}*`
  }
];

export default function BranchWhatsAppModule({
  state,
  setState,
  saveState,
  currentBranch,
  managerEmp,
  showToast,
  isMobileScreen
}) {
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [searchEmpQuery, setSearchEmpQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('opening_closing');
  const [messageText, setMessageText] = useState(() => BRANCH_DIRECTIVE_TEMPLATES[0].text);
  const [attachedFile, setAttachedFile] = useState(null); // { name, size, type, dataUrl, base64 }
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, text: '' });
  const [waServerStatus, setWaServerStatus] = useState('checking'); // 'CONNECTED' | 'DISCONNECTED' | 'QR_READY' | 'checking'
  const [managerPhoneInput, setManagerPhoneInput] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [historyTab, setHistoryTab] = useState(false); // view sent logs
  const fileInputRef = useRef(null);

  const branchIdStr = String(currentBranch?.id || '');
  const branchName = currentBranch?.name || currentBranch?.branchName || 'الفرع';
  const managerName = managerEmp?.name || currentBranch?.managerName || 'مدير الفرع';

  // Branch Manager effective WhatsApp phone
  const detectedManagerPhone = useMemo(() => {
    return managerEmp?.whatsapp || managerEmp?.phone || currentBranch?.phone || '';
  }, [managerEmp, currentBranch]);

  useEffect(() => {
    if (detectedManagerPhone && !managerPhoneInput) {
      setManagerPhoneInput(detectedManagerPhone);
    }
  }, [detectedManagerPhone]);

  // Branch Staff Filter (strictly employees belonging to this branch, excluding the manager)
  const branchEmployees = useMemo(() => {
    if (!branchIdStr) return [];
    const mgrIds = [
      managerEmp?.id,
      managerEmp?.code,
      currentBranch?.managerId,
      currentBranch?.managerCode
    ].filter(Boolean).map(String);

    return (state.employees || []).filter((e) => {
      if (!e || e.status === 'تم الاستقالة' || e.is_active === false) return false;
      const empIdStr = String(e.id || '');
      const empCodeStr = String(e.code || '');

      // Exclude branch manager
      if (mgrIds.includes(empIdStr) || mgrIds.includes(empCodeStr)) return false;
      if (e.isBranchManager || e.role === 'branch_manager' || e.role === 'branch') return false;

      const isMain = String(e.branchId || '') === branchIdStr;
      const isSec = Array.isArray(e.branchesDetails) && e.branchesDetails.some((bd) => String(bd.branchId) === branchIdStr);
      return isMain || isSec;
    });
  }, [state.employees, branchIdStr, managerEmp, currentBranch]);

  // Initial selection: select all branch staff
  useEffect(() => {
    if (selectAll && branchEmployees.length > 0) {
      setSelectedEmployees(new Set(branchEmployees.map((e) => String(e.id))));
    }
  }, [branchEmployees, selectAll]);

  // Check WhatsApp Server Health
  const checkServerStatus = useCallback(async () => {
    try {
      const serverUrl = getResolvedWhatsAppServerUrl(state?.orgSettings);
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(2500)
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'CONNECTED' || data.connected) {
          setWaServerStatus('CONNECTED');
        } else if (data.status === 'QR_READY' || data.qr) {
          setWaServerStatus('QR_READY');
        } else {
          setWaServerStatus('CONNECTED'); // server is live
        }
      } else {
        setWaServerStatus('DISCONNECTED');
      }
    } catch {
      setWaServerStatus('DISCONNECTED');
    }
  }, [state?.orgSettings]);

  useEffect(() => {
    checkServerStatus();
    const interval = setInterval(checkServerStatus, 15000);
    return () => clearInterval(interval);
  }, [checkServerStatus]);

  // Handle template selection
  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplateId(tmpl.id);
    setMessageText(tmpl.text);
  };

  // Insert dynamic placeholder into message text
  const insertPlaceholder = (tag) => {
    setMessageText((prev) => `${prev} ${tag}`);
  };

  // Handle file attachment
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast?.('⚠️ حجم الملف كبير جداً، يرجى اختيار ملف أقل من 20 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : '';
      setAttachedFile({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        rawSize: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl,
        base64
      });
      showToast?.(`📎 تم إرفاق الملف (${file.name}) بنجاح`);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast?.('تمت إزالة المرفق');
  };

  // Save Manager Phone
  const handleSaveManagerPhone = async () => {
    if (!managerPhoneInput) {
      showToast?.('يرجى إدخال رقم الهاتف أولاً');
      return;
    }
    try {
      const updatedEmployees = (state.employees || []).map((e) => {
        if (managerEmp?.id && String(e.id) === String(managerEmp.id)) {
          return { ...e, whatsapp: managerPhoneInput, phone: managerPhoneInput };
        }
        return e;
      });

      const updatedBranches = (state.branches || []).map((b) => {
        if (String(b.id) === branchIdStr) {
          return { ...b, phone: managerPhoneInput, managerPhone: managerPhoneInput };
        }
        return b;
      });

      const newState = {
        ...state,
        employees: updatedEmployees,
        branches: updatedBranches
      };

      if (setState) setState(newState);
      if (saveState) await saveState(newState);

      setIsEditingPhone(false);
      showToast?.('✅ تم حفظ وتحديث رقم واتساب مدير الفرع بنجاح');
    } catch {
      showToast?.('حدث خطأ أثناء حفظ رقم الهاتف');
    }
  };

  // Toggle Employee Selection
  const toggleEmployee = (empId) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      const strId = String(empId);
      if (next.has(strId)) {
        next.delete(strId);
      } else {
        next.add(strId);
      }
      setSelectAll(next.size === branchEmployees.length);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedEmployees(new Set());
      setSelectAll(false);
    } else {
      setSelectedEmployees(new Set(branchEmployees.map((e) => String(e.id))));
      setSelectAll(true);
    }
  };

  // Filtered employees for recipient list
  const filteredRecipients = useMemo(() => {
    const q = searchEmpQuery.trim().toLowerCase();
    if (!q) return branchEmployees;
    return branchEmployees.filter((e) => {
      const name = (e.name || '').toLowerCase();
      const code = String(e.code || '').toLowerCase();
      const job = (e.jobTitle || '').toLowerCase();
      return name.includes(q) || code.includes(q) || job.includes(q);
    });
  }, [branchEmployees, searchEmpQuery]);

  // Format message text for a specific employee
  const formatMessageForEmp = (emp) => {
    const todayStr = new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    return messageText
      .replace(/{اسم_الموظف}/g, getEmpDisplayName(emp))
      .replace(/{اسم_الفرع}/g, branchName)
      .replace(/{اسم_المدير}/g, managerName)
      .replace(/{تاريخ_اليوم}/g, todayStr)
      .replace(/{كود_الموظف}/g, emp.code || '—');
  };

  // ── Mode A: Send via Automated WhatsApp Server API ──
  const handleSendViaServer = async () => {
    const targetEmps = branchEmployees.filter((e) => selectedEmployees.has(String(e.id)));
    if (targetEmps.length === 0) {
      showToast?.('⚠️ يرجى اختيار موظف واحد على الأقل من القائمة.');
      return;
    }
    if (!messageText.trim() && !attachedFile) {
      showToast?.('⚠️ يرجى كتابة نص الرسالة أو إرفاق ملف قبل الإرسال.');
      return;
    }

    const validRecipients = targetEmps.filter((e) => {
      const phone = getEmpWhatsAppPhone(e);
      return phone && phone.replace(/\D/g, '').length >= 10;
    });

    if (validRecipients.length === 0) {
      showToast?.('❌ لا يوجد أرقام هواتف صالحة للموظفين المحددين.');
      return;
    }

    setIsSending(true);
    setSendProgress({ current: 0, total: validRecipients.length, text: 'جاري تجهيز الرسائل...' });

    try {
      const serverUrl = getResolvedWhatsAppServerUrl(state?.orgSettings);
      const messagesPayload = validRecipients.map((emp) => {
        let phone = getEmpWhatsAppPhone(emp).replace(/\D/g, '');
        if (phone.startsWith('01') && phone.length === 11) {
          phone = '2' + phone;
        }

        return {
          phone,
          message: formatMessageForEmp(emp),
          empName: getEmpDisplayName(emp),
          mediaBase64: attachedFile?.base64 || undefined,
          mediaMimeType: attachedFile?.type || undefined,
          mediaName: attachedFile?.name || undefined
        };
      });

      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({
          sessionId: `branch_${branchIdStr}` || 'hr_main',
          messages: messagesPayload
        })
      });

      if (res.ok) {
        showToast?.(`🚀 تم إرسال التوجيهات إلى (${validRecipients.length}) موظف بنجاح!`);
        // Record in sent log
        recordDirectiveHistory({
          title: BRANCH_DIRECTIVE_TEMPLATES.find((t) => t.id === selectedTemplateId)?.title || 'تعليمات مدير الفرع',
          text: messageText,
          recipientsCount: validRecipients.length,
          hasAttachment: Boolean(attachedFile),
          attachmentName: attachedFile?.name,
          date: new Date().toISOString()
        });
      } else {
        // Fallback: server rejected or not fully ready, advise direct web
        showToast?.('⚠️ تعذر الإرسال الآلي التلقائي، يمكنك استخدام زر الإرسال المباشر عبر WhatsApp Web أدناه.');
      }
    } catch (err) {
      console.warn('Server send error:', err);
      showToast?.('⚠️ لم يستجب خادم الواتساب، استخدم خيار المراسلة المباشرة عبر WhatsApp Web.');
    } finally {
      setIsSending(false);
      setSendProgress({ current: 0, total: 0, text: '' });
    }
  };

  // ── Mode B: Direct WhatsApp Web Link for Single / Next Employee ──
  const handleOpenDirectWhatsApp = (emp) => {
    const rawPhone = getEmpWhatsAppPhone(emp);
    if (!rawPhone || rawPhone.replace(/\D/g, '').length < 10) {
      showToast?.(`❌ لا يوجد رقم هاتف مسجل للموظف (${getEmpDisplayName(emp)})`);
      return;
    }
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '2' + cleanPhone;
    }

    const msg = formatMessageForEmp(emp);
    const url = isMobileScreen
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
    showToast?.(`📲 جاري فتح محادثة (${getEmpDisplayName(emp)}) على واتساب...`);
  };

  // Save history of sent directives
  const recordDirectiveHistory = (item) => {
    try {
      const existing = JSON.parse(localStorage.getItem(`branch_wa_history_${branchIdStr}`) || '[]');
      const updated = [item, ...existing].slice(0, 30);
      localStorage.setItem(`branch_wa_history_${branchIdStr}`, JSON.stringify(updated));
    } catch {}
  };

  const directiveHistory = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(`branch_wa_history_${branchIdStr}`) || '[]');
    } catch {
      return [];
    }
  }, [branchIdStr, isSending]);

  return (
    <div className="card fade-in" style={{ padding: isMobileScreen ? '14px' : '22px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* ── 1. Header Banner & WhatsApp Status ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1.5px solid var(--border)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: isMobileScreen ? '18px' : '22px', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>💬</span>
              <span>مركز مراسلات وتوجيهات واتساب الفرع</span>
            </h2>
            <span style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '11.5px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              boxShadow: '0 2px 6px rgba(16,185,129,0.3)'
            }}>
              {branchName}
            </span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
            إرسال تعليمات وتوجيهات إدارية، تنبيهات الورديات، ومرفقات رسمية لكافة موظفي الفرع عبر الواتساب
          </p>
        </div>

        {/* Manager Phone & Server Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Server indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '10px',
            background: waServerStatus === 'CONNECTED' ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${waServerStatus === 'CONNECTED' ? '#a7f3d0' : '#fde68a'}`,
            fontSize: '12px',
            fontWeight: 700,
            color: waServerStatus === 'CONNECTED' ? '#065f46' : '#92400e'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: waServerStatus === 'CONNECTED' ? '#10b981' : '#f59e0b',
              boxShadow: waServerStatus === 'CONNECTED' ? '0 0 6px #10b981' : 'none'
            }} />
            <span>{waServerStatus === 'CONNECTED' ? 'خادم الواتساب متصل 🟢' : 'ربط مباشر (Web / App) ⚡'}</span>
          </div>

          {/* Toggle Log button */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setHistoryTab(!historyTab)}
            style={{
              padding: '6px 12px',
              fontSize: '12.5px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 700
            }}
          >
            <span>📜</span>
            <span>{historyTab ? 'إخفاء السجل' : `سجل التعليمات (${directiveHistory.length})`}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Manager Phone Linking Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(16, 185, 129, 0.06) 100%)',
        border: '1px solid rgba(13, 148, 136, 0.25)',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#0d9488',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0
          }}>
            📱
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#0f766e', fontWeight: 800, display: 'block' }}>
              رقم واتساب مدير الفرع ({managerName}):
            </span>
            {isEditingPhone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <input
                  type="text"
                  placeholder="مثال: 01012345678"
                  value={managerPhoneInput}
                  onChange={(e) => setManagerPhoneInput(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1.5px solid #0d9488',
                    fontSize: '13px',
                    fontWeight: 700,
                    width: '160px'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveManagerPhone}
                  className="btn btn-start"
                  style={{ padding: '4px 10px', fontSize: '12px', background: '#0d9488' }}
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(false)}
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#115e59', letterSpacing: '0.5px' }}>
                  {managerPhoneInput || 'لم يُحدد رقم بعد'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0d9488',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    textDecoration: 'underline'
                  }}
                >
                  تعديل الرقم ✏️
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#134e4a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>💡 يتم استخدام هذا الرقم كهوية رسمية لمرسل التوجيهات ومحادثات الموظفين</span>
        </div>
      </div>

      {/* ── 3. History Modal / Accordion View ── */}
      {historyTab && (
        <div style={{
          background: 'var(--surface-muted)',
          borderRadius: '12px',
          padding: '14px',
          marginBottom: '20px',
          border: '1px solid var(--border)'
        }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
            📜 سجل التوجيهات والتعليمات المرسلة سابقاً لموظفي الفرع:
          </h4>
          {directiveHistory.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)', textAlign: 'center', padding: '16px' }}>
              لا توجد توجيهات مرسلة مسجلة حتى الآن.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {directiveHistory.map((item, idx) => (
                <div key={idx} style={{
                  background: 'var(--surface)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12.5px'
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: 'var(--text)', display: 'block' }}>{item.title}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      👥 أرسلت إلى {item.recipientsCount} موظف • 📅 {item.date ? item.date.slice(0, 16).replace('T', ' ') : '—'}
                      {item.hasAttachment && ` • 📎 مرفق: ${item.attachmentName || 'ملف'}`}
                    </span>
                  </div>
                  <span style={{ color: '#10b981', fontWeight: 800, fontSize: '11px' }}>تم الإرسال ✅</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. Main Two-Column Layout (Desktop) / Stacked (Mobile) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileScreen ? '1fr' : '1.3fr 1fr',
        gap: '20px',
        alignItems: 'start'
      }}>
        {/* Left Column: Message Composer & Attachment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* A. Template Picker */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
              📋 اختر قالباً جاهزاً أو اكتب تعليماتك المخصصة:
            </label>
            <div style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '6px',
              scrollbarWidth: 'thin'
            }}>
              {BRANCH_DIRECTIVE_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid #0d9488' : '1px solid var(--border)',
                      background: isSelected ? '#ccfbf1' : 'var(--surface-muted)',
                      color: isSelected ? '#0f766e' : 'var(--text)',
                      fontSize: '12px',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{tmpl.icon}</span>
                    <span>{tmpl.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* B. Dynamic Placeholder Shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 700 }}>إدراج تلقائي:</span>
            {[
              { label: 'اسم الموظف', tag: '{اسم_الموظف}' },
              { label: 'اسم الفرع', tag: '{اسم_الفرع}' },
              { label: 'اسم المدير', tag: '{اسم_المدير}' },
              { label: 'تاريخ اليوم', tag: '{تاريخ_اليوم}' }
            ].map((p) => (
              <button
                key={p.tag}
                type="button"
                onClick={() => insertPlaceholder(p.tag)}
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px dashed var(--border)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0d9488',
                  cursor: 'pointer'
                }}
              >
                + {p.label}
              </button>
            ))}
          </div>

          {/* C. Message Textarea */}
          <div style={{ position: 'relative' }}>
            <textarea
              rows={isMobileScreen ? 9 : 12}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="اكتب نص التوجيهات أو التعليمات لموظفي الفرع هنا..."
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: '13.5px',
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
            <span style={{
              position: 'absolute',
              bottom: '10px',
              left: '12px',
              fontSize: '11px',
              color: 'var(--muted)',
              background: 'var(--surface)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {messageText.length} حرف
            </span>
          </div>

          {/* D. File Attachment Dropzone */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
            />
            {attachedFile ? (
              <div style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#16a34a',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0
                  }}>
                    📄
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#166534', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {attachedFile.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#15803d' }}>
                      الحجم: {attachedFile.size} • {attachedFile.type}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  style={{
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={13} />
                  <span>إزالة</span>
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'var(--surface-muted)',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease'
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>📎</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                  إرفاق مستند أو صورة مع التعليمات
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                  يدعم ملفات PDF، جداول Excel، مستندات Word، وصور JPG/PNG حتى 20 ميجابايت
                </div>
              </div>
            )}
          </div>

          {/* E. Action Buttons Bar */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
            <button
              type="button"
              onClick={handleSendViaServer}
              disabled={isSending || selectedEmployees.size === 0}
              style={{
                flex: 1,
                padding: '12px 20px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '14px',
                cursor: selectedEmployees.size > 0 && !isSending ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                opacity: selectedEmployees.size === 0 ? 0.6 : 1
              }}
            >
              <Send size={16} />
              <span>
                {isSending
                  ? 'جاري الإرسال الجماعي...'
                  : `إرسال التعليمات (${selectedEmployees.size} موظف)`}
              </span>
            </button>
          </div>
        </div>

        {/* Right Column: Branch Staff Recipient Selector */}
        <div style={{
          background: 'var(--surface-muted)',
          borderRadius: '14px',
          padding: '16px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Header of recipient selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} color="#0d9488" />
                <span>موظفو الفرع المستلمون ({branchEmployees.length}):</span>
              </h4>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                محدد حالياً: {selectedEmployees.size} من {branchEmployees.length}
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleSelectAll}
              style={{
                background: selectAll ? '#ccfbf1' : 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '5px 10px',
                fontSize: '11.5px',
                fontWeight: 800,
                color: selectAll ? '#0f766e' : 'var(--text)',
                cursor: 'pointer'
              }}
            >
              {selectAll ? '✓ إلغاء تحديد الكل' : '+ تحديد كافة الموظفين'}
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 بحث باسم أو كود الموظف..."
              value={searchEmpQuery}
              onChange={(e) => setSearchEmpQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '12px',
                background: 'var(--surface)',
                boxSizing: 'border-box'
              }}
            />
            {searchEmpQuery && (
              <button
                type="button"
                onClick={() => setSearchEmpQuery('')}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Employee list */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: isMobileScreen ? '320px' : '450px',
            overflowY: 'auto',
            paddingRight: '2px'
          }}>
            {filteredRecipients.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '20px' }}>
                لا يوجد موظفون مطابقون في الفرع.
              </p>
            ) : (
              filteredRecipients.map((emp) => {
                const isSelected = selectedEmployees.has(String(emp.id));
                const waPhone = getEmpWhatsAppPhone(emp);
                const hasValidPhone = waPhone && waPhone.replace(/\D/g, '').length >= 10;

                return (
                  <div
                    key={emp.id}
                    onClick={() => toggleEmployee(emp.id)}
                    style={{
                      background: isSelected ? 'rgba(13, 148, 136, 0.08)' : 'var(--surface)',
                      border: isSelected ? '1.5px solid #0d9488' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '9px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleEmployee(emp.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: '#0d9488' }}
                      />
                      <div style={{ overflow: 'hidden' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {getEmpDisplayName(emp)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                          <span>{emp.jobTitle || 'كادر وظيفي'}</span>
                          <span>•</span>
                          <span style={{ color: hasValidPhone ? '#059669' : '#dc2626', fontWeight: 700 }}>
                            {hasValidPhone ? `📱 ${waPhone}` : '⚠️ بدون هاتف'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Single WhatsApp Send Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDirectWhatsApp(emp);
                      }}
                      title={`مراسلة ${getEmpDisplayName(emp)} مباشرة عبر واتساب`}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        flexShrink: 0
                      }}
                    >
                      <span>💬</span>
                      <span>إرسال فردي</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
