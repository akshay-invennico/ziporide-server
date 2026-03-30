const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW_ANALYTICS: 'dashboard.view_analytics',
  DASHBOARD_VIEW_REVENUE: 'dashboard.view_revenue',

  // Riders
  RIDERS_VIEW: 'riders.view',
  RIDERS_VIEW_DETAILS: 'riders.view_details',
  RIDERS_SUSPEND: 'riders.suspend',

  // Drivers
  DRIVERS_VIEW: 'drivers.view',
  DRIVERS_VIEW_DETAILS: 'drivers.view_details',
  DRIVERS_APPROVE_REJECT: 'drivers.approve_reject',
  DRIVERS_SUSPEND: 'drivers.suspend',

  // Verification Requests
  VERIFICATION_VIEW: 'verification.view',
  VERIFICATION_REVIEW_DOCUMENTS: 'verification.review_documents',
  VERIFICATION_APPROVE_REJECT: 'verification.approve_reject',

  // Trips
  TRIPS_VIEW: 'trips.view',
  TRIPS_VIEW_DETAILS: 'trips.view_details',
  TRIPS_CANCEL_RIDE: 'trips.cancel_ride',
  TRIPS_FORCE_END_RIDE: 'trips.force_end_ride',

  // Vehicle Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_DELETE: 'inventory.delete',

  // Support Tickets
  SUPPORT_VIEW: 'support.view',
  SUPPORT_RESPOND: 'support.respond',
  SUPPORT_CLOSE: 'support.close',

  // Pricing & Settings
  PRICING_VIEW: 'pricing.view',
  PRICING_EDIT: 'pricing.edit',

  // Push Notifications
  NOTIFICATIONS_SEND: 'notifications.send',

  // Operators Management
  OPERATORS_VIEW: 'operators.view',
  OPERATORS_MANAGE: 'operators.manage',
  OPERATORS_REMOVE: 'operators.remove',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const PERMISSION_MODULES = {
  dashboard: {
    label: 'Dashboard',
    permissions: [PERMISSIONS.DASHBOARD_VIEW_ANALYTICS, PERMISSIONS.DASHBOARD_VIEW_REVENUE],
  },
  riders: {
    label: 'Riders',
    permissions: [PERMISSIONS.RIDERS_VIEW, PERMISSIONS.RIDERS_VIEW_DETAILS, PERMISSIONS.RIDERS_SUSPEND],
  },
  drivers: {
    label: 'Drivers',
    permissions: [
      PERMISSIONS.DRIVERS_VIEW,
      PERMISSIONS.DRIVERS_VIEW_DETAILS,
      PERMISSIONS.DRIVERS_APPROVE_REJECT,
      PERMISSIONS.DRIVERS_SUSPEND,
    ],
  },
  verification: {
    label: 'Verification Requests',
    permissions: [
      PERMISSIONS.VERIFICATION_VIEW,
      PERMISSIONS.VERIFICATION_REVIEW_DOCUMENTS,
      PERMISSIONS.VERIFICATION_APPROVE_REJECT,
    ],
  },
  trips: {
    label: 'Trips',
    permissions: [
      PERMISSIONS.TRIPS_VIEW,
      PERMISSIONS.TRIPS_VIEW_DETAILS,
      PERMISSIONS.TRIPS_CANCEL_RIDE,
      PERMISSIONS.TRIPS_FORCE_END_RIDE,
    ],
  },
  inventory: {
    label: 'Vehicle Inventory',
    permissions: [
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_CREATE,
      PERMISSIONS.INVENTORY_EDIT,
      PERMISSIONS.INVENTORY_DELETE,
    ],
  },
  support: {
    label: 'Support Tickets',
    permissions: [PERMISSIONS.SUPPORT_VIEW, PERMISSIONS.SUPPORT_RESPOND, PERMISSIONS.SUPPORT_CLOSE],
  },
  pricing: {
    label: 'Pricing & Settings',
    permissions: [PERMISSIONS.PRICING_VIEW, PERMISSIONS.PRICING_EDIT],
  },
  notifications: {
    label: 'Push Notifications',
    permissions: [PERMISSIONS.NOTIFICATIONS_SEND],
  },
  operators: {
    label: 'Operators Management',
    permissions: [PERMISSIONS.OPERATORS_VIEW, PERMISSIONS.OPERATORS_MANAGE, PERMISSIONS.OPERATORS_REMOVE],
  },
};

const ROLE_DEFAULTS = {
  admin: [...ALL_PERMISSIONS],
  manager: [
    PERMISSIONS.DASHBOARD_VIEW_ANALYTICS,
    PERMISSIONS.DASHBOARD_VIEW_REVENUE,
    PERMISSIONS.RIDERS_VIEW,
    PERMISSIONS.RIDERS_VIEW_DETAILS,
    PERMISSIONS.RIDERS_SUSPEND,
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.DRIVERS_VIEW_DETAILS,
    PERMISSIONS.DRIVERS_APPROVE_REJECT,
    PERMISSIONS.DRIVERS_SUSPEND,
    PERMISSIONS.VERIFICATION_VIEW,
    PERMISSIONS.VERIFICATION_REVIEW_DOCUMENTS,
    PERMISSIONS.VERIFICATION_APPROVE_REJECT,
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_VIEW_DETAILS,
    PERMISSIONS.TRIPS_CANCEL_RIDE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_EDIT,
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_RESPOND,
    PERMISSIONS.SUPPORT_CLOSE,
    PERMISSIONS.PRICING_VIEW,
    PERMISSIONS.NOTIFICATIONS_SEND,
  ],
  operator: [
    PERMISSIONS.DASHBOARD_VIEW_ANALYTICS,
    PERMISSIONS.RIDERS_VIEW,
    PERMISSIONS.RIDERS_VIEW_DETAILS,
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.DRIVERS_VIEW_DETAILS,
    PERMISSIONS.VERIFICATION_VIEW,
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_VIEW_DETAILS,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.SUPPORT_VIEW,
    PERMISSIONS.SUPPORT_RESPOND,
    PERMISSIONS.PRICING_VIEW,
  ],
};

const OPERATOR_ROLES = ['admin', 'manager', 'operator'];

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSION_MODULES,
  ROLE_DEFAULTS,
  OPERATOR_ROLES,
};
