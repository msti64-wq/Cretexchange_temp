# Reconciliation System Testing Guide

## Overview
This guide walks through testing the complete reconciliation system including:
1. Manual reconciliation triggering
2. Discrepancy detection and correction
3. Complete payment → webhook → reconciliation flow

---

## Prerequisites

**Login as Admin:**
- Username: `admin`
- Password: `admin123`

Make sure you're logged in before testing the endpoints below.

---

## Test Scenario 1: Manual Reconciliation Trigger

### Endpoint
```
POST /api/test/reconciliation/run
```

### Purpose
Manually trigger the daily reconciliation process to check all Stripe Connect accounts against database balances.

### How to Test (Browser Console)

```javascript
// Manually trigger reconciliation
fetch('/api/test/reconciliation/run', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Reconciliation Results:', data);
  console.log(`   Accounts checked: ${data.results.totalAccounts}`);
  console.log(`   Discrepancies found: ${data.results.discrepanciesFound}`);
  console.log(`   Balances synced: ${data.results.balancesSynced}`);
  if (data.results.discrepancies.length > 0) {
    console.table(data.results.discrepancies);
  }
})
.catch(err => console.error('❌ Error:', err));
```

### Expected Result
```json
{
  "success": true,
  "message": "Reconciliation completed successfully!",
  "results": {
    "totalAccounts": 2,
    "discrepanciesFound": 0,
    "balancesSynced": 2,
    "discrepancies": []
  }
}
```

### Server Logs to Watch For
```
========== MANUAL RECONCILIATION TEST ==========
Triggered by: admin@cretexchange.com
✅ Reconciliation completed!
   Accounts checked: 2
   Discrepancies found: 0
   Balances synced: 2
```

---

## Test Scenario 2: Discrepancy Detection & Correction

### Step 1: Inject a Test Discrepancy

**Endpoint:** `POST /api/test/reconciliation/inject-discrepancy`

**Browser Console:**
```javascript
// Inject a $10.00 discrepancy for driver D1
fetch('/api/test/reconciliation/inject-discrepancy', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'D1',
    amountCents: 1000  // $10.00 in cents
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Discrepancy Injected:', data);
  console.log(`   User: ${data.details.username}`);
  console.log(`   Old Balance: ${data.details.oldBalance}`);
  console.log(`   New Balance: ${data.details.newBalance}`);
  console.log(`   Discrepancy: ${data.details.discrepancy}`);
})
.catch(err => console.error('❌ Error:', err));
```

**Expected Result:**
```json
{
  "success": true,
  "message": "Test discrepancy injected successfully!",
  "details": {
    "username": "D1",
    "accountType": "driver",
    "oldBalance": "$0.00",
    "newBalance": "$10.00",
    "discrepancy": "$10.00",
    "nextStep": "Run POST /api/test/reconciliation/run to detect and fix this"
  }
}
```

### Step 2: Run Reconciliation to Detect

**Browser Console:**
```javascript
// Run reconciliation to detect the discrepancy
fetch('/api/test/reconciliation/run', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Discrepancy Detection Results:', data);
  if (data.results.discrepancies.length > 0) {
    console.log('\n🔍 DISCREPANCIES FOUND:');
    console.table(data.results.discrepancies);
  }
})
.catch(err => console.error('❌ Error:', err));
```

**Expected Result:**
```json
{
  "success": true,
  "results": {
    "totalAccounts": 2,
    "discrepanciesFound": 1,
    "balancesSynced": 2,
    "discrepancies": [
      {
        "userId": "...",
        "username": "D1",
        "type": "driver",
        "dbBalance": "$10.00",
        "stripeBalance": "$0.00",
        "difference": "$10.00",
        "severity": "critical"
      }
    ]
  }
}
```

### Step 3: Verify Correction

After reconciliation runs, the database balance should be automatically synced to match Stripe's balance ($0.00).

**Browser Console:**
```javascript
// Check if balance was corrected
fetch('/api/test/reconciliation/run', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Verification Results:', data);
  if (data.results.discrepanciesFound === 0) {
    console.log('🎉 Balance corrected successfully!');
  }
})
.catch(err => console.error('❌ Error:', err));
```

---

## Test Scenario 3: Complete Payment → Webhook → Reconciliation Flow

### Overview
This tests the full end-to-end flow:
1. Process a test payment
2. Stripe sends webhook
3. Webhook updates balances in real-time
4. Reconciliation verifies everything matches

### Prerequisites
- Owner O1 must have:
  - Stripe Connect account configured
  - Payment method added
- Driver D1 must have:
  - Stripe Connect account configured

### Step 1: Process Test Payment

**Browser Console:**
```javascript
// Process a test washout payment
fetch('/api/test/stripe-connect-payment', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ownerUsername: 'O1',
    driverUsername: 'D1',
    washoutAmount: 0.50,  // $0.50 driver payment (testing pricing)
    platformFee: 0.40     // $0.40 platform fee (testing pricing)
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Payment Processed:', data);
  console.log('   Payment Intent:', data.testResults.paymentIntentId);
  console.log('   Owner Charged:', data.testResults.ownerCharged);
  console.log('   Driver Received:', data.testResults.driverReceived);
  console.log('   Platform Fee:', data.testResults.platformFeeCollected);
})
.catch(err => console.error('❌ Error:', err));
```

### Step 2: Wait for Webhook

**Watch Server Logs:**
```
🎣 [development] Received webhook: payment_intent.succeeded (evt_xxxxx)
✅ Successfully processed webhook
```

The webhook should automatically:
- Update driver's Stripe Connect balance in database
- Log the transaction
- Record webhook event for idempotency

### Step 3: Run Reconciliation to Verify

**Browser Console:**
```javascript
// Run reconciliation to verify balances match
fetch('/api/test/reconciliation/run', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Reconciliation Results:', data);
  if (data.results.discrepanciesFound === 0) {
    console.log('🎉 All balances match! Webhook sync working perfectly!');
  } else {
    console.log('⚠️ Discrepancies found:', data.results.discrepancies);
  }
})
.catch(err => console.error('❌ Error:', err));
```

**Expected Result:**
- `discrepanciesFound: 0` (webhook already synced the balance)
- `balancesSynced: 2` (verified both accounts)

---

## Testing Checklist

### ✅ Test 1: Manual Reconciliation
- [ ] Endpoint responds successfully
- [ ] Checks all Stripe Connect accounts
- [ ] Returns accurate account counts
- [ ] Logs detailed information

### ✅ Test 2: Discrepancy Detection
- [ ] Can inject test discrepancy
- [ ] Reconciliation detects discrepancy
- [ ] Reports correct difference amount
- [ ] Automatically corrects database balance
- [ ] Second run shows no discrepancies

### ✅ Test 3: End-to-End Flow
- [ ] Payment processes successfully via Stripe Connect
- [ ] Webhook received and verified
- [ ] Balance updated in real-time via webhook
- [ ] Reconciliation confirms balances match
- [ ] No discrepancies found after webhook sync

---

## Troubleshooting

### "Admin access required"
**Solution:** Login as admin user first:
- Username: `admin`
- Password: `admin123`

### "User does not have a Stripe Connect account"
**Solution:** Make sure the user has completed onboarding:
1. Login as the user (e.g., D1 or O1)
2. Complete Stripe Connect onboarding
3. Verify `stripeConnectAccountId` is set

### Webhook not received
**Solution:** Check webhook configuration:
1. Verify `STRIPE_TEST_WEBHOOK_SECRET` is configured
2. Check Stripe Dashboard → Webhooks for delivery status
3. Look for signature verification errors in server logs

### Discrepancy not detected
**Solution:** Check Stripe Connect account status:
1. Verify account is active in Stripe Dashboard
2. Check that API keys match (test vs production)
3. Review reconciliation logs for API errors

---

## Production Deployment

### Automated Reconciliation Schedule

For production, set up external cron service to hit:
```
POST /api/admin/reconciliation/run-daily
```

**Recommended Schedule:**
- Daily at 2 AM UTC
- After batch processing completes
- Before daily reports generation

**Monitoring:**
- Check `/api/admin/reconciliation/history` for results
- Set up alerts for critical discrepancies
- Review discrepancy reports weekly

---

## Success Criteria

✅ **All tests pass if:**
1. Manual reconciliation runs without errors
2. Injected discrepancies are detected and corrected
3. Payment webhooks update balances in real-time
4. Reconciliation confirms webhook sync accuracy
5. No discrepancies found in normal operation

---

## Next Steps After Testing

1. ✅ Verify webhook signature validation working
2. ✅ Confirm balance synchronization accuracy
3. ✅ Test discrepancy detection and auto-correction
4. 🔄 Set up production cron job for daily reconciliation
5. 📊 Configure monitoring and alerting for critical discrepancies
