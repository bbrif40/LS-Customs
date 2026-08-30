/**
 * Mock data for the admin panel views.
 * All values match the Figma design screenshots.
 */

export interface AdminStat {
  label: string
  value: string
  sub?: string
  trend?: string
  trendUp?: boolean
  icon: string
}

export interface TechnicianData {
  name: string
  role: string
  status: 'on-job' | 'available' | 'en-route'
  rating: number
  distance?: string
  avatar: string
}

export interface FleetVehicle {
  name: string
  plate: string
  type: string
  status: 'available' | 'rented' | 'maintenance'
  location: string
  mileage: string
  image: string
}

export interface RecentBooking {
  serviceType: string
  serviceId: string
  customer: string
  status: 'active' | 'pending' | 'completed'
  price: string
  icon: string
}

export interface ScheduleBlock {
  techName: string
  startHour: number
  endHour: number
  label: string
  color: string
}

export interface UnassignedJob {
  title: string
  vehicleInfo: string
  address: string
  urgency: 'urgent' | 'standard'
}

export interface Transaction {
  date: string
  customer: string
  serviceType: string
  serviceIcon: string
  amount: string
  status: 'completed' | 'refunded' | 'pending'
}

// ── Overview Stats ──────────────────────────────────
export const overviewStats: AdminStat[] = [
  { label: 'Total Revenue', value: '₱1,245,000', trend: '+12.5% this week', trendUp: true, icon: 'revenue' },
  { label: 'Active Rentals', value: '42', sub: 'Out of 80 fleet vehicles', icon: 'rentals' },
  { label: 'Pending Mechanics', value: '18', sub: '3 High Priority', trendUp: false, icon: 'mechanics' },
  { label: 'Fleet Utilization', value: '85%', sub: 'Optimal Range', icon: 'fleet' },
]

// ── Technicians ─────────────────────────────────────
export const technicians: TechnicianData[] = [
  { name: 'Marcus T.', role: 'Master Tech', status: 'on-job', rating: 4.9, distance: 'Viewpoint Hts', avatar: 'MT' },
  { name: 'Sarah J.', role: 'Mobile Specialist', status: 'available', rating: 4.7, distance: 'HQ Expert', avatar: 'SJ' },
  { name: 'David R.', role: 'Diagnostics', status: 'en-route', rating: 4.8, distance: '0.8 mi away', avatar: 'DR' },
]

// ── Fleet Vehicles ──────────────────────────────────
export const fleetVehicles: FleetVehicle[] = [
  { name: 'Enus Deity', plate: 'LSC-001', type: 'Luxury Sedan', status: 'available', location: 'HQ Depot', mileage: '12,450 mi', image: 'sedan' },
  { name: 'Gallivanter Baller', plate: 'LSC-042', type: 'Premium SUV', status: 'rented', location: 'Downtown LA', mileage: '34,120 mi', image: 'suv' },
  { name: 'Grotti Turismo R', plate: 'LSC-099', type: 'Sports Coupe', status: 'maintenance', location: 'Shop Bay 4', mileage: '6,800 mi', image: 'coupe' },
]

export const fleetStats: AdminStat[] = [
  { label: 'Total Fleet Size', value: '142', icon: 'total' },
  { label: 'Currently Rented', value: '87', icon: 'rented' },
  { label: 'In Maintenance', value: '12', icon: 'maintenance' },
]

// ── Recent Bookings ─────────────────────────────────
export const recentBookings: RecentBooking[] = [
  { serviceType: 'Rental - Sentinel XS', serviceId: '84-5021', customer: 'Michael De Santa', status: 'active', price: '12,500', icon: '🚗' },
  { serviceType: 'Mechanic - Engine Stall', serviceId: '84G-4412', customer: 'Franklin Clinton', status: 'pending', price: '4,200', icon: '🔧' },
  { serviceType: 'Rental - Elegy RH8', serviceId: '84-5039', customer: 'Trevor Philips', status: 'completed', price: '8,000', icon: '🚗' },
]

// ── Schedule Blocks ─────────────────────────────────
export const scheduleBlocks: ScheduleBlock[] = [
  { techName: 'Marcus T.', startHour: 8, endHour: 11, label: 'Tire Replacement', color: '#e8a838' },
  { techName: 'Marcus T.', startHour: 13, endHour: 15, label: 'Battery Swap', color: '#4CAF50' },
  { techName: 'Sarah L.', startHour: 9, endHour: 12, label: 'Full Diagnostic', color: '#5b8def' },
]

export const scheduleTechnicians = ['Marcus T.', 'Sarah L.']

// ── Unassigned Jobs ─────────────────────────────────
export const unassignedJobs: UnassignedJob[] = [
  { title: 'Tire Replacement', vehicleInfo: 'Est. 3h 30m • Standard SUV', address: '8102 West Ave, South City', urgency: 'urgent' },
  { title: 'Oil Change', vehicleInfo: 'Est. 0h45 • Sedan', address: '420 North Ave, East City', urgency: 'standard' },
]

// ── Revenue Stats ───────────────────────────────────
export const revenueStats: AdminStat[] = [
  { label: 'Total Revenue', value: '₱1,245,000', trend: '+7.8%', trendUp: true, icon: 'revenue' },
  { label: 'Average Order Value', value: '₱8,450', trend: '+4.5%', trendUp: true, icon: 'avg' },
  { label: 'Active Subscriptions (Mechanics)', value: '342', trend: '+6.1%', trendUp: true, icon: 'subs' },
]

// ── Revenue Chart Data ──────────────────────────────
export const revenueChartData = {
  labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
  rentals: [1800, 2100, 1900, 2300, 2600, 3100],
  mechanics: [900, 1100, 1000, 1200, 1400, 1600],
}

// ── Transactions ────────────────────────────────────
export const transactions: Transaction[] = [
  { date: 'Oct 24, 2023', customer: 'Eleanor Pura', serviceType: 'Premium Sedan Rental', serviceIcon: '🚗', amount: '12,000.00', status: 'completed' },
  { date: 'Oct 24, 2023', customer: 'Wade Warren', serviceType: 'Emergency Engine Diagnostic', serviceIcon: '🔧', amount: '4,200.00', status: 'completed' },
  { date: 'Oct 23, 2023', customer: 'Jacob Jones', serviceType: 'Luxury SUV Rental (Deposit)', serviceIcon: '🚗', amount: '5,000.00', status: 'refunded' },
  { date: 'Oct 23, 2023', customer: 'Kathryn Murphy', serviceType: 'Tire Replacement (Mobile)', serviceIcon: '🔧', amount: '8,600.00', status: 'completed' },
]

// ── Map markers for Live Service Map ────────────────
export const mapMarkers = {
  mechanics: [
    { name: 'Marcus T.', lat: 14.58, lng: 121.02, status: 'on-job' },
    { name: 'Sarah J.', lat: 14.56, lng: 121.04, status: 'available' },
    { name: 'David R.', lat: 14.55, lng: 121.00, status: 'en-route' },
  ],
  rentals: [
    { name: 'Sentinel XS', lat: 14.59, lng: 121.05 },
    { name: 'Elegy RH8', lat: 14.54, lng: 121.03 },
    { name: 'Baller', lat: 14.57, lng: 121.01 },
  ],
}
