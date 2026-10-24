async function check() {
  try {
    const resHealth = await fetch('https://169-58-214-20.sslip.io/api/health');
    const healthJson = await resHealth.json();
    const resHtml = await fetch('https://169-58-214-20.sslip.io/');
    const htmlText = await resHtml.text();
    const match = htmlText.match(/assets\/index-[^"]*/);
    console.log('✅ New VPS (169.58.214.20):', {
      apiHealth: healthJson,
      activeBundle: match ? match[0] : 'unknown'
    });
  } catch (e) {
    console.error('❌ New VPS error:', e.message);
  }

  try {
    const resHealthHttp = await fetch('http://169.58.214.20:5000/api/health');
    const healthHttpJson = await resHealthHttp.json();
    console.log('✅ New VPS Direct Port 5000:', {
      apiHealth: healthHttpJson
    });
  } catch (e) {
    console.error('❌ Direct Port 5000 error:', e.message);
  }
}

check();
