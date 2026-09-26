import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './kiosk-modern.css'
import './portal.css'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary'
import { installClipboardUrlSanitizer } from './utils/systemUrlHelper'
import { selfHealingEngine } from './utils/selfHealingEngine'

// تثبيت حارس الحافظة التلقائي ومحرك الإصلاح الذاتي الشامل
installClipboardUrlSanitizer();
selfHealingEngine.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="حدث خطأ غير متوقع في تشغيل المنظومة">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

