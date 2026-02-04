// Building Hawk Theme Configuration
// Matching the SwiftUI design specification

export const colors = {
  // Primary Colors
  navy: '#1a2744',
  navyLight: '#2d3e5c',
  navyDark: '#0d1522',

  // Accent Colors
  gold: '#d4a84b',
  goldLight: '#e6c77a',
  goldDark: '#b8923f',

  teal: '#2d9596',
  tealLight: '#4ab5b6',
  tealDark: '#1e6b6c',

  // Neutrals
  white: '#ffffff',
  offWhite: '#f5f5f5',
  gray: '#6b7280',
  darkGray: '#374151',

  // Status Colors
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',

  // Property status (matching existing)
  occupied: '#22c55e',
  vacant: '#ef4444',
  partial: '#eab308',
  inMarket: '#3b82f6',
  noData: '#6b7280',
} as const;

export const fonts = {
  heading: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  body: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
} as const;

export const borderRadius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  full: '9999px',
} as const;

// Role options from the SwiftUI specification
export const roles = [
  'Broker/Agent',
  'Developer',
  'Owner',
  'Tenant',
  'Appraiser',
  'Prop Manager',
  'Lender',
  'Environmental',
  'Contractor',
] as const;

export type Role = typeof roles[number];

// User session type
export interface UserSession {
  email: string;
  role: Role;
  authenticated: boolean;
  apiKey?: string;
}
