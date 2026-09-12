import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getEmpDisplayName, isEmployeeActive, fmt, getEmpWhatsAppPhone } from '../../utils/formatters';
import {
  WHATSAPP_TEMPLATE_CATEGORIES,
  READY_WHATSAPP_TEMPLATES,
  populateWhatsAppTemplate,
  generatePayslipPrintHtml
} from '../../utils/whatsappTemplates';
import { Send, FileText, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Filter, Users, UserCheck, LogOut, Globe, Network, Copy, Check, ExternalLink, Smartphone, Wifi, ShieldCheck, QrCode, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { useUI } from '../../context/UIContext';

export default function WhatsAppCenterModule({
  state,
  setState,
  saveState,
  showToast,
  monthPicker,
  computeEmpSummary,
  arabicMonthLabel
}) {
  const { showConfirm } = useUI();
  const [selectedBranch, setSelectedBranch] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  
  // فئات وقوالب الرسائل الجاهزة
  const [selectedCategory, setSelectedCategory] = useState('payslips');
  const [selectedTemplateId, setSelectedTemplateId] = useState('payslip_detailed');
  const [editableMessage, setEditableMessage] = useState('');
  const [attachPdfPayslip, setAttachPdfPayslip] = useState(true);

  // حالة خادم الواتساب الحية
  const [waStatus, setWaStatus] = useState('checking'); // 'checking' | 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
  const [waPhone, setWaPhone] = useState('');
  const [waLiveQr, setWaLiveQr] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isChangingNumber, setIsChangingNumber] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgressText, setSendProgressText] = useState('');

  // استكشاف ومعلومات الشبكة للأجهزة الأخرى
  const [networkInfo, setNetworkInfo] = useState(null);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(state?.orgSettings?.waServerUrl || '');
  const [deviceServerUrl, setDeviceServerUrl] = useState(() => {
    try {
      return localStorage.getItem('PHARMACY_DEVICE_WA_URL') || '';
    } catch {
      return '';
    }
  });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showMobileQrModal, setShowMobileQrModal] = useState(false);
  const [mobileQrDataUrl, setMobileQrDataUrl] = useState('');
  const autoWakeupAttempted = React.useRef(false);

  const isPrivateLanIp = useCallback((hostname) => {
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    return /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/.test(hostname);
  }, []);

  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);

  // احتساب رابط السيرفر ديناميكياً:
  // - في تطبيق الويندوز: يرتبط دائماً ومباشرة بالخادم الداخلي 127.0.0.1:3100 بصورة مستقلة ومحمية دون التأثر بتغير الـ IP أو انقطاع الشبكة
  // - في متصفح الويب والموبايل: يرتبط بخادم الصيدلية عبر الـ IP المكتشف على الشبكة المحلية (مثل http://192.168.1.2:3100)
  const serverUrl = useMemo(() => {
    // 1. رابط مخصص مثبت لهذا الجهاز/المتصفح فقط (يدعم رغبة: كل جهاز بربط واتساب مستقل إذا حدده يدوياً)
    const localOverride = (deviceServerUrl || '').trim();
    if (localOverride && !localOverride.includes('apexthunder.com')) {
      return localOverride.replace(/\/+$/, '');
    }

    // 2. في حالة تطبيق الويندوز: تشغيل مباشر ومحمي على 127.0.0.1:3100 بمعزل تام عن كروت الشبكة والـ IP
    if (isDesktop) {
      return 'http://127.0.0.1:3100';
    }

    // 3. في حالة متصفح الويب / الموبايل: الأولوية لعنوان LAN المكتشف والمعلن من خادم الصيدلية (مثل http://192.168.1.2:3100)
    const lanUrl = (state?.orgSettings?.waServerLanUrl || '').trim();
    if (lanUrl && !lanUrl.includes('apexthunder.com')) {
      return lanUrl.replace(/\/+$/, '');
    }

    // 4. الرابط المعمم في إعدادات المنظومة
    const configured = (state?.orgSettings?.waServerUrl || '').trim();
    if (configured && !configured.includes('apexthunder.com') && !configured.includes('localhost:3001')) {
      return configured.replace(/\/+$/, '');
    }

    // 5. إذا كان المتصفح يعمل مباشرة عبر IP محلي بالصيدلية (LAN)
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (isPrivateLanIp(host) && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:3100`;
      }
    }
    return 'http://127.0.0.1:3100';
  }, [deviceServerUrl, isDesktop, state?.orgSettings?.waServerUrl, state?.orgSettings?.waServerLanUrl, isPrivateLanIp]);

  // احتساب عنوان IP الخاص بالشبكة المحلية والمقترح لربط الهواتف والموبايلات
  const primaryLanUrl = useMemo(() => {
    if (networkInfo?.suggestedLanUrl) return networkInfo.suggestedLanUrl;
    if (networkInfo?.localIps?.[0]?.address) return `http://${networkInfo.localIps[0].address}:${networkInfo?.port || 3100}`;
    if (state?.orgSettings?.waServerLanUrl) return state.orgSettings.waServerLanUrl;
    return 'http://192.168.1.2:3100';
  }, [networkInfo, state?.orgSettings?.waServerLanUrl]);

  // هل خدمة الـ IP معلنة ومفعلة حالياً للهواتف والأجهزة الأخرى؟
  const isLanActive = useMemo(() => {
    const current = (state?.orgSettings?.waServerLanUrl || state?.orgSettings?.waServerUrl || '').trim().replace(/\/+$/, '');
    const cleanPrimary = (primaryLanUrl || '').trim().replace(/\/+$/, '');
    return Boolean(current && cleanPrimary && (current === cleanPrimary || current.includes(cleanPrimary.split('://')[1] || '')));
  }, [state?.orgSettings?.waServerLanUrl, state?.orgSettings?.waServerUrl, primaryLanUrl]);

  // تفعيل وتعميم الـ IP لجميع الهواتف بنقرة واحدة
  const handleActivateMobileIp = async () => {
    if (!primaryLanUrl) return;
    try {
      if (isDesktop && window.desktopAPI?.allowFirewall) {
        window.desktopAPI.allowFirewall().catch(() => {});
      }
    } catch {}
    await handleSaveServerUrl(primaryLanUrl);
    showToast?.(`📱 تم تفعيل وتعميم IP السيرفر (${primaryLanUrl}) لجميع الهواتف والموبايلات بنجاح!`);
  };

  // إظهار باركود QR للهواتف لربط الموبايل بنقرة واحدة
  const handleOpenMobileQr = async () => {
    try {
      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://nodejs-test.apexthunder.com';
      const connectUrl = `${origin}?wa_url=${encodeURIComponent(primaryLanUrl)}`;
      const qr = await QRCode.toDataURL(connectUrl, { width: 280, margin: 2 });
      setMobileQrDataUrl(qr);
      setShowMobileQrModal(true);
    } catch {
      showToast?.('تعذر توليد رمز الـ QR');
    }
  };

  // التقاط رابط السيرفر تلقائياً عند فتح الرابط من الهاتف عبر الباركود (?wa_url=...)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const waParam = params.get('wa_url');
        if (waParam && waParam.startsWith('http')) {
          const cleanWa = decodeURIComponent(waParam).trim().replace(/\/+$/, '');
          handleSaveDeviceServerUrl(cleanWa);
          showToast?.(`📲 تم التعرف على خادم الصيدلية وضبطه للهاتف تلقائياً: ${cleanWa}`);
        }
      } catch {}
    }
  }, []);

  const orgSettings = state?.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];

  const activeMonth = monthPicker || new Date().toISOString().slice(0, 7);
  const monthLabel = typeof arabicMonthLabel === 'function' ? arabicMonthLabel(activeMonth) : activeMonth;

  // قائمة الموظفين المفلترة حسب الفرع النشط
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (!isEmployeeActive(e)) return false;
      if (selectedBranch && e.branchId !== selectedBranch) return false;
      return true;
    });
  }, [employees, selectedBranch]);

  // الموظف النموذجي للمعاينة المباشرة
  const previewEmp = useMemo(() => {
    if (targetEmpId) {
      return employees.find(e => e.id === targetEmpId) || filteredEmployees[0] || employees[0];
    }
    return filteredEmployees[0] || employees[0] || null;
  }, [targetEmpId, filteredEmployees, employees]);

  // حساب ملخص الموظف للمعاينة
  const getEmpSummaryData = useCallback((empId) => {
    if (typeof computeEmpSummary === 'function') {
      try {
        return computeEmpSummary(empId, (d) => d.startsWith(activeMonth), activeMonth);
      } catch {
        return {};
      }
    }
    return {};
  }, [computeEmpSummary, activeMonth]);

  // القوالب المتاحة بالفئة المختارة
  const currentCategoryTemplates = useMemo(() => {
    return READY_WHATSAPP_TEMPLATES.filter(t => t.category === selectedCategory);
  }, [selectedCategory]);

  const selectedTemplate = useMemo(() => {
    return READY_WHATSAPP_TEMPLATES.find(t => t.id === selectedTemplateId) || READY_WHATSAPP_TEMPLATES[0];
  }, [selectedTemplateId]);

  // تحديث نص الرسالة عند تغيير القالب أو الموظف المستهدف
  useEffect(() => {
    if (!selectedTemplate) return;
    const branchObj = previewEmp ? branches.find(b => b.id === previewEmp.branchId) : null;
    const summary = previewEmp ? getEmpSummaryData(previewEmp.id) : {};
    const populated = populateWhatsAppTemplate(
      selectedTemplate.text,
      previewEmp,
      summary,
      orgSettings,
      monthLabel,
      branchObj?.name
    );
    setEditableMessage(populated);
    setAttachPdfPayslip(Boolean(selectedTemplate.supportsPdf));
  }, [selectedTemplateId, selectedTemplate, previewEmp, orgSettings, monthLabel, branches, getEmpSummaryData]);

  // 1. حفظ رابط خاص بهذا الجهاز فقط (يدعم: كل جهاز بربط واتساب مستقل)
  const handleSaveDeviceServerUrl = (newUrl) => {
    const cleanUrl = (newUrl || '').trim().replace(/\/+$/, '');
    setDeviceServerUrl(cleanUrl);
    try {
      if (cleanUrl) {
        localStorage.setItem('PHARMACY_DEVICE_WA_URL', cleanUrl);
      } else {
        localStorage.removeItem('PHARMACY_DEVICE_WA_URL');
      }
    } catch {}
    setCustomServerUrl(cleanUrl);
    showToast?.(cleanUrl ? `📌 تم تثبيت رابط السيرفر (${cleanUrl}) لهذا الجهاز فقط` : '🔄 تم إلغاء التثبيت المحلي والعودة للاكتشاف التلقائي');
    setTimeout(() => {
      fetchWaStatus(false, cleanUrl);
    }, 400);
  };

  // 2. حفظ وتعميم رابط السيرفر لجميع أجهزة المنظومة (المكتبي، الهواتف، والويب)
  const handleSaveServerUrl = async (newUrl) => {
    const cleanUrl = (newUrl || '').trim().replace(/\/+$/, '');
    if (setState) {
      setState(prev => {
        const nextState = {
          ...prev,
          orgSettings: {
            ...(prev?.orgSettings || {}),
            waServerUrl: cleanUrl,
            waServerLanUrl: cleanUrl
          }
        };
        if (saveState) {
          saveState(nextState);
        }
        return nextState;
      });
    }
    setCustomServerUrl(cleanUrl);
    showToast?.(cleanUrl ? `🌐 تم تعميم وتفعيل رابط السيرفر (${cleanUrl}) للهواتف وجميع الأجهزة بالصيدلية` : '✅ تم ضبط السيرفر على الوضع التلقائي');
    setTimeout(() => {
      fetchWaStatus(false, cleanUrl);
    }, 500);
  };

  // 3. فحص حالة الخادم الحقيقية
  const fetchWaStatus = useCallback(async (silent = false, overrideUrl = null) => {
    const activeUrl = overrideUrl || serverUrl;
    let statusFound = false;

    // 1. محاولة الاتصال بالرابط النشط
    try {
      const res = await fetch(`${activeUrl.replace(/\/$/, '')}/api/status`, {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data.status || 'DISCONNECTED');
        setWaPhone(data.phone || '');
        setWaLiveQr(data.qrCodeDataUrl || '');
        statusFound = true;
        if (!silent && data.status === 'CONNECTED') {
          showToast?.(`🟢 خادم الواتساب متصل ومقترن بنجاح (+${data.phone})`);
        }
      }
    } catch {}

    // 2. Fallback: إذا فشل الرابط النشط وكان مختلفاً عن 127.0.0.1، نجرب 127.0.0.1 محلياً
    if (!statusFound && activeUrl !== 'http://127.0.0.1:3100') {
      try {
        const fallbackRes = await fetch('http://127.0.0.1:3100/api/status', {
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(1500)
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setWaStatus(data.status || 'DISCONNECTED');
          setWaPhone(data.phone || '');
          setWaLiveQr(data.qrCodeDataUrl || '');
          statusFound = true;
        }
      } catch {}
    }

    // 3. إذا كنا داخل تطبيق الويندوز، نقرأ الحالة مباشرة عبر IPC
    if (!statusFound && typeof window !== 'undefined' && window.desktopAPI?.getWhatsAppServerStatus) {
      try {
        const desktopStatus = await window.desktopAPI.getWhatsAppServerStatus();
        if (desktopStatus && desktopStatus.status && desktopStatus.status !== 'DISCONNECTED') {
          setWaStatus(desktopStatus.status);
          setWaPhone(desktopStatus.phone || '');
          setWaLiveQr(desktopStatus.qrCodeDataUrl || '');
          statusFound = true;
        }
      } catch {}
    }

    if (!statusFound) {
      setWaStatus('DISCONNECTED');
      // محاولة الإيقاظ التلقائي الذكي الصامت لمرة واحدة عند تحميل الصفحة في حال تعذر الوصول
      if (!autoWakeupAttempted.current) {
        autoWakeupAttempted.current = true;
        try {
          if (isDesktop && window.desktopAPI?.restartWhatsAppServer) {
            window.desktopAPI.restartWhatsAppServer();
          } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'hr-whatsapp://start';
            document.body.appendChild(iframe);
            setTimeout(() => {
              try { document.body.removeChild(iframe); } catch {}
            }, 3000);
          }
          setTimeout(() => {
            fetchWaStatus(true);
          }, 3500);
        } catch {}
      } else if (!silent) {
        showToast?.('⚠️ تعذر الوصول لخادم الواتساب، يرجى التأكد من تشغيله أو الضغط على "استكشاف تلقائي للشبكة".');
      }
    }

    // 4. جلب معلومات الشبكة المحلية عبر IPC المكتبي أولاً إذا كان متاحاً
    if (typeof window !== 'undefined' && window.desktopAPI?.getNetworkInfo) {
      try {
        const net = await window.desktopAPI.getNetworkInfo();
        if (net && net.localIps?.length > 0) {
          setNetworkInfo(net);
          if (net.suggestedLanUrl && (!state?.orgSettings?.waServerLanUrl || state?.orgSettings?.waServerLanUrl !== net.suggestedLanUrl) && setState) {
            setState(prev => {
              const nextState = {
                ...prev,
                orgSettings: {
                  ...(prev?.orgSettings || {}),
                  waServerLanUrl: net.suggestedLanUrl,
                  waServerLanIps: net.localIps
                }
              };
              saveState?.(nextState);
              return nextState;
            });
          }
          return;
        }
      } catch {}
    }

    // 5. استكشاف عناوين الشبكة المحلية عبر HTTP في الخلفية لمساعدة الأجهزة الأخرى
    try {
      let netRes = await fetch(`${activeUrl.replace(/\/$/, '')}/api/network-info`, {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(2000)
      }).catch(() => null);

      if (!netRes || !netRes.ok) {
        netRes = await fetch('http://127.0.0.1:3100/api/network-info', {
          signal: AbortSignal.timeout(1500)
        }).catch(() => null);
      }

      if (netRes && netRes.ok) {
        const netData = await netRes.json();
        if (netData?.localIps?.length > 0) {
          setNetworkInfo(netData);
          if (netData.suggestedLanUrl && (!state?.orgSettings?.waServerLanUrl || state?.orgSettings?.waServerLanUrl !== netData.suggestedLanUrl) && setState) {
            setState(prev => {
              const nextState = {
                ...prev,
                orgSettings: {
                  ...(prev?.orgSettings || {}),
                  waServerLanUrl: netData.suggestedLanUrl,
                  waServerLanIps: netData.localIps
                }
              };
              saveState?.(nextState);
              return nextState;
            });
          }
        }
      }
    } catch {}
  }, [serverUrl, showToast, state?.orgSettings?.waServerLanUrl, setState, saveState]);

  // 4. دالة الاستكشاف التلقائي لشبكة الصيدلية (LAN Auto-Discovery)
  const runLanAutoDiscovery = useCallback(async (showFeedback = true) => {
    if (isDiscovering) return null;
    setIsDiscovering(true);
    if (showFeedback) {
      showToast?.('🔍 جاري فحص واستكشاف خوادم الواتساب المتاحة في الصيدلية...');
    }

    // إذا كنا داخل تطبيق الويندوز، نقرأ عناوين كارت الشبكة مباشرة
    if (typeof window !== 'undefined' && window.desktopAPI?.getNetworkInfo) {
      try {
        const net = await window.desktopAPI.getNetworkInfo();
        if (net && net.localIps?.length > 0) {
          setNetworkInfo(net);
        }
      } catch {}
    }

    const candidateUrls = [];
    const addCandidate = (url) => {
      if (!url || typeof url !== 'string') return;
      const clean = url.trim().replace(/\/+$/, '');
      if (clean && !clean.includes('apexthunder.com') && !candidateUrls.includes(clean)) {
        candidateUrls.push(clean);
      }
    };

    // في بيئة الويندوز: أولوية قصوى للـ Loopback المحلي الداخلي 127.0.0.1
    if (isDesktop) {
      addCandidate('http://127.0.0.1:3100');
      addCandidate('http://localhost:3100');
    }

    // 1. رابط LAN المعلن من تطبيق الويندوز في إعدادات المنظومة (المفضل فوراً لمتصفح الويب والموبايل)
    if (state?.orgSettings?.waServerLanUrl) {
      addCandidate(state.orgSettings.waServerLanUrl);
    }

    // 2. عناوين IP المحفوظة في قاعدة البيانات (مثل http://192.168.1.2:3100)
    const savedIps = state?.orgSettings?.waServerLanIps;
    if (Array.isArray(savedIps)) {
      savedIps.forEach(ipItem => {
        const ipAddr = typeof ipItem === 'string' ? ipItem : ipItem?.address;
        if (ipAddr) {
          addCandidate(ipAddr.startsWith('http') ? ipAddr : `http://${ipAddr}:3100`);
        }
      });
    }

    // 3. رابط مخصص مثبت يدوياً على هذا المتصفح/الجهاز
    if (deviceServerUrl) {
      addCandidate(deviceServerUrl);
    }

    // 4. الرابط المقترح من كروت الشبكة
    if (networkInfo?.suggestedLanUrl) {
      addCandidate(networkInfo.suggestedLanUrl);
    }
    if (networkInfo?.localIps) {
      networkInfo.localIps.forEach(net => {
        if (net?.address) addCandidate(`http://${net.address}:3100`);
      });
    }

    // 5. إذا كان المتصفح يعمل مباشرة على IP الصيدلية المحلي
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (isPrivateLanIp(host) && host !== 'localhost' && host !== '127.0.0.1') {
        addCandidate(`http://${host}:3100`);
      }
    }

    // 6. الرابط المعمم في إعدادات المنظومة
    if (state?.orgSettings?.waServerUrl) {
      addCandidate(state.orgSettings.waServerUrl);
    }

    // 7. عناوين الـ IP الشائعة لراوترات الصيدليات للربط المباشر
    ['192.168.1.2', '192.168.1.10', '192.168.1.15', '192.168.1.100', '192.168.0.100', '192.168.1.5', '192.168.1.20'].forEach(ip => {
      addCandidate(`http://${ip}:3100`);
    });

    // 8. في الويب: فحص 127.0.0.1 كاحتمال أخير
    if (!isDesktop) {
      addCandidate('http://127.0.0.1:3100');
      addCandidate('http://localhost:3100');
    }

    // دالة فحص اتصال سريعة
    const probeServer = async (cleanUrl) => {
      const res = await fetch(`${cleanUrl}/health`, {
        signal: AbortSignal.timeout(1800)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.status === 'ok' || data.success || data.server)) {
          return cleanUrl;
        }
      }
      throw new Error('Unreachable');
    };

    let foundUrl = null;

    // فحص متزامن وسريع لكافة العناوين المرشحة لاكتشاف السيرفر فوراً في ميلي ثانية
    try {
      foundUrl = await Promise.any(candidateUrls.map(u => probeServer(u)));
    } catch {
      foundUrl = null;
    }

    setIsDiscovering(false);

    if (foundUrl) {
      setDeviceServerUrl(foundUrl);
      try {
        localStorage.setItem('PHARMACY_DEVICE_WA_URL', foundUrl);
      } catch {}
      setCustomServerUrl(foundUrl);
      if (showFeedback) {
        showToast?.(`🟢 تم اكتشاف وربط خادم الواتساب بنجاح: ${foundUrl}`);
      }
      fetchWaStatus(true, foundUrl);
      return foundUrl;
    } else {
      if (showFeedback) {
        showToast?.('⚠️ لم يتم العثور على خادم نشط تلقائياً. تأكد من تشغيل الخادم على جهاز الصيدلية الرئيسي.');
      }
      return null;
    }
  }, [isDiscovering, deviceServerUrl, isDesktop, state?.orgSettings?.waServerUrl, state?.orgSettings?.waServerLanUrl, state?.orgSettings?.waServerLanIps, networkInfo, isPrivateLanIp, showToast, fetchWaStatus]);

  // 5. الإرسال المباشر واليدوي عبر WhatsApp Web (Fallback الذكي عند عدم توفر السيرفر)
  const handleDirectWhatsAppWeb = useCallback((emp, customText = '') => {
    const waPhone = getEmpWhatsAppPhone(emp);
    if (!waPhone || waPhone.length < 10) {
      showToast?.('❌ لا يوجد رقم هاتف صالح مسجل لهذا الموظف.');
      return;
    }

    let cleanPhone = waPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '2' + cleanPhone; // كود مصر
    }

    const branchObj = branches.find(b => b.id === emp.branchId);
    const summary = getEmpSummaryData(emp.id);
    const msgText = customText || (selectedTemplate
      ? populateWhatsAppTemplate(selectedTemplate.text, emp, summary, orgSettings, monthLabel, branchObj?.name)
      : editableMessage);

    // إذا كان خيار الـ PDF مفعل، نفتح نافذة الطباعة لتنزيل الكشف كـ PDF
    if (attachPdfPayslip && selectedTemplate?.supportsPdf) {
      try {
        const html = generatePayslipPrintHtml(emp, summary, orgSettings, monthLabel, branchObj?.name);
        const printWin = window.open('', '_blank', 'width=850,height=900');
        if (printWin) {
          printWin.document.write(html);
          printWin.document.close();
          setTimeout(() => {
            try {
              printWin.focus();
              printWin.print();
            } catch {}
          }, 400);
        }
      } catch {}
    }

    const waWebUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msgText)}`;
    window.open(waWebUrl, '_blank');
    showToast?.(`📲 تم فتح محادثة ${getEmpDisplayName(emp)} على WhatsApp Web بنجاح!`);
  }, [branches, getEmpSummaryData, selectedTemplate, orgSettings, monthLabel, editableMessage, attachPdfPayslip, showToast]);

  // جلب فوري لعناوين كروت الشبكة من نظام التشغيل عند فتح الموديل في تطبيق الويندوز
  useEffect(() => {
    if (typeof window !== 'undefined' && window.desktopAPI?.getNetworkInfo) {
      window.desktopAPI.getNetworkInfo().then(info => {
        if (info && info.localIps?.length > 0) {
          setNetworkInfo(info);
        }
      }).catch(() => {});
    }

    if (typeof window !== 'undefined' && window.desktopAPI?.onWhatsAppNetworkInfo) {
      window.desktopAPI.onWhatsAppNetworkInfo(info => {
        if (info && info.localIps?.length > 0) {
          setNetworkInfo(info);
        }
      });
    }
  }, []);

  // في متصفح الويب: استكشاف تلقائي لخادم الصيدلية على الشبكة المحلية في الخلفية فور التحميل
  useEffect(() => {
    if (!isDesktop && !deviceServerUrl) {
      const timer = setTimeout(() => {
        runLanAutoDiscovery(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isDesktop, deviceServerUrl, runLanAutoDiscovery]);

  // فحص دوري
  useEffect(() => {
    fetchWaStatus(true);
    const interval = setInterval(() => {
      fetchWaStatus(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchWaStatus]);

  // إعادة تشغيل خادم الواتساب
  const handleRestartServer = async () => {
    setIsRestarting(true);
    showToast?.('⚡ جاري إعادة تشغيل وتحديث خادم الواتساب في الخلفية...');
    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.restartWhatsAppServer) {
        const res = await window.desktopAPI.restartWhatsAppServer();
        showToast?.(res?.message || 'تمت إعادة تشغيل الخادم بنجاح');
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/restart`, {
          method: 'POST',
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(3000)
        });
        showToast?.('تم إرسال أمر إعادة تشغيل الخادم بنجاح');
      }
    } catch (err) {
      console.warn('Restart trigger warning:', err);
    }

    setTimeout(async () => {
      await fetchWaStatus(true);
      setIsRestarting(false);
    }, 2500);
  };

  // تصفير جلسة الواتساب وتوليد رمز QR جديد فوراً بنقرة واحدة
  const handleForceResetServer = async () => {
    let isConfirmed = false;
    if (showConfirm) {
      isConfirmed = await showConfirm({
        title: 'تصفير جلسة الواتساب وتوليد رمز اقتران جديد',
        message: 'هل أنت متأكد من رغبتك في تصفير مفاتيح الجلسة وإعادة توليد رمز QR جديد فوراً؟\n\nيُستخدم هذا الزر في حال حدوث أي تعليق في الاتصال أو الرغبة في الاقتران من جديد.',
        confirmText: 'نعم، تصفير الجلسة وتوليد QR',
        cancelText: 'إلغاء',
        type: 'danger',
        icon: '⚡'
      });
    } else {
      isConfirmed = window.confirm('هل أنت متأكد من رغبتك في تصفير مفاتيح الجلسة وإعادة توليد رمز QR جديد فوراً؟');
    }
    if (!isConfirmed) return;

    setIsRestarting(true);
    showToast?.('⚡ جاري تصفير الجلسة وتوليد رمز اقتران جديد في الخلفية...');
    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.forceResetWhatsAppServer) {
        const res = await window.desktopAPI.forceResetWhatsAppServer();
        showToast?.(res?.message || 'تم تصفير الجلسة بنجاح');
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/force-reset`, {
          method: 'POST',
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(4000)
        });
        showToast?.('تم إرسال أمر التصفير وإعادة التوليد بنجاح');
      }
      setWaStatus('CONNECTING');
      setWaPhone('');
      setWaLiveQr('');
    } catch (err) {
      console.warn('Force reset error:', err);
    }

    setTimeout(async () => {
      await fetchWaStatus(true);
      setIsRestarting(false);
    }, 1800);
  };

  // تغيير رقم الواتساب المقترن وفك الارتباط لتوليد رمز QR جديد
  const handleChangeConnectedNumber = async () => {
    const currentPhoneDisplay = waPhone ? `(+${waPhone})` : '';
    let isConfirmed = false;
    if (showConfirm) {
      isConfirmed = await showConfirm({
        title: 'تغيير رقم الواتساب المقترن',
        message: `هل أنت متأكد من رغبتك في تغيير رقم الواتساب المقترن ${currentPhoneDisplay}؟\n\nسيتم إلغاء اقتران الهاتف الحالي وتوليد رمز QR جديد لربط الهاتف الجديد فوراً.`,
        confirmText: 'نعم، فك الارتباط وتغيير الرقم',
        cancelText: 'إلغاء وتراجع',
        type: 'danger',
        icon: '📱'
      });
    } else {
      isConfirmed = window.confirm(
        `هل أنت متأكد من رغبتك في تغيير رقم الواتساب المقترن ${currentPhoneDisplay}؟\n\n` +
        `سيتم إلغاء اقتران الهاتف الحالي وتوليد رمز QR جديد لربط الهاتف الجديد فوراً.`
      );
    }
    if (!isConfirmed) return;

    setIsChangingNumber(true);
    showToast?.('⏳ جاري تسجيل الخروج وفك ارتباط الرقم الحالي...');

    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.logoutWhatsAppServer) {
        await window.desktopAPI.logoutWhatsAppServer();
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/logout`, {
          method: 'POST',
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(4000)
        });
      }

      setWaStatus('DISCONNECTED');
      setWaPhone('');
      setWaLiveQr('');
      showToast?.('🔄 تم فك الارتباط بنجاح، جاري توليد وتجهيز رمز الـ QR الجديد...');
    } catch (err) {
      console.warn('Logout WhatsApp error:', err);
      showToast?.('⚠️ حدث خطأ أثناء فك الارتباط، جاري التحقق من الخادم...');
    }

    // استطلاع دوري وسريع للحصول على رمز الـ QR الجديد
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/status`, {
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status || 'DISCONNECTED');
          setWaPhone(data.phone || '');
          setWaLiveQr(data.qrCodeDataUrl || '');

          if (data.status === 'QR_READY' && data.qrCodeDataUrl) {
            clearInterval(pollInterval);
            setIsChangingNumber(false);
            showToast?.('✨ رمز الـ QR الجديد جاهز الآن! امسح الرمز من هاتفك الجديد.');
            return;
          } else if (data.status === 'CONNECTED') {
            clearInterval(pollInterval);
            setIsChangingNumber(false);
            return;
          }
        }
      } catch {}

      if (attempts >= 12) {
        clearInterval(pollInterval);
        setIsChangingNumber(false);
        fetchWaStatus(true);
      }
    }, 1500);
  };

  // ── تحميل اسكربت تشغيل خادم الواتساب احتياطياً (واجهة رسومية عربية بالكامل native GUI) ──
  const handleDownloadBackupScript = useCallback(async () => {
    try {
      let scriptContent = '';
      try {
        const res = await fetch('/scripts/تشغيل_خادم_الواتساب_احتياطي.bat');
        if (res.ok) {
          scriptContent = await res.text();
        }
      } catch {}

      if (!scriptContent || !scriptContent.includes('System.Windows.Forms')) {
        scriptContent = [
          '@set "SCRIPT_DIR=%~dp0"',
          '@findstr /v "^@set ^@findstr ^@exit" "%~f0" | powershell.exe -NoProfile -ExecutionPolicy Bypass -Command -',
          '@exit /b',
          '[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
          'Add-Type -AssemblyName System.Windows.Forms',
          'Add-Type -AssemblyName System.Drawing',
          '[System.Windows.Forms.Application]::EnableVisualStyles()',
          '',
          '$Form = New-Object System.Windows.Forms.Form',
          '$Form.Text = "منظومة الموارد البشرية - أداة تشغيل خادم الواتساب الاحتياطي"',
          '$Form.Size = New-Object System.Drawing.Size(560, 480)',
          '$Form.StartPosition = "CenterScreen"',
          '$Form.FormBorderStyle = "FixedDialog"',
          '$Form.MaximizeBox = $false',
          '$Form.RightToLeft = [System.Windows.Forms.RightToLeft]::Yes',
          '$Form.RightToLeftLayout = $true',
          '$Form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)',
          '$Form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Regular)',
          '',
          '$Header = New-Object System.Windows.Forms.Label',
          '$Header.Text = "منظومة إدارة الموارد البشرية والرواتب"',
          '$Header.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)',
          '$Header.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)',
          '$Header.Location = New-Object System.Drawing.Point(20, 16)',
          '$Header.Size = New-Object System.Drawing.Size(500, 30)',
          '$Form.Controls.Add($Header)',
          '',
          '$SubHeader = New-Object System.Windows.Forms.Label',
          '$SubHeader.Text = "أداة تشغيل خادم الواتساب الاحتياطي لربط الهواتف والمتصفحات 24/7"',
          '$SubHeader.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)',
          '$SubHeader.Location = New-Object System.Drawing.Point(20, 46)',
          '$SubHeader.Size = New-Object System.Drawing.Size(500, 24)',
          '$Form.Controls.Add($SubHeader)',
          '',
          '$StatusPanel = New-Object System.Windows.Forms.Panel',
          '$StatusPanel.Location = New-Object System.Drawing.Point(20, 76)',
          '$StatusPanel.Size = New-Object System.Drawing.Size(500, 48)',
          '$StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)',
          '$StatusPanel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle',
          '$Form.Controls.Add($StatusPanel)',
          '',
          '$StatusLabel = New-Object System.Windows.Forms.Label',
          '$StatusLabel.Text = "⏳ جاري فحص حالة خادم الواتساب..."',
          '$StatusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)',
          '$StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)',
          '$StatusLabel.Location = New-Object System.Drawing.Point(10, 12)',
          '$StatusLabel.Size = New-Object System.Drawing.Size(480, 24)',
          '$StatusPanel.Controls.Add($StatusLabel)',
          '',
          '$NetGroup = New-Object System.Windows.Forms.GroupBox',
          '$NetGroup.Text = "📱 روابط اتصال الهواتف والشبكة المحلية (LAN)"',
          '$NetGroup.Location = New-Object System.Drawing.Point(20, 136)',
          '$NetGroup.Size = New-Object System.Drawing.Size(500, 140)',
          '$NetGroup.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)',
          '$Form.Controls.Add($NetGroup)',
          '',
          '$NetText = New-Object System.Windows.Forms.TextBox',
          '$NetText.Multiline = $true',
          '$NetText.ReadOnly = $true',
          '$NetText.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical',
          '$NetText.Location = New-Object System.Drawing.Point(15, 25)',
          '$NetText.Size = New-Object System.Drawing.Size(470, 68)',
          '$NetText.Font = New-Object System.Drawing.Font("Consolas", 10, [System.Drawing.FontStyle]::Bold)',
          '$NetText.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)',
          '$NetText.ForeColor = [System.Drawing.Color]::FromArgb(3, 105, 161)',
          '$NetGroup.Controls.Add($NetText)',
          '',
          '$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike \'127.*\' -and $_.IPAddress -notlike \'169.254.*\' }',
          '$ipList = @()',
          'foreach ($ip in $ips) { $ipList += "http://$($ip.IPAddress):3100" }',
          'if ($ipList.Count -eq 0) { $ipList += "http://127.0.0.1:3100" }',
          '$NetText.Text = ($ipList -join "`r`n")',
          '',
          '$BtnCopy = New-Object System.Windows.Forms.Button',
          '$BtnCopy.Text = "📋 نسخ أول رابط للهاتف"',
          '$BtnCopy.Location = New-Object System.Drawing.Point(15, 100)',
          '$BtnCopy.Size = New-Object System.Drawing.Size(180, 28)',
          '$BtnCopy.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)',
          '$BtnCopy.BackColor = [System.Drawing.Color]::FromArgb(224, 231, 255)',
          '$BtnCopy.ForeColor = [System.Drawing.Color]::FromArgb(67, 56, 202)',
          '$BtnCopy.Add_Click({',
          '    [System.Windows.Forms.Clipboard]::SetText($ipList[0])',
          '    [System.Windows.Forms.MessageBox]::Show("تم نسخ الرابط بنجاح: " + $ipList[0], "نسخ الرابط", "OK", "Information")',
          '})',
          '$NetGroup.Controls.Add($BtnCopy)',
          '',
          '$BtnStart = New-Object System.Windows.Forms.Button',
          '$BtnStart.Text = "⚡ تشغيل الخادم"',
          '$BtnStart.Location = New-Object System.Drawing.Point(370, 290)',
          '$BtnStart.Size = New-Object System.Drawing.Size(150, 40)',
          '$BtnStart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)',
          '$BtnStart.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)',
          '$BtnStart.ForeColor = [System.Drawing.Color]::White',
          '',
          '$BtnFirewall = New-Object System.Windows.Forms.Button',
          '$BtnFirewall.Text = "🛡️ فتح جدار الحماية"',
          '$BtnFirewall.Location = New-Object System.Drawing.Point(210, 290)',
          '$BtnFirewall.Size = New-Object System.Drawing.Size(150, 40)',
          '$BtnFirewall.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)',
          '$BtnFirewall.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)',
          '$BtnFirewall.ForeColor = [System.Drawing.Color]::White',
          '',
          '$BtnStop = New-Object System.Windows.Forms.Button',
          '$BtnStop.Text = "⏹️ إيقاف الخادم"',
          '$BtnStop.Location = New-Object System.Drawing.Point(20, 290)',
          '$BtnStop.Size = New-Object System.Drawing.Size(180, 40)',
          '$BtnStop.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)',
          '$BtnStop.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)',
          '$BtnStop.ForeColor = [System.Drawing.Color]::White',
          '',
          '$Form.Controls.Add($BtnStart)',
          '$Form.Controls.Add($BtnFirewall)',
          '$Form.Controls.Add($BtnStop)',
          '',
          '$BtnClose = New-Object System.Windows.Forms.Button',
          '$BtnClose.Text = "✕ إغلاق النافذة"',
          '$BtnClose.Location = New-Object System.Drawing.Point(20, 345)',
          '$BtnClose.Size = New-Object System.Drawing.Size(500, 36)',
          '$BtnClose.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)',
          '$BtnClose.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)',
          '$BtnClose.Add_Click({ $Form.Close() })',
          '$Form.Controls.Add($BtnClose)',
          '',
          'function Check-Health {',
          '    try {',
          '        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:3100/health")',
          '        $req.Timeout = 1200',
          '        $res = $req.GetResponse()',
          '        if ($res.StatusCode -eq "OK") {',
          '            $StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(209, 250, 229)',
          '            $StatusLabel.Text = "🟢 خادم الواتساب متصل ويعمل بنجاح (المنفذ 3100)"',
          '            $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(4, 120, 87)',
          '        }',
          '        $res.Close()',
          '    } catch {',
          '        $StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(254, 226, 226)',
          '        $StatusLabel.Text = "🔴 خادم الواتساب متوقف حالياً"',
          '        $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)',
          '    }',
          '}',
          '',
          'function Start-WaServer {',
          '    Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }',
          '    $baseDir = $env:SCRIPT_DIR',
          '    $candidates = @(',
          '        "$baseDir\\server\\whatsapp-server.js",',
          '        "$baseDir\\whatsapp-server.js",',
          '        "$baseDir\\..\\server\\whatsapp-server.js",',
          '        "d:\\Project\\HR last\\HR New\\server\\whatsapp-server.js",',
          '        "$env:ProgramFiles\\منظومة الموارد البشرية\\resources\\app.asar.unpacked\\server\\whatsapp-server.js",',
          '        "$env:LOCALAPPDATA\\Programs\\منظومة الموارد البشرية\\resources\\app.asar.unpacked\\server\\whatsapp-server.js"',
          '    )',
          '    $serverJs = $null',
          '    foreach ($c in $candidates) {',
          '        if ($c -and (Test-Path $c)) { $serverJs = $c; break }',
          '    }',
          '    if (-not $serverJs) {',
          '        foreach ($drive in @("C:", "D:", "E:", "F:")) {',
          '            $p = "$drive\\Project\\HR last\\HR New\\server\\whatsapp-server.js"',
          '            if (Test-Path $p) { $serverJs = $p; break }',
          '        }',
          '    }',
          '    $nodeExe = "node"',
          '    if (Test-Path "C:\\Program Files\\nodejs\\node.exe") {',
          '        $nodeExe = "C:\\Program Files\\nodejs\\node.exe"',
          '    } elseif (Test-Path "C:\\Program Files (x86)\\nodejs\\node.exe") {',
          '        $nodeExe = "C:\\Program Files (x86)\\nodejs\\node.exe"',
          '    } elseif (Test-Path "$env:LOCALAPPDATA\\Programs\\node\\node.exe") {',
          '        $nodeExe = "$env:LOCALAPPDATA\\Programs\\node\\node.exe"',
          '    } elseif (Test-Path "$env:ProgramFiles\\منظومة الموارد البشرية\\منظومة الموارد البشرية.exe") {',
          '        $nodeExe = "$env:ProgramFiles\\منظومة الموارد البشرية\\منظومة الموارد البشرية.exe"',
          '        $env:ELECTRON_RUN_AS_NODE = "1"',
          '    } elseif (Test-Path "$env:LOCALAPPDATA\\Programs\\منظومة الموارد البشرية\\منظومة الموارد البشرية.exe") {',
          '        $nodeExe = "$env:LOCALAPPDATA\\Programs\\منظومة الموارد البشرية\\منظومة الموارد البشرية.exe"',
          '        $env:ELECTRON_RUN_AS_NODE = "1"',
          '    }',
          '    if ($serverJs) {',
          '        $appDir = Split-Path (Split-Path $serverJs)',
          '        Start-Process -FilePath $nodeExe -ArgumentList "`"$serverJs`"" -WorkingDirectory $appDir -WindowStyle Hidden',
          '        Start-Sleep -Seconds 2',
          '        Check-Health',
          '    } else {',
          '        [System.Windows.Forms.MessageBox]::Show("تعذر العثور على ملف whatsapp-server.js تلقائياً على هذا الجهاز.", "تنبيه", "OK", "Warning")',
          '    }',
          '}',
          '',
          '$Timer = New-Object System.Windows.Forms.Timer',
          '$Timer.Interval = 3000',
          '$Timer.Add_Tick({ Check-Health })',
          '$Timer.Start()',
          '',
          '$BtnFirewall.Add_Click({',
          '    try {',
          '        Start-Process powershell -ArgumentList "-NoProfile -Command `"netsh advfirewall firewall delete rule name=\'WhatsApp_Server_3100\'; netsh advfirewall firewall add rule name=\'WhatsApp_Server_3100\' dir=in action=allow protocol=TCP localport=3100 profile=any description=\'Allow incoming WhatsApp Gateway connections on port 3100\'`"" -Verb RunAs -Wait',
          '        [System.Windows.Forms.MessageBox]::Show("تم السماح للمنفذ 3100 في جدار الحماية بنجاح! 🛡️", "جدار الحماية", "OK", "Information")',
          '    } catch {',
          '        [System.Windows.Forms.MessageBox]::Show("تعذر تعديل جدار الحماية أو تم رفض طلب الصلاحيات.", "تنبيه", "OK", "Warning")',
          '    }',
          '})',
          '',
          '$BtnStop.Add_Click({',
          '    Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }',
          '    Start-Sleep -Milliseconds 600',
          '    Check-Health',
          '})',
          '',
          '$BtnStart.Add_Click({ Start-WaServer })',
          '',
          'Check-Health',
          'try {',
          '    $initialCheck = [System.Net.WebRequest]::Create("http://127.0.0.1:3100/health")',
          '    $initialCheck.Timeout = 1000',
          '    $res = $initialCheck.GetResponse()',
          '    $res.Close()',
          '} catch {',
          '    Start-WaServer',
          '}',
          '',
          '$Form.Add_Shown({ Check-Health })',
          '$Form.ShowDialog() | Out-Null'
        ].join('\r\n');
      }

      const blob = new Blob([scriptContent], { type: 'application/x-bat;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'تشغيل_خادم_الواتساب_احتياطي.bat';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      showToast?.('📥 تم تنزيل أداة تشغيل خادم الواتساب الاحتياطية بنجاح!');
    } catch (e) {
      showToast?.('تعذر التنزيل: ' + (e?.message || 'خطأ غير معروف'));
    }
  }, [showToast]);

  // توليد PDF Base64 لموظف معين سواء عبر تطبيق الديسكتوب أو خادم الواتساب المحلي
  const generateEmpPdfBase64 = async (emp, summary, htmlInput) => {
    if (!attachPdfPayslip) return null;

    const branchObj = branches.find(b => b.id === emp.branchId);
    const html = htmlInput || generatePayslipPrintHtml(emp, summary, orgSettings, monthLabel, branchObj?.name);

    // 1. أولوية استخدام Electron IPC في تطبيق سطح المكتب
    if (typeof window !== 'undefined' && window.desktopAPI?.generatePdfBase64) {
      try {
        const res = await window.desktopAPI.generatePdfBase64(html);
        if (res?.success && res.pdfBase64) {
          return res.pdfBase64;
        }
      } catch (err) {
        console.warn('Desktop PDF generation error for emp:', emp.name, err);
      }
    }

    // 2. التحويل السريع عبر خادم الواتساب المحلي المتاح على النظام (للمتصفح والديسكتوب)
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/render-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({ html })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.pdfBase64) {
          return data.pdfBase64;
        }
      }
    } catch {}

    return null;
  };

  // بدء عملية الإرسال
  const handleSendBroadcast = async (e) => {
    e.preventDefault();

    if (waStatus !== 'CONNECTED') {
      showToast?.('⚠️ خادم الواتساب غير مقترن بالهاتف حالياً. يرجى مسح رمز الـ QR أدناه أولاً لربط واتساب.');
      return;
    }

    const targetList = targetEmpId
      ? filteredEmployees.filter(emp => emp.id === targetEmpId)
      : filteredEmployees;

    const validRecipients = targetList.filter(emp => {
      const waNum = getEmpWhatsAppPhone(emp);
      return waNum && waNum.length >= 10;
    });

    if (validRecipients.length === 0) {
      showToast?.('❌ لا يوجد موظفون محددون يمتلكون أرقام هواتف صالحة مسجلة للواتساب.');
      return;
    }

    setIsSending(true);
    setSendProgressText(`جاري تحضير وتجهيز ملفات ورسائل ${validRecipients.length} موظف...`);

    try {
      const messagesPayload = [];

      for (let i = 0; i < validRecipients.length; i++) {
        const emp = validRecipients[i];
        const branchObj = branches.find(b => b.id === emp.branchId);
        const summary = getEmpSummaryData(emp.id);

        // تخصيص نص الرسالة لكل موظف إذا كان قالباً، أو استخدام النص المكتوب
        let msgBody = editableMessage;
        if (selectedTemplate) {
          msgBody = populateWhatsAppTemplate(
            selectedTemplate.text,
            emp,
            summary,
            orgSettings,
            monthLabel,
            branchObj?.name
          );
        }

        // إنشاء ملف الـ PDF المشفر إذا كان خيار الـ PDF مفعل
        let pdfBase64 = null;
        let pdfHtml = null;
        if (attachPdfPayslip && selectedTemplate?.supportsPdf) {
          pdfHtml = generatePayslipPrintHtml(
            emp,
            summary,
            orgSettings,
            monthLabel,
            branchObj?.name
          );

          setSendProgressText(`توليد كشف PDF معتمد (${i + 1}/${validRecipients.length}): ${getEmpDisplayName(emp)}...`);
          pdfBase64 = await generateEmpPdfBase64(emp, summary, pdfHtml);
        }

        // استخدام رقم الواتساب المخصص للموظف أو أول رقم صالح في قائمة الأرقام
        const empWaPhone = getEmpWhatsAppPhone(emp);
        messagesPayload.push({
          phone: empWaPhone,
          message: msgBody,
          empName: getEmpDisplayName(emp),
          pdfBase64,
          pdfHtml,
          fileName: `كشف_مرتب_${getEmpDisplayName(emp).replace(/\s+/g, '_')}_${activeMonth}.pdf`
        });
      }

      setSendProgressText('جاري تمرير الحزمة لخادم الواتساب للإرسال الآمن...');

      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({ messages: messagesPayload })
      });

      if (res.ok) {
        const data = await res.json();
        showToast?.(`🚀 ${data.message || `بدأ إرسال ${messagesPayload.length} رسالة بنجاح عبر الواتساب!`}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast?.(`❌ فشل بدء الإرسال: ${errData.error || 'خطأ في استجابة السيرفر'}`);
      }
    } catch (err) {
      console.error('Send broadcast error:', err);
      showToast?.('❌ تعذر إتمام الإرسال، تأكد من تشغيل خادم الواتساب.');
    } finally {
      setIsSending(false);
      setSendProgressText('');
    }
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* ── الرأس التعريفي ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '22px', fontWeight: 800 }}>
            💬 مركز مراسلات الواتساب الذكي (WhatsApp Center)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
            كشوفات المرتبات التفصيلية مع ملف PDF معتمد، رسائل التهنئة، وإشعارات الدوام التلقائية على مدار 24 ساعة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* زر الاستكشاف التلقائي لشبكة الصيدلية */}
          <button
            type="button"
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 700,
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid #10b981',
              background: '#ecfdf5',
              color: '#065f46',
              cursor: isDiscovering ? 'wait' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => runLanAutoDiscovery(true)}
            disabled={isDiscovering}
            title="فحص واكتشاف خوادم الواتساب المتاحة في شبكة الصيدلية تلقائياً والربط معها فوراً"
          >
            <RefreshCw style={{ width: '14px', height: '14px' }} className={isDiscovering ? 'animate-spin' : ''} />
            <span>{isDiscovering ? 'جاري الفحص...' : '🔍 استكشاف تلقائي للشبكة'}</span>
          </button>

          {/* زر إعدادات ربط الأجهزة والموبايلات */}
          <button
            type="button"
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 700,
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: showNetworkModal ? '#2563eb' : 'var(--surface)',
              color: showNetworkModal ? '#fff' : 'var(--text)',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
              transition: 'all 0.2s ease'
            }}
            onClick={() => setShowNetworkModal(!showNetworkModal)}
          >
            <Network style={{ width: '16px', height: '16px', color: showNetworkModal ? '#fff' : '#2563eb' }} />
            <span>🌐 ربط الأجهزة والموبايلات (IP الشبكة)</span>
          </button>
        </div>
      </div>

      {/* ── بطاقة تفعيل وتعميم خدمة الواتساب للهواتف المحمولة (Mobile LAN Gateway) ── */}
      <div style={{
        background: isLanActive
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)'
          : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(37, 99, 235, 0.03) 100%)',
        border: `1.5px solid ${isLanActive ? '#10b981' : '#3b82f6'}`,
        borderRadius: '14px',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: isLanActive ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: isLanActive ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(59, 130, 246, 0.3)'
          }}>
            <Smartphone style={{ width: '22px', height: '22px' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--text)' }}>
                بوابة تشغيل الواتساب على الهواتف والموبايلات (IP الشبكة)
              </h4>
              {isLanActive ? (
                <span style={{ fontSize: '11.5px', background: '#d1fae5', color: '#065f46', padding: '3px 9px', borderRadius: '6px', fontWeight: 800 }}>
                  🟢 مفعل ومعمم للهواتف بالصيدلية
                </span>
              ) : (
                <span style={{ fontSize: '11.5px', background: '#fef3c7', color: '#92400e', padding: '3px 9px', borderRadius: '6px', fontWeight: 800 }}>
                  🟡 بحاجة للتفعيل لربط الموبايلات
                </span>
              )}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>عنوان الخادم المخصص للهواتف:</span>
              <code style={{ background: 'rgba(37, 99, 235, 0.08)', color: '#1d4ed8', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, direction: 'ltr', fontSize: '13px' }}>
                {primaryLanUrl}
              </code>
              <span style={{ opacity: 0.8 }}>(يتصل به أي موبايل أو جهاز على نفس راوتر الصيدلية)</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            style={{
              background: isLanActive ? '#059669' : '#2563eb',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '13px',
              padding: '8px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer'
            }}
            onClick={handleActivateMobileIp}
            title="تثبيت وتعميم هذا الـ IP لكي تتعرف عليه جميع الهواتف تلقائياً بدون كتابة"
          >
            <Wifi style={{ width: '15px', height: '15px' }} />
            <span>{isLanActive ? '⚡ تحديث وتعميم IP الهواتف' : '⚡ تفعيل وتعميم هذا الـ IP للهواتف الآن'}</span>
          </button>

          <button
            type="button"
            className="btn"
            style={{
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => {
              navigator.clipboard?.writeText(primaryLanUrl);
              showToast?.(`📋 تم نسخ رابط الهواتف: ${primaryLanUrl}`);
            }}
            title="نسخ رابط الخادم المخصص للهواتف"
          >
            <Copy style={{ width: '13px', height: '13px' }} />
            <span>نسخ الرابط</span>
          </button>

          <button
            type="button"
            className="btn"
            style={{
              background: '#8b5cf6',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)'
            }}
            onClick={handleOpenMobileQr}
            title="إظهار باركود QR لمسحه بكاميرا الهاتف والاتصال مباشرة"
          >
            <QrCode style={{ width: '14px', height: '14px' }} />
            <span>📱 باركود الموبايل</span>
          </button>

          <button
            type="button"
            className="btn"
            style={{
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '12.5px',
              padding: '8px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
              cursor: 'pointer'
            }}
            onClick={handleDownloadBackupScript}
            title="تنزيل أداة تشغيل خادم الواتساب احتياطياً لتشغيله بنقرة واحدة على أي جهاز لا يتوفر به تطبيق الويندوز"
          >
            <Download style={{ width: '14px', height: '14px' }} />
            <span>📥 تنزيل أداة تشغيل السيرفر (احتياطي)</span>
          </button>
        </div>
      </div>

      {/* مودال باركود الربط المباشر للهواتف */}
      {showMobileQrModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }} onClick={() => setShowMobileQrModal(false)}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid var(--border)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              📱 مسح كود الاتصال بالهاتف
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted)' }}>
              افتح كاميرا الهاتف أو قارئ الباركود وامسح الرمز لفتح المنظومة وربط خادم الواتساب فوراً
            </p>
            {mobileQrDataUrl && (
              <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                <img src={mobileQrDataUrl} alt="Mobile Connect QR" style={{ width: '220px', height: '220px', display: 'block' }} />
              </div>
            )}
            <div style={{ fontSize: '12.5px', color: 'var(--muted)', wordBreak: 'break-all', direction: 'ltr', background: 'var(--bg)', padding: '8px 12px', borderRadius: '8px', marginBottom: '16px' }}>
              <code>{primaryLanUrl}</code>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 800, borderRadius: '8px' }}
              onClick={() => setShowMobileQrModal(false)}
            >
              تم، إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ── لوحة معلومات وإعدادات ربط الأجهزة والموبايلات ──────────────────────── */}
      {showNetworkModal && (
        <div style={{
          background: 'var(--surface)',
          border: '1.5px solid #3b82f6',
          borderRadius: '14px',
          padding: '18px 20px',
          marginBottom: '22px',
          boxShadow: '0 8px 24px rgba(59, 130, 246, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe style={{ width: '18px', height: '18px' }} />
                إعدادات الربط وعناوين خادم الواتساب للأجهزة الأخرى
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                لكي تتمكن الهواتف والأجهزة الأخرى داخل الصيدلية من الاتصال بسيرفر الواتساب دون حظر
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '12.5px', padding: '4px 10px' }}
              onClick={() => setShowNetworkModal(false)}
            >
              ✕ إغلاق
            </button>
          </div>

          {/* تنبيه أمني ذكي للمتصفحات عند العمل على HTTPS */}
          {typeof window !== 'undefined' && window.location?.protocol === 'https:' && waStatus === 'DISCONNECTED' && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '14px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <span style={{ color: '#1e40af' }}>
                💡 <strong>ملاحظة أمنية للمتصفح:</strong> قد تمنع متصفحات Chrome/Edge الاتصال المباشر بخادم الواتساب المحلي من موقع HTTPS. يمكنك فتح المنظومة عبر رابط HTTP المباشر للاتصال بدون حظر أمني:
              </span>
              <a
                href="http://nodejs-test.apexthunder.com"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ background: '#2563eb', color: '#fff', fontSize: '11.5px', padding: '4px 10px', borderRadius: '6px', textDecoration: 'none' }}
              >
                🌐 التبديل لرابط HTTP المباشر
              </a>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {/* بطاقة الرابط النشط حالياً */}
            <div style={{ background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '12px 14px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>
                  الرابط النشط حالياً على هذا الجهاز:
                </span>
                {isDesktop ? (
                  <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '3px 9px', borderRadius: '6px', fontWeight: 800 }}>
                    🖥️ تطبيق الويندوز (اتصال محلي داخلي 127.0.0.1)
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '3px 9px', borderRadius: '6px', fontWeight: 800 }}>
                    🌐 متصفح الويب (عبر شبكة الصيدلية LAN)
                  </span>
                )}
              </div>
              <code style={{ fontSize: '14px', fontWeight: 800, color: '#1e40af', direction: 'ltr', display: 'inline-block' }}>
                {serverUrl}
              </code>
            </div>

            {/* بطاقة العناوين المقترحة للشبكة المحلية (دائمة الظهور ولا تختفي أبداً) */}
            {(() => {
              let localIps = [];
              if (networkInfo?.localIps && networkInfo.localIps.length > 0) {
                localIps = networkInfo.localIps;
              } else if (Array.isArray(state?.orgSettings?.waServerLanIps) && state.orgSettings.waServerLanIps.length > 0) {
                localIps = state.orgSettings.waServerLanIps;
              } else if (state?.orgSettings?.waServerLanUrl) {
                localIps = [state.orgSettings.waServerLanUrl];
              }

              if (localIps.length > 0) {
                return (
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '12px 14px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#047857' }}>
                        {isDesktop
                          ? 'عناوين IP لهذا الجهاز لربط الموبايل والأجهزة الأخرى (LAN):'
                          : 'عنوان خادم الصيدلية المكتشف على الشبكة المحلية (LAN):'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '11px', padding: '2px 6px', color: '#047857' }}
                        onClick={() => runLanAutoDiscovery(true)}
                        title="إعادة فحص وتحديث عناوين الشبكة"
                      >
                        <RefreshCw style={{ width: '12px', height: '12px' }} className={isDiscovering ? 'animate-spin' : ''} />
                        <span>تحديث</span>
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {localIps.map((net, idx) => {
                        const lanUrl = typeof net === 'string'
                          ? (net.startsWith('http') ? net : `http://${net}:3100`)
                          : (net?.address ? `http://${net.address}:${networkInfo?.port || 3100}` : (net?.url || ''));
                        if (!lanUrl) return null;
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <code style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', direction: 'ltr' }}>
                              {lanUrl}
                            </code>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: '11px', padding: '3px 8px' }}
                                onClick={() => {
                                  navigator.clipboard?.writeText(lanUrl);
                                  showToast?.('تم نسخ الرابط بنجاح');
                                }}
                                title="نسخ الرابط"
                              >
                                <Copy style={{ width: '12px', height: '12px' }} />
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ background: '#059669', color: '#fff', fontSize: '11px', padding: '3px 8px', fontWeight: 700, borderRadius: '6px' }}
                                onClick={() => handleSaveDeviceServerUrl(lanUrl)}
                                title="تثبيت هذا الرابط لهذا الجهاز فقط"
                              >
                                📌 استخدام
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ background: '#1e40af', color: '#fff', fontSize: '11px', padding: '3px 8px', fontWeight: 700, borderRadius: '6px' }}
                                onClick={() => handleSaveServerUrl(lanUrl)}
                                title="تعميم هذا الرابط على كل أجهزة وموبايلات الصيدلية تلقائياً"
                              >
                                ⚡ تعميم
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px dashed #f59e0b', padding: '12px 14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', display: 'block', marginBottom: '4px' }}>
                    {isDesktop ? 'عناوين IP الشبكة المحلية (LAN):' : 'خادم الصيدلية على الشبكة المحلية (LAN):'}
                  </span>
                  <p style={{ margin: '0 0 8px', fontSize: '11.5px', color: 'var(--muted)' }}>
                    {isDesktop
                      ? 'لم يتم استكشاف كروت الشبكة تلقائياً بعد.'
                      : 'لم يتم العثور على خادم الصيدلية تلقائياً بعد. تأكد من تشغيل تطبيق الصيدلية على جهاز السيرفر الرئيسي.'}
                  </p>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#059669', color: '#fff', fontSize: '11.5px', padding: '5px 10px', fontWeight: 700, borderRadius: '6px' }}
                    onClick={() => runLanAutoDiscovery(true)}
                    disabled={isDiscovering}
                  >
                    <RefreshCw style={{ width: '12px', height: '12px', marginRight: '4px' }} className={isDiscovering ? 'animate-spin' : ''} />
                    <span>{isDiscovering ? 'جاري الفحص...' : '🔍 فحص واستكشاف خادم الصيدلية الآن'}</span>
                  </button>
                </div>
              );
            })()}
          </div>

          {/* حقل تخصيص وحفظ الرابط */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>رابط مخصص:</span>
            <input
              type="text"
              value={customServerUrl}
              onChange={(e) => setCustomServerUrl(e.target.value)}
              placeholder="مثال: http://192.168.1.15:3100 أو https://xxxx.loca.lt"
              style={{
                flex: '1 1 240px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                direction: 'ltr',
                textAlign: 'left',
                fontSize: '13px'
              }}
            />
            <button
              type="button"
              className="btn"
              style={{ padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, background: '#059669', color: '#fff', borderRadius: '8px' }}
              onClick={() => handleSaveDeviceServerUrl(customServerUrl)}
              title="تثبيت هذا الرابط لهذا الجهاز / المتصفح فقط دون التأثير على بقية الأجهزة"
            >
              📌 حفظ لهذا الجهاز فقط
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: '12.5px', fontWeight: 700 }}
              onClick={() => handleSaveServerUrl(customServerUrl)}
              title="تعميم هذا الرابط على جميع أجهزة المنظومة كخادم افتراضي"
            >
              🌐 تعميم لكافة المنظومة
            </button>
            {(Boolean(deviceServerUrl) || Boolean(state?.orgSettings?.waServerUrl)) && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '8px 12px', fontSize: '12px', color: '#dc2626' }}
                onClick={() => {
                  handleSaveDeviceServerUrl('');
                  handleSaveServerUrl('');
                }}
              >
                🔄 إلغاء التثبيت والعودة للتلقائي
              </button>
            )}
          </div>

          {/* بطاقة تنزيل أداة التشغيل الاحتياطية للخادم */}
          <div style={{
            background: 'rgba(2, 132, 199, 0.06)',
            border: '1px solid rgba(2, 132, 199, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginTop: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <h5 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download style={{ width: '15px', height: '15px' }} />
                أداة تشغيل خادم الواتساب الاحتياطية (للمتصفح والأجهزة بدون تطبيق الويندوز)
              </h5>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                ملف تشغيل فوري بصيغة (.bat) يقوم بفتح جدار الحماية للويندوز وإطلاق خادم الواتساب في الخلفية بنقرة واحدة لخدمة هواتف الصيدلية.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              style={{
                background: '#0284c7',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 800,
                padding: '7px 14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
              }}
              onClick={handleDownloadBackupScript}
            >
              <Download style={{ width: '13px', height: '13px' }} />
              <span>تحميل الأداة الآن (.bat)</span>
            </button>
          </div>
        </div>
      )}

      {/* ── شريط حالة خادم الواتساب الحية وزر إعادة التشغيل ─────────────────── */}
      <div style={{
        background: waStatus === 'CONNECTED'
          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
          : waStatus === 'QR_READY'
            ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        color: '#fff',
        padding: '16px 20px',
        borderRadius: '14px',
        marginBottom: '22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '15.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {waStatus === 'CONNECTED' && `🟢 خادم الواتساب: متصل ومقترن بنجاح ${waPhone ? `(+${waPhone})` : ''}`}
            {waStatus === 'QR_READY' && '🟡 خادم الواتساب: بانتظار مسح رمز QR للاقتران بالهاتف'}
            {waStatus === 'DISCONNECTED' && '🔴 خادم الواتساب: غير متصل أو قيد الإطلاق'}
            {waStatus === 'checking' && '⏳ جاري فحص حالة اتصال الخادم...'}
          </h4>
          <span style={{ fontSize: '12.5px', opacity: 0.95, fontWeight: 500 }}>
            {waStatus === 'CONNECTED' && 'الخادم يعمل بالخلفية 24/7 ومستعد لإرسال مفردات المرتبات وملفات الـ PDF فوراً وبأمان تام.'}
            {waStatus === 'QR_READY' && 'امسح رمز الـ QR الظاهر بالأسفل من واتساب الهاتف لمرة واحدة فقط لربط الجهازين.'}
            {waStatus === 'DISCONNECTED' && 'اضغط على زر "إعادة تشغيل الخادم" لتشغيله في الخلفية وحل أي تعليق تلقائياً.'}
            {waStatus === 'checking' && 'يتم التحقق من استجابة المقبس الخلفي للواتساب...'}
          </span>
          {typeof window !== 'undefined' && window.location?.protocol === 'https:' && waStatus === 'DISCONNECTED' && (
            <div style={{ marginTop: '8px', padding: '6px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>⚠️ إذا حظر المتصفح الاتصال بالخادم المحلي (Mixed Content):</span>
              <a
                href="http://nodejs-test.apexthunder.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#fef08a', fontWeight: 800, textDecoration: 'underline' }}
              >
                🌐 اضغط هنا لفتح المنظومة عبر رابط HTTP المباشر بدون حظر أمني
              </a>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* زر تغيير الرقم المتصل (يظهر عند الاتصال أو وجود رقم مسجل) */}
          {(waStatus === 'CONNECTED' || Boolean(waPhone)) && (
            <button
              type="button"
              className="btn"
              disabled={isChangingNumber || isRestarting}
              title="تسجيل الخروج من الرقم الحالي وتوليد رمز QR جديد لربط رقم مختلف"
              style={{
                background: '#dc2626',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '12.5px',
                padding: '7px 15px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                cursor: isChangingNumber ? 'not-allowed' : 'pointer',
                opacity: isChangingNumber ? 0.75 : 1,
                transition: 'all 0.2s ease'
              }}
              onClick={handleChangeConnectedNumber}
            >
              <LogOut style={{ width: '13px', height: '13px' }} className={isChangingNumber ? 'animate-spin' : ''} />
              <span>{isChangingNumber ? 'جاري فك الاقتران...' : '📱 تغيير الرقم المتصل'}</span>
            </button>
          )}

          <button
            type="button"
            className="btn"
            style={{ background: '#ffffff', color: '#0f172a', fontWeight: '800', fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px' }}
            onClick={() => fetchWaStatus(false)}
          >
            📲 فحص الاتصال
          </button>

          {/* زر تصفير الجلسة وتوليد QR جديد فوراً */}
          <button
            type="button"
            className="btn"
            disabled={isRestarting || isChangingNumber}
            title="تصفير الجلسة وتوليد رمز QR جديد فوراً لحل أي تعليق بالاتصال"
            style={{
              background: '#fef08a',
              color: '#854d0e',
              fontWeight: '800',
              fontSize: '12.5px',
              padding: '7px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              border: '1px solid #eab308',
              cursor: (isRestarting || isChangingNumber) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={handleForceResetServer}
          >
            <span>⚡ تصفير وتوليد QR</span>
          </button>

          <button
            type="button"
            className="btn"
            disabled={isRestarting || isChangingNumber}
            style={{
              background: '#0f172a',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '12.5px',
              padding: '7px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={handleRestartServer}
          >
            <RefreshCw style={{ width: '13px', height: '13px' }} className={isRestarting ? 'animate-spin' : ''} />
            <span>{isRestarting ? 'جاري الإطلاق...' : 'إعادة تشغيل الخادم'}</span>
          </button>
        </div>
      </div>

      {/* ── بطاقة اقتران QR عند الحاجة ─────────────────────────────────────── */}
      {waStatus === 'QR_READY' && waLiveQr && (
        <div style={{
          background: '#ffffff',
          border: '2px dashed #f59e0b',
          borderRadius: '16px',
          padding: '22px',
          marginBottom: '22px',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.12)'
        }}>
          <h3 style={{ margin: '0 0 6px 0', color: '#b45309', fontSize: '17px', fontWeight: 800 }}>
            📱 امسح رمز الـ QR لربط هاتف الواتساب بالمنظومة
          </h3>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 14px 0' }}>
            افتح WhatsApp ➔ الأجهزة المرتبطة (Linked Devices) ➔ ربط جهاز ووجّه الكاميرا:
          </p>
          <div style={{ display: 'inline-block', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <img src={waLiveQr} alt="WhatsApp QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
          </div>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '5px 14px' }}
              onClick={() => handleRestartServer()}
            >
              🔄 تجديد رمز الـ QR
            </button>
          </div>
        </div>
      )}

      {/* ── قسم اختيار القوالب الجاهزة والتخصيص ─────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '22px'
      }}>
        {/* شريط تبويبات فئات القوالب */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>
            اختر فئة القالب الجاهز:
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {WHATSAPP_TEMPLATE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    const firstInCat = READY_WHATSAPP_TEMPLATES.find(t => t.category === cat.id);
                    if (firstInCat) setSelectedTemplateId(firstInCat.id);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: active ? '1.5px solid #10b981' : '1px solid var(--border)',
                    background: active ? 'linear-gradient(135deg, #059669, #10b981)' : 'var(--card-bg, rgba(255,255,255,0.05))',
                    color: active ? '#ffffff' : 'var(--text)',
                    boxShadow: active ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* شبكة القوالب التابعة للفئة */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>
            القوالب المتاحة:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {currentCategoryTemplates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{tpl.icon}</span>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#059669' : 'var(--text)' }}>
                      {tpl.title}
                    </div>
                    {tpl.supportsPdf && (
                      <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <FileText style={{ width: '11px', height: '11px' }} /> يدعم إرفاق PDF
                      </span>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 style={{ width: '18px', height: '18px', color: '#10b981' }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* فلاتر الاستهداف والفرع */}
        <form onSubmit={handleSendBroadcast}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 700 }}>تصفية حسب الفرع</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                <option value="">-- جميع فروع الصيدليات ({employees.length} موظف) --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 700 }}>تحديد موظف محدد (اختياري)</label>
              <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)}>
                <option value="">-- إرسال جماعي لكافة موظفي الفرع المختار ({filteredEmployees.length} موظف) --</option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{getEmpDisplayName(emp)} ({emp.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* خيار إرفاق ملف الـ PDF المعتمد */}
          {selectedTemplate?.supportsPdf && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1.5px solid rgba(16, 185, 129, 0.35)',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={attachPdfPayslip}
                  onChange={(e) => setAttachPdfPayslip(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div>
                  <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                    📄 إرفاق كشف المرتب كملف PDF معتمد مع كل رسالة واتساب
                  </strong>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    يقوم محرك التطبيق المكتبي بتوليد ملف PDF عالي الدقة A4 لكل موظف بمفردات مرتبه وإرساله فوراً كمستند معتمد.
                  </div>
                </div>
              </label>

              {attachPdfPayslip && (
                <span style={{ fontSize: '12px', background: '#10b981', color: '#fff', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  ✓ مفعل
                </span>
              )}
            </div>
          )}

          {/* محرر ومعاينة نص الرسالة */}
          <div className="field" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>
                نص الرسالة (المعاينة الحية والتعديل الحر):
              </label>
              {previewEmp && (
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  المعاينة الحية للموظف: <strong>{getEmpDisplayName(previewEmp)}</strong>
                </span>
              )}
            </div>
            <textarea
              rows="9"
              value={editableMessage}
              onChange={(e) => setEditableMessage(e.target.value)}
              placeholder="اكتب أو عدل نص الرسالة هنا..."
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '13.5px',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                border: '1px solid var(--border)'
              }}
            />
          </div>

          {/* شريط أزرار الإرسال والإحصائيات */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              🛡️ الإرسال محمي تلقائياً بتقنية الفواصل الزمنية (Anti-Ban) لمنع حظر الرقم من WhatsApp.
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* زر الإرسال المباشر واليدوي عبر WhatsApp Web (Fallback الذكي عند عدم توفر السيرفر أو للإنترنت الخارجي) */}
              {previewEmp && (
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: 800,
                    background: '#25D366',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => handleDirectWhatsAppWeb(previewEmp)}
                  title="إرسال فوري ومباشر لهذا الموظف عبر فتح محادثة WhatsApp Web الرسمية (يعمل من أي متصفح دون الحاجة لسيرفر)"
                >
                  <Smartphone style={{ width: '16px', height: '16px' }} />
                  <span>📲 إرسال مباشر عبر WhatsApp Web</span>
                </button>
              )}

              <button
                type="submit"
                disabled={isSending}
                className="btn btn-start"
                style={{
                  padding: '12px 28px',
                  fontSize: '15px',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                  cursor: isSending ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Send style={{ width: '16px', height: '16px' }} />
                <span>
                  {isSending
                    ? (sendProgressText || 'جاري الإرسال...')
                    : targetEmpId
                    ? `إرسال إلى ${getEmpDisplayName(previewEmp || {})}`
                    : `إرسال إلى كافة موظفي الفرع (${filteredEmployees.length} موظف)`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── جدول الموظفين المستهدفين وحالة أرقام الهواتف ─────────────────────── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 800 }}>
        👥 قائمة الموظفين المستهدفين بالإرسال ({filteredEmployees.length} موظف)
      </h4>
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>رقم الهاتف</th>
              <th>حالة الواتساب</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                  لا يوجد موظفين مسجلين بهذا الفرع.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const empWaNum = getEmpWhatsAppPhone(emp);
                const hasPhone = empWaNum && empWaNum.length >= 10;
                // تحديد نوع الرقم: هل هو رقم مخصص للواتساب أم رقم افتراضي
                const waPhoneObj = Array.isArray(emp.phones)
                  ? emp.phones.find(p => typeof p === 'object' && p?.type === 'whatsapp' && String(p?.number || '').replace(/\D/g,'').length >= 10)
                  : null;
                const phoneLabel = empWaNum
                  ? (waPhoneObj ? `💬 ${empWaNum}` : `📱 ${empWaNum}`)
                  : '❌ بدون رقم';
                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle || 'عضو كادر'}</td>
                    <td style={{ direction: 'ltr', textAlign: 'right', fontWeight: 700 }}>
                      {phoneLabel}
                    </td>
                    <td>
                      {hasPhone ? (
                        <span className="badge badge-success">🟢 جاهز للاستلام</span>
                      ) : (
                        <span className="badge badge-danger">🔴 غير مسجل رقم</span>
                      )}
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
