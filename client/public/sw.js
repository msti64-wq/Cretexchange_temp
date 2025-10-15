// Simple Service Worker for CreteXchange PWA
console.log('Service Worker loaded');

// Install event - skip waiting
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

// Activate event - take control
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});