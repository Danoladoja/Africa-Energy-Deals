/**
 * Shared constants for the AfriEnergy Tracker.
 */

/**
 * Auto-purge retention windows for energy_projects rows.
 * The daily purge job uses these thresholds. A feature flag
 * (PURGE_ENABLED env var) must be set to "true" for deletions to run.
 */
export const PURGE_RETENTION_DAYS = {
  rejected: 7,
  needsSource: 30,
  scraperRunsDays: 90,
} as const;
