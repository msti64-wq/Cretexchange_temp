import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

async function testColumnAPI() {
  try {
    console.log('🧪 Testing Column API access with test key...\n');

    // Login as test driver
    const loginRes = await axios.post(`${BASE_URL}/api/login`, {
      username: 'testdriver',
      password: 'test123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Logged in successfully\n');

    // Test Column onboarding endpoint
    console.log('📞 Calling Column API via onboarding endpoint...');
    const onboardRes = await axios.post(`${BASE_URL}/api/column/onboard`, {
      firstName: 'John',
      lastName: 'Doe',
      ssn: '123456789',
      dateOfBirth: '1990-01-01',
      email: 'john.doe@test.com',
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US'
      }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ Column API Response:', JSON.stringify(onboardRes.data, null, 2));
    console.log('\n🎉 SUCCESS! Column API is accessible with test key');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('\n⚠️  DNS Error: Cannot reach Column API');
    }
  }
}

testColumnAPI();
