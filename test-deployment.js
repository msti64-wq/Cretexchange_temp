#!/usr/bin/env node

// Deployment testing script
const deploymentId = process.argv[2];

if (!deploymentId) {
  console.log('Usage: node test-deployment.js <deployment-id>');
  console.log('Example: node test-deployment.js eef85f9b-37fd-45bd-afd8-081f78675718');
  process.exit(1);
}

const baseUrl = `https://${deploymentId}-00-1x6vikpubs2bt.spock.replit.dev`;

console.log(`🧪 Testing deployment: ${deploymentId}`);
console.log(`📍 URL: ${baseUrl}`);

async function testDeployment() {
  try {
    console.log('\n1️⃣ Testing health check...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    console.log(`Health status: ${healthResponse.status}`);
    
    if (healthResponse.status === 404) {
      console.log('❌ Deployment not running - shows "Run this app" page');
      return;
    }
    
    const healthData = await healthResponse.json();
    console.log('Health data:', healthData);

    console.log('\n2️⃣ Testing admin login...');
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    
    console.log(`Login status: ${loginResponse.status}`);
    
    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Login successful!');
      console.log(`User role: ${loginData.user?.role}`);
    } else {
      console.log('❌ Login failed');
      const errorData = await loginResponse.text();
      console.log('Error:', errorData);
    }

  } catch (error) {
    console.log('❌ Connection failed:', error.message);
  }
}

testDeployment();