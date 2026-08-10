import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding } from '../../utils/handApiHelper';

export default function FaceRegistrationModal({ employee, onClose, onSuccess, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [currentType, setCurrentType] = useState(biometricType);
  const [status, setStatus] = useState('جارِ التحميل...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const isHand = currentType === 'hand';

  const [facingMode, setFacingMode] = useState('user'); // 'user' (أمامية) or 'environment' (خلفية)

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      setIsInitializing(true);
      setErrorMsg(null);
      setStatus('جارِ التحميل...');
      
      try {
        if (isHand) {
          await initHandRecognition();
        } else {
          await initFaceRecognition();
        }
        
        // Stop existing tracks before starting new camera stream
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsInitializing(false);
        setStatus(isHand ? 'يرجى وضع يدك أمام الكاميرا بشكل واضح' : 'يرجى النظر مباشرة للكاميرا في إضاءة جيدة');
      } catch (err) {
        console.error('Camera/Model error:', err);
        setErrorMsg('فشل في تشغيل الكاميرا أو تحميل النماذج. تأكد من الصلاحيات.');
        setIsInitializing(false);
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHand, facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const [captureStage, setCaptureStage] = useState(0);
  const [descriptors, setDescriptors] = useState([]);

  // Reset stages if user switches biometric type
  useEffect(() => {
    setCaptureStage(0);
    setDescriptors([]);
  }, [currentType]);

  const captureBiometric = async () => {
    if (!videoRef.current || isInitializing) return;

    setStatus(`جاري تحليل ${isHand ? 'اليد' : 'الوجه'}...`);
    setErrorMsg(null);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        
        if (!result || !result.hasHand) {
          setErrorMsg('لم يتم التعرف على يد. يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
            setStatus('تم التقاط (باطن اليد) ✅. يرجى قلب اليد لتصوير (ظهر اليد) والنقر على التقاط.');
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
            setStatus('تم التقاط (ظهر اليد) ✅. يرجى إمالة اليد قليلاً للجانب والنقر على التقاط.');
          } else {
            setStatus('تم التقاط جميع زوايا اليد بنجاح! ✅ جاري الحفظ...');
            setTimeout(() => {
              onSuccess(newDescriptors, 'hand'); // array of 3 descriptors
            }, 1500);
          }
        }
      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          setErrorMsg(result.error);
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
            setStatus('تم التقاط الوجه (الأمام) ✅. يرجى الالتفات قليلاً لليمين ثم النقر على التقاط.');
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
            setStatus('تم التقاط الوجه (اليمين) ✅. يرجى الالتفات قليلاً لليسار ثم النقر على التقاط.');
          } else {
            setStatus('تم التقاط جميع زوايا الوجه بنجاح! ✅ جاري الحفظ...');
            setTimeout(() => {
              onSuccess(newDescriptors, 'face'); // array of 3 descriptors
            }, 1500);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('حدث خطأ غير متوقع أثناء التحليل.');
      setStatus('حاول مرة أخرى');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <div className="modal-header">
          <h3>تسجيل بصمة {isHand ? 'اليد' : 'الوجه'}: {employee.name}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold' }}>البصمة:</label>
              <select 
                value={currentType} 
                onChange={(e) => setCurrentType(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              >
                <option value="face">بصمة الوجه 👤</option>
                <option value="hand">بصمة اليد ✋</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleCamera}
              style={{ fontSize: '0.85rem', padding: '6px 14px', borderRadius: '8px' }}
            >
              🔄 الكاميرا: {facingMode === 'user' ? 'الأمامية 🤳' : 'الخلفية 📷'}
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', border: '2px solid var(--border)' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', display: 'block', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} 
            />
            {isInitializing && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <div className="spinner">جارِ التجهيز...</div>
              </div>
            )}
          </div>

          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '8px', width: '100%' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--text)', margin: '0 0 8px 0' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>⚠️ {errorMsg}</p>
            )}
            
            <ul style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--muted)', marginTop: '12px' }}>
              {isHand ? (
                <>
                  <li>تأكد من إضاءة الغرفة جيداً.</li>
                  <li>ارفع يدك وافتح أصابعك بشكل مريح أمام الكاميرا.</li>
                  <li>تجنب تحريك يدك أثناء الالتقاط.</li>
                </>
              ) : (
                <>
                  <li>تأكد من أن وجهك واضح ومضاء بشكل جيد.</li>
                  <li>انظر مباشرة للكاميرا.</li>
                  <li>لا تقم بارتداء نظارات شمسية أو كمامة أثناء التسجيل.</li>
                </>
              )}
            </ul>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={captureBiometric}
            disabled={isInitializing}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', marginTop: '10px' }}
          >
            📸 التقاط وحفظ البصمة
          </button>
        </div>
      </div>
    </div>
  );
}
