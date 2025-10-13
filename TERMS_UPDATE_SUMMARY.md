# Terms and Conditions Update Summary

## Overview
Updated comprehensive Terms and Conditions for both Drivers and Location Owners to reflect all current platform features, fees, and services.

**Effective Date:** October 13, 2025

---

## 🚗 Driver Terms - What's New

### Key Updates:

1. **Wallet & Payment System**
   - Column BaaS integration details
   - KYC verification requirements
   - Instant payment processing via Column book transfers
   - Platform fee disclosure: **$4.00 per washout**

2. **Lithic Debit Card**
   - Physical debit card features and benefits
   - Card security and responsibility
   - Instant access to wallet funds
   - Card management capabilities

3. **Withdrawal Fees**
   - Under $10.00: $1.00 flat fee
   - $10.00 and above: 10% processing fee
   - Minimum withdrawal: $5.00
   - 1-3 business day processing time

4. **Service Requirements**
   - GPS check-in process
   - Photo verification requirements
   - Location owner approval process
   - Fraud prevention policies

5. **Compliance & Legal**
   - Independent contractor status
   - Account responsibilities
   - Terms update notification (30 days)
   - Texas law jurisdiction

### Driver Terms Location:
- Component: `client/src/components/DriverTermsDialog.tsx`
- Shown when: Driver accesses wallet features
- Acceptance tracked: Database + wallet activation

---

## 🏢 Location Owner Terms - What's New

### Key Updates:

1. **Platform Fees & Billing**
   - **One-time membership:** $1,500 (via Stripe)
   - **Monthly location fees:** $100/month per active location (via Column)
   - **Transaction fee:** $4.00 per washout (via Column book transfer)
   - Pro-rated billing for mid-month activations

2. **Payment Processing & Wallet**
   - Column BaaS integration (KYB verification)
   - Book transfer mechanics for instant payments
   - Auto top-up functionality
   - ACH and credit card funding options
   - Withdrawal capabilities

3. **Location Management**
   - Location activation/deactivation
   - Washout verification responsibilities (24-hour approval window)
   - Photo evidence requirements
   - Safety and compliance obligations

4. **Billing Cycles**
   - Monthly fees charged 1st of month (2:00 AM UTC)
   - Washout payments processed instantly upon approval
   - Failed payment handling and suspension policies

5. **Liability & Disputes**
   - Owner facility responsibilities
   - Environmental compliance
   - Platform liability limitations
   - Dispute resolution (7-day window)

6. **Termination & Changes**
   - Account closure procedures
   - Terms update notification (30 days)
   - Texas law jurisdiction

### Owner Terms Location:
- Component: `client/src/components/OwnerTermsDialog.tsx`
- Shown when: Owner sets up wallet or subscription
- Access: "View Full Terms" button in wallet wizard
- Acceptance tracked: Checkbox in wallet setup

---

## 📍 Integration Points

### Driver Terms Integration:
1. **Wallet activation flow** - Must accept before withdrawals
2. **Profile page** - View terms link available
3. **Registration** - Optional preview during signup

### Owner Terms Integration:
1. **Wallet Setup Wizard** - Step 4 (Terms & Agreements)
   - "View Full Terms" button next to platform terms checkbox
   - Column terms checkbox (separate)
   - Platform terms checkbox (required)
2. **Subscription page** - Terms reference before payment

---

## 🔄 What Changed from Previous Version

### Driver Terms:
| Old | New |
|-----|-----|
| Generic wallet terms | Column BaaS integration details |
| No debit card info | Lithic debit card section added |
| Platform fee not mentioned | $4.00 per washout clearly stated |
| Basic withdrawal info | Detailed fee structure and processing |
| Limited compliance section | Expanded legal and compliance details |

### Owner Terms:
| Old | New |
|-----|-----|
| No dedicated terms dialog | Full OwnerTermsDialog component created |
| Simple checkbox only | Comprehensive terms + "View Full Terms" button |
| Fee structure unclear | All fees clearly itemized ($1,500 + $100/mo + $4/washout) |
| No billing cycle info | Detailed billing cycles and timing |
| No Column integration info | Full Column/Lithic integration details |

---

## ✅ Verification Checklist

- [x] Driver Terms updated with all features
- [x] Owner Terms dialog created
- [x] Integrated into wallet wizard
- [x] "View Full Terms" button functional
- [x] All fees clearly disclosed
- [x] Column BaaS integration documented
- [x] Lithic debit card details included
- [x] Independent contractor status clarified
- [x] Dispute resolution process defined
- [x] Termination policies outlined
- [x] Effective date updated (Oct 13, 2025)

---

## 📋 User Experience Flow

### For Drivers:
1. Access wallet features → Terms dialog appears
2. Read comprehensive terms (scroll through sections)
3. Check "I have read and understand" box
4. Click "I Agree" to activate wallet
5. Terms acceptance recorded in database

### For Owners:
1. Start wallet setup wizard → Progress to Terms step
2. See Column terms checkbox + Platform terms checkbox
3. Click "View Full Terms" to open OwnerTermsDialog
4. Review comprehensive platform terms
5. Close dialog → Check both boxes to proceed
6. Complete wallet setup

---

## 🔐 Legal & Compliance Notes

1. **Effective Date:** October 13, 2025
2. **Governing Law:** State of Texas
3. **Update Notice:** 30 days advance notice for changes
4. **Significant Changes Require:** Explicit re-acceptance
5. **Acceptance Tracking:** Database records for audit trail

---

## 📂 Files Modified

### New Files:
- `client/src/components/OwnerTermsDialog.tsx` - Full owner terms dialog

### Updated Files:
- `client/src/components/DriverTermsDialog.tsx` - Comprehensive driver terms
- `client/src/components/OwnerWalletWizard.tsx` - Integrated "View Full Terms" button

---

## 🚀 Next Steps

1. **For Testing:**
   - Test driver wallet activation with new terms
   - Test owner wallet setup with "View Full Terms" flow
   - Verify terms dialogs display correctly on mobile

2. **For Production:**
   - Existing users will see updated terms on next wallet access
   - New users see current terms during onboarding
   - Terms version tracking in database

3. **For Legal Review:**
   - All fees and charges clearly disclosed
   - Independent contractor status explicitly stated
   - Dispute resolution process defined
   - Liability limitations documented

---

**Document Created:** October 13, 2025  
**Last Updated:** October 13, 2025
