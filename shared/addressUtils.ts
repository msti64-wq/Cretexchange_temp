/**
 * Address Utilities
 * Helper functions for formatting and working with addresses
 */

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Format address parts into a single line string
 */
export function formatAddress(address: Address | { street?: string; city?: string; state?: string; zip?: string }): string {
  const { street, city, state, zip } = address;
  
  // Build address parts array, filtering out empty values
  const parts: string[] = [];
  
  if (street?.trim()) parts.push(street.trim());
  if (city?.trim()) parts.push(city.trim());
  
  // Combine state and zip if both present
  const stateZip = [state?.trim(), zip?.trim()].filter(Boolean).join(' ');
  if (stateZip) parts.push(stateZip);
  
  return parts.join(', ');
}

/**
 * Format address for display with line breaks
 */
export function formatAddressMultiLine(address: Address | { street?: string; city?: string; state?: string; zip?: string }): string {
  const { street, city, state, zip } = address;
  return `${street || ''}\n${city || ''}, ${state || ''} ${zip || ''}`.trim();
}

/**
 * Parse a full address string into separate components (best effort)
 */
export function parseAddress(fullAddress: string): Partial<Address> {
  const parts = fullAddress.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    const stateZip = parts[2].trim().split(/\s+/);
    const state = stateZip[0] || '';
    const zip = stateZip[1] || '';
    
    return { street, city, state, zip };
  }
  
  return { street: fullAddress, city: '', state: '', zip: '' };
}
