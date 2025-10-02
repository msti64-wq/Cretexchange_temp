// Test script for driver payout flow
import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

// Test driver credentials
const TEST_DRIVER = {
  userId: 'd129cbea-5475-46bc-8d4a-18683e6c264e',
  driverId: 'a7dfdee0-3802-4daa-8692-31c113c85d63',
  username: 'testdriver',
  password: 'test123' // Assuming this is the password
};

// Column onboarding data
const ONBOARDING_DATA = {
  firstName: 'Test',
  lastName: 'Driver',
  ssn: '123456789',
  dateOfBirth: '1990-01-01',
  email: 'test@example.com',
  address: {
    line1: '123 Test St',
    city: 'Test City',
    state: 'CA',
    postalCode: '12345',
    country: 'US'
  }
};

async function testPayoutFlow() {
  try {
    console.log('🚀 Starting payout flow test...\n');

    // Step 1: Login as test driver
    console.log('1️⃣ Logging in as test driver...');
    const loginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: TEST_DRIVER.username,
      password: TEST_DRIVER.password
    });
    
    const token = loginRes.data.token;
    console.log('✅ Login successful\n');

    const axiosWithAuth = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Step 2: Complete Column onboarding
    console.log('2️⃣ Testing Column onboarding...');
    try {
      const onboardRes = await axiosWithAuth.post('/api/column/onboard', ONBOARDING_DATA);
      console.log('✅ Column onboarding response:', JSON.stringify(onboardRes.data, null, 2));
    } catch (error) {
      if (error.response?.data?.message === 'Already onboarded to Column') {
        console.log('✅ Already onboarded to Column');
      } else {
        console.error('❌ Column onboarding error:', error.response?.data || error.message);
        throw error;
      }
    }
    console.log('');

    // Step 3: Check wallet balance
    console.log('3️⃣ Checking wallet balance...');
    const walletRes = await axiosWithAuth.get('/api/driver/wallet');
    console.log('✅ Current wallet balance:', JSON.stringify(walletRes.data, null, 2));
    console.log('');

    // Step 4: Request payout
    console.log('4️⃣ Requesting payout of $50...');
    try {
      const payoutRes = await axiosWithAuth.post('/api/driver/payout', {
        amount: 50
      });
      console.log('✅ Payout request successful:', JSON.stringify(payoutRes.data, null, 2));
    } catch (error) {
      console.error('❌ Payout request error:', error.response?.data || error.message);
      throw error;
    }
    console.log('');

    // Step 5: Check updated wallet balance
    console.log('5️⃣ Checking updated wallet balance...');
    const updatedWalletRes = await axiosWithAuth.get('/api/driver/wallet');
    console.log('✅ Updated wallet balance:', JSON.stringify(updatedWalletRes.data, null, 2));
    console.log('');

    // Step 6: Check withdrawal history
    console.log('6️⃣ Checking withdrawal history...');
    const withdrawalsRes = await axiosWithAuth.get('/api/driver/withdrawals');
    console.log('✅ Withdrawals:', JSON.stringify(withdrawalsRes.data, null, 2));
    console.log('');

    console.log('🎉 Payout flow test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testPayoutFlow();
