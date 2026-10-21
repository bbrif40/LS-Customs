const labels: Record<string, string> = {
  routine_fluid_service: 'Routine & Fluid Service',
  tire_wheel_care: 'Tire & Wheel Care',
  electrical_battery_care: 'Electrical & Battery Care',
  diagnostic_repair: 'Diagnostics & Repair',
  lighting_visibility: 'Lighting & Visibility',
  quick_fixes: 'Quick Fixes',
}
export function serviceCategoryLabel(category: string): string {
  return labels[category] ?? category.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
