export interface ReportColumn {
  key: string;
  label: string;
}

export const OWNER_REPORT_COLUMNS: ReportColumn[] = [
  { key: "locationName", label: "Location Name" },
  { key: "locationAddress", label: "Location Address" },
  { key: "driverDisplayName", label: "Driver Name" },
  { key: "truckNumber", label: "Truck / Vehicle #" },
  { key: "checkInTime", label: "Recovery Activity Date/Time" },
  { key: "washoutId", label: "Recovery Activity ID" },
  { key: "washoutStatus", label: "Recovery Verification Status" },
  { key: "serviceType", label: "Service Type" },
  { key: "quantity", label: "Quantity" },
  { key: "unit", label: "Unit" },
];

export const DRIVER_REPORT_COLUMNS: ReportColumn[] = [
  { key: "driverDisplayName", label: "Driver Name" },
  { key: "driverPhone", label: "Driver Phone" },
  { key: "driverEmail", label: "Driver Email" },
  { key: "truckNumber", label: "Truck / Vehicle #" },
  { key: "ownerDisplayName", label: "Owner Name" },
  { key: "ownerCompanyName", label: "Owner Company" },
  { key: "locationName", label: "Location Name" },
  { key: "locationAddress", label: "Location Address" },
  { key: "checkInTime", label: "Recovery Activity Date/Time" },
  { key: "washoutId", label: "Recovery Activity ID" },
  { key: "washoutStatus", label: "Recovery Verification Status" },
  { key: "ticketNumber", label: "Drawing Ticket" },
  { key: "serviceType", label: "Service Type" },
  { key: "quantity", label: "Quantity" },
  { key: "unit", label: "Unit" },
  { key: "amountCharged", label: "Amount Charged" },
  { key: "platformFee", label: "Platform Fee" },
  { key: "tipAmount", label: "Tip Amount" },
  { key: "driverPaymentAmount", label: "Payment to Driver" },
  { key: "paymentStatus", label: "Payment Status" },
  { key: "paymentDate", label: "Payment Date" },
  { key: "notes", label: "Notes / Exceptions" },
];
