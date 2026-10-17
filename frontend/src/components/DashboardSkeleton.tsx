import styles from './ProposalSkeleton.module.css';
import dashStyles from './DashboardSkeleton.module.css';

/**
 * DashboardSkeleton — loading placeholder for UserDashboard.
 *
 * Rendered while wallet / token data is being fetched.
 * Accessibility: aria-busy="true" and aria-label inform screen readers that
 * content is loading. aria-hidden skeleton shapes are decorative only.
 */
export function DashboardSkeleton() {
  return (
    <aside
      className={dashStyles.container}
      aria-busy="true"
      aria-label="Loading user dashboard…"
    >
      {/* Wallet summary row */}
      <div className={dashStyles.walletRow}>
        <div>
          <div className={`${styles.skeleton} ${dashStyles.labelSkeleton}`} aria-hidden="true" />
          <div className={`${styles.skeleton} ${dashStyles.addressSkeleton}`} aria-hidden="true" />
          <div className={`${styles.skeleton} ${dashStyles.balanceSkeleton}`} aria-hidden="true" />
        </div>
        <div className={dashStyles.buttonGroup}>
          <div className={`${styles.skeleton} ${dashStyles.buttonSkeleton}`} aria-hidden="true" />
          <div className={`${styles.skeleton} ${dashStyles.buttonSkeleton}`} aria-hidden="true" />
        </div>
      </div>

      {/* Stats row */}
      <div className={dashStyles.statsRow}>
        {[0, 1, 2].map(i => (
          <div key={i} className={dashStyles.statCard} aria-hidden="true">
            <div className={`${styles.skeleton} ${dashStyles.statValueSkeleton}`} />
            <div className={`${styles.skeleton} ${dashStyles.statLabelSkeleton}`} />
          </div>
        ))}
      </div>

      {/* Vote history rows */}
      <div className={dashStyles.historyLabel} aria-hidden="true">
        <div className={`${styles.skeleton} ${dashStyles.sectionTitleSkeleton}`} />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className={dashStyles.historyRow} aria-hidden="true">
          <div className={`${styles.skeleton} ${dashStyles.historyTitleSkeleton}`} />
          <div className={`${styles.skeleton} ${dashStyles.historyVoteSkeleton}`} />
        </div>
      ))}
    </aside>
  );
}
