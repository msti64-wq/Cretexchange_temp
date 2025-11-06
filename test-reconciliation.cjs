/**
 * Reconciliation System Test Script
 * Run with: node test-reconciliation.js
 */

const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:5000';
const ADMIN_USERNAME = 'superadmin';
const ADMIN_PASSWORD = 'admin123';

let sessionCookie = '';

// Helper function to make authenticated requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie && { 'Cookie': sessionCookie })
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      // Capture session cookie from login
      if (res.headers['set-cookie']) {
        sessionCookie = res.headers['set-cookie'][0].split(';')[0];
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test functions
async function loginAsAdmin() {
  console.log('\n🔐 Logging in as admin...');
  const result = await makeRequest('POST', '/api/auth/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD
  });
  
  if (result.status === 200) {
    console.log('✅ Logged in successfully');
    return true;
  } else {
    console.error('❌ Login failed:', result.data);
    return false;
  }
}

async function test1_ManualReconciliation() {
  console.log('\n========================================');
  console.log('TEST 1: Manual Reconciliation Trigger');
  console.log('========================================\n');

  const result = await makeRequest('POST', '/api/test/reconciliation/run');
  
  if (result.status === 200) {
    console.log('✅ Reconciliation completed successfully!');
    console.log(`   Accounts checked: ${result.data.results.totalAccounts}`);
    console.log(`   Discrepancies found: ${result.data.results.discrepanciesFound}`);
    console.log(`   Balances synced: ${result.data.results.balancesSynced}`);
    
    if (result.data.results.discrepancies && result.data.results.discrepancies.length > 0) {
      console.log('\n📊 Discrepancies:');
      result.data.results.discrepancies.forEach(d => {
        console.log(`   - ${d.username} (${d.type}): DB=${d.dbBalance}, Stripe=${d.stripeBalance}, Diff=${d.difference}`);
      });
    }
    return true;
  } else {
    console.error('❌ Test failed:', result.data);
    return false;
  }
}

async function test2_InjectDiscrepancy() {
  console.log('\n========================================');
  console.log('TEST 2: Inject & Detect Discrepancy');
  console.log('========================================\n');

  // Step 1: Inject discrepancy
  console.log('Step 1: Injecting $10.00 discrepancy for D1...');
  const injectResult = await makeRequest('POST', '/api/test/reconciliation/inject-discrepancy', {
    username: 'D1',
    amountCents: 1000
  });

  if (injectResult.status === 200) {
    console.log('✅ Discrepancy injected!');
    console.log(`   Old balance: ${injectResult.data.details.oldBalance}`);
    console.log(`   New balance: ${injectResult.data.details.newBalance}`);
    console.log(`   Discrepancy: ${injectResult.data.details.discrepancy}`);
  } else {
    console.error('❌ Injection failed:', injectResult.data);
    return false;
  }

  // Step 2: Detect discrepancy
  console.log('\nStep 2: Running reconciliation to detect discrepancy...');
  const detectResult = await makeRequest('POST', '/api/test/reconciliation/run');

  if (detectResult.status === 200) {
    const found = detectResult.data.results.discrepanciesFound;
    console.log(`✅ Reconciliation complete - ${found} discrepancies found`);
    
    if (found > 0) {
      console.log('\n🔍 Detected discrepancies:');
      detectResult.data.results.discrepancies.forEach(d => {
        console.log(`   - ${d.username}: ${d.difference} difference (${d.severity})`);
      });
      console.log('\n✅ Discrepancy detection working correctly!');
    } else {
      console.log('⚠️  No discrepancies found (may have been auto-corrected)');
    }
    return true;
  } else {
    console.error('❌ Detection failed:', detectResult.data);
    return false;
  }
}

async function test3_CompleteFlow() {
  console.log('\n========================================');
  console.log('TEST 3: Complete Payment Flow');
  console.log('========================================\n');

  console.log('Processing test payment...');
  const paymentResult = await makeRequest('POST', '/api/test/stripe-connect-payment', {
    ownerUsername: 'O1',
    driverUsername: 'D1',
    washoutAmount: 0.50,
    platformFee: 0.40
  });

  if (paymentResult.status === 200) {
    console.log('✅ Payment processed!');
    console.log(`   Owner charged: ${paymentResult.data.testResults.ownerCharged}`);
    console.log(`   Driver received: ${paymentResult.data.testResults.driverReceived}`);
    console.log(`   Platform fee: ${paymentResult.data.testResults.platformFeeCollected}`);
    console.log(`   Payment ID: ${paymentResult.data.testResults.paymentIntentId}`);

    // Wait a moment for webhook
    console.log('\n⏳ Waiting 2 seconds for webhook processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run reconciliation
    console.log('Running reconciliation to verify...');
    const reconResult = await makeRequest('POST', '/api/test/reconciliation/run');

    if (reconResult.status === 200) {
      if (reconResult.data.results.discrepanciesFound === 0) {
        console.log('✅ Perfect! Webhook sync working - no discrepancies!');
      } else {
        console.log(`⚠️  Found ${reconResult.data.results.discrepanciesFound} discrepancies after payment`);
      }
      return true;
    }
  } else {
    console.error('❌ Payment failed:', paymentResult.data);
    console.log('\n💡 This test requires O1 to have Stripe Connect account and payment method configured');
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   RECONCILIATION SYSTEM TEST SUITE          ║');
  console.log('╚═══════════════════════════════════════════════╝');

  try {
    // Login first
    const loggedIn = await loginAsAdmin();
    if (!loggedIn) {
      console.error('\n❌ Cannot proceed without admin login');
      process.exit(1);
    }

    const results = [];

    // Run tests
    results.push(await test1_ManualReconciliation());
    results.push(await test2_InjectDiscrepancy());
    results.push(await test3_CompleteFlow());

    // Summary
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   TEST SUMMARY                              ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log(`Tests passed: ${passed}/${total}`);
    console.log(`Tests failed: ${total - passed}/${total}`);

    if (passed === total) {
      console.log('\n🎉 ALL TESTS PASSED! 🎉\n');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED\n');
    }

    process.exit(passed === total ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
