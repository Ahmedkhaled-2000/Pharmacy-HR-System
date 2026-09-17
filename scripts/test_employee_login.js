// Test employee login against cloud API using standard fetch
async function testLogin(username, password) {
  const res = await fetch('https://nodejs-test.apexthunder.com/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ username, password, role: 'auto' })
  });

  const body = await res.json();
  return { status: res.status, body };
}

async function run() {
  console.log('--- 1. Testing Employee Code 102 ---');
  const res1 = await testLogin('102', '55588');
  console.log('HTTP Status:', res1.status);
  console.log('Success:', res1.body?.success);
  console.log('Detected Role:', res1.body?.role);
  console.log('Employee Name:', res1.body?.user?.name);
  console.log('Employee Code:', res1.body?.user?.code);
  console.log('JWT Token Present:', !!res1.body?.token);

  console.log('\n--- 2. Testing Invalid Password ---');
  const res2 = await testLogin('102', 'wrong_pass');
  console.log('HTTP Status:', res2.status);
  console.log('Success:', res2.body?.success);
  console.log('Error Message:', res2.body?.error);

  console.log('\n--- 3. Testing Admin Login ---');
  const res3 = await testLogin('admin', '123');
  console.log('HTTP Status:', res3.status);
  console.log('Success:', res3.body?.success);
  console.log('Detected Role:', res3.body?.role);
}

run().catch(console.error);
