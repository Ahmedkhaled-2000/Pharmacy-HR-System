import fs from 'fs';

async function main() {
  const getRes = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const liveState = (await getRes.json()).value;

  console.log('Sending authoritative state to backup server (63.183.147.199:5000)...');
  try {
    const postRes = await fetch('http://63.183.147.199:5000/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Role': 'admin',
        'X-App-Password': '123',
        'x-device-token': 'desktop-app-sync-token-2026',
        'x-app-version': '1.2.69'
      },
      body: JSON.stringify({ key: 'pharmacy-tracker-data', value: liveState })
    });
    const postJson = await postRes.json();
    console.log('Backup server update result:', postJson.success ? '✅ SUCCESS' : postJson);
  } catch (err) {
    console.log('Direct port 5000 failed, trying port 80/nginx...');
    const postRes = await fetch('http://63.183.147.199/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Role': 'admin',
        'X-App-Password': '123',
        'x-device-token': 'desktop-app-sync-token-2026',
        'x-app-version': '1.2.69'
      },
      body: JSON.stringify({ key: 'pharmacy-tracker-data', value: liveState })
    });
    const postJson = await postRes.json();
    console.log('Backup server update via port 80 result:', postJson.success ? '✅ SUCCESS' : postJson);
  }
}

main().catch(console.error);
