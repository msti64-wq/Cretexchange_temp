/**
 * Stripe Utility Functions
 * 
 * Helpers for formatting, validating, and preparing data for Stripe APIs
 */

/**
 * Format phone number to E.164 format required by Stripe
 * Converts various formats to +1XXXXXXXXXX
 * 
 * @param phone - Phone number in any format
 * @returns E.164 formatted phone or undefined if invalid
 */
export function formatPhoneE164(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle different digit lengths
  if (digits.length === 10) {
    // US number without country code
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // US number with country code
    return `+${digits}`;
  } else if (digits.length > 10) {
    // Assume it already has country code
    return `+${digits}`;
  }
  
  // Invalid format - return undefined
  console.warn(`⚠️ Invalid phone format (${digits.length} digits)`);
  return undefined;
}

/**
 * Validate that all required Stripe Connect fields are present
 * Returns list of missing fields
 */
export function validateStripeConnectFields(data: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dateOfBirth?: string | null;
  ssnLast4?: string | null;
}): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  if (!data.firstName?.trim()) missingFields.push('First Name');
  if (!data.lastName?.trim()) missingFields.push('Last Name');
  if (!data.email?.trim()) missingFields.push('Email');
  if (!data.phone?.trim()) missingFields.push('Phone Number');
  if (!data.street?.trim()) missingFields.push('Street Address');
  if (!data.city?.trim()) missingFields.push('City');
  if (!data.state?.trim()) missingFields.push('State');
  if (!data.zip?.trim()) missingFields.push('ZIP Code');
  if (!data.dateOfBirth?.trim()) missingFields.push('Date of Birth');
  if (!data.ssnLast4?.trim() || data.ssnLast4.length !== 4) missingFields.push('SSN Last 4 Digits');
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Validate address is not a PO Box (Stripe rejects PO Boxes)
 */
export function isValidStripeAddress(address: string | undefined | null): { isValid: boolean; error?: string } {
  if (!address) {
    return { isValid: false, error: 'Address is required' };
  }
  
  const upperAddress = address.toUpperCase();
  
  // Check for PO Box patterns
  const poBoxPatterns = [
    /^P\.?O\.?\s*BOX/i,
    /^POST\s*OFFICE\s*BOX/i,
    /^POB\s+\d/i,
    /^PO\s+\d/i,
  ];
  
  for (const pattern of poBoxPatterns) {
    if (pattern.test(upperAddress)) {
      return { isValid: false, error: 'PO Box addresses are not accepted. Please provide a physical street address.' };
    }
  }
  
  return { isValid: true };
}

/**
 * Parse date of birth string (YYYY-MM-DD) to Stripe format
 */
export function parseDateOfBirth(dateStr: string | undefined | null): { day: number; month: number; year: number } | undefined {
  if (!dateStr) return undefined;
  
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    console.warn(`⚠️ Invalid DOB format`);
    return undefined;
  }
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Basic validation
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    console.warn(`⚠️ Invalid DOB values`);
    return undefined;
  }
  
  // Stripe requires DOB between 13 and 120 years old
  const now = new Date();
  const age = now.getFullYear() - year;
  if (age < 13 || age > 120) {
    console.warn(`⚠️ Invalid age from DOB`);
    return undefined;
  }
  
  return { day, month, year };
}

/**
 * Generate unique business URL for a user
 * Used for Stripe Connect business_profile.url
 */
export function generateBusinessUrl(username: string, role: 'driver' | 'owner'): string {
  const baseUrl = 'https://creteexchange.com';
  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${baseUrl}/${role}/${sanitizedUsername}`;
}

/**
 * Validate SSN last 4 digits
 */
export function isValidSsnLast4(ssn: string | undefined | null): boolean {
  if (!ssn) return false;
  // Must be exactly 4 digits
  return /^\d{4}$/.test(ssn);
}

/**
 * Format SSN - extract last 4 if full SSN provided
 */
export function formatSsnLast4(ssn: string | undefined | null): string | undefined {
  if (!ssn) return undefined;
  
  // Remove any non-digit characters
  const digits = ssn.replace(/\D/g, '');
  
  if (digits.length === 4) {
    return digits;
  } else if (digits.length === 9) {
    return digits.slice(-4);
  }
  
  return undefined;
}

/**
 * Map human-readable requirement names to Stripe currently_due fields
 */
export function translateStripeRequirement(requirement: string): string {
  const translations: Record<string, string> = {
    'individual.first_name': 'First Name',
    'individual.last_name': 'Last Name',
    'individual.email': 'Email Address',
    'individual.phone': 'Phone Number',
    'individual.dob.day': 'Date of Birth',
    'individual.dob.month': 'Date of Birth',
    'individual.dob.year': 'Date of Birth',
    'individual.address.line1': 'Street Address',
    'individual.address.city': 'City',
    'individual.address.state': 'State',
    'individual.address.postal_code': 'ZIP Code',
    'individual.ssn_last_4': 'SSN (Last 4 digits)',
    'individual.id_number': 'Full Social Security Number',
    'individual.verification.document': 'Photo ID (Driver\'s License or Passport)',
    'individual.verification.additional_document': 'Proof of Address Document',
    'business_profile.url': 'Business Website',
    'business_profile.mcc': 'Business Category',
    'external_account': 'Bank Account for Payouts',
    'tos_acceptance.date': 'Terms & Conditions Acceptance',
    'tos_acceptance.ip': 'Terms & Conditions Acceptance',
  };
  
  return translations[requirement] || requirement;
}

/**
 * Group and deduplicate Stripe requirements for user display
 */
export function formatStripeRequirements(requirements: string[]): string[] {
  const uniqueRequirements = new Set<string>();
  
  for (const req of requirements) {
    uniqueRequirements.add(translateStripeRequirement(req));
  }
  
  return Array.from(uniqueRequirements);
}

/**
 * Check if profile data is complete enough for Stripe account creation
 * Returns structured result with missing items
 */
export interface ProfileCompleteness {
  isComplete: boolean;
  missingRequired: string[];
  warnings: string[];
}

export function checkProfileCompleteness(data: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dateOfBirth?: string | null;
  ssnLast4?: string | null;
}): ProfileCompleteness {
  const missingRequired: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!data.firstName?.trim()) missingRequired.push('First Name');
  if (!data.lastName?.trim()) missingRequired.push('Last Name');
  if (!data.email?.trim()) missingRequired.push('Email');
  
  // Address fields
  if (!data.street?.trim()) {
    missingRequired.push('Street Address');
  } else {
    const addressCheck = isValidStripeAddress(data.street);
    if (!addressCheck.isValid) {
      warnings.push(addressCheck.error || 'Invalid address');
    }
  }
  if (!data.city?.trim()) missingRequired.push('City');
  if (!data.state?.trim()) missingRequired.push('State');
  if (!data.zip?.trim()) missingRequired.push('ZIP Code');
  
  // Verification fields
  if (!data.dateOfBirth?.trim()) {
    missingRequired.push('Date of Birth');
  } else {
    const dob = parseDateOfBirth(data.dateOfBirth);
    if (!dob) {
      warnings.push('Invalid Date of Birth format (use YYYY-MM-DD)');
    }
  }
  
  if (!data.ssnLast4?.trim()) {
    missingRequired.push('SSN Last 4 Digits');
  } else if (!isValidSsnLast4(data.ssnLast4)) {
    warnings.push('SSN must be exactly 4 digits');
  }
  
  // Phone validation
  if (!data.phone?.trim()) {
    missingRequired.push('Phone Number');
  } else {
    const formattedPhone = formatPhoneE164(data.phone);
    if (!formattedPhone) {
      warnings.push('Invalid phone number format');
    }
  }
  
  return {
    isComplete: missingRequired.length === 0 && warnings.length === 0,
    missingRequired,
    warnings
  };
}
