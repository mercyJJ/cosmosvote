import styles from './ProposalSkeleton.module.css';
import treasuryStyles from './TreasurySkeleton.module.css';

/**
 * TreasurySkeleton — loading placeholder for the Treasury tab.
 *
 * Rendered while treasury balance / asset data is being fetched.
 * Accessibility: aria-busy="true" and aria-label inform screen readers that
 * content is loading. All skeleton shapes are aria-hidden (decorative).
 */
export function TreasurySkeleton() {
  return (
    <section
      className={treasuryStyles.container}
      aria-busy="true"
      aria-label="Loading treasury data…"
    >
      {/* Section heading */}
      <div className={`${styles.skeleton} ${treasuryStyles.headingSkeleton}`} aria-hidden="true" />

      {/* Balance card */}
      <div className={treasuryStyles.balanceCard} aria-hidden="true">
        <div className={`${styles.skeleton} ${treasuryStyles.balanceLabelSkeleton}`} />
        <div className={`${styles.skeleton} ${treasuryStyles.balanceValueSkeleton}`} />
        <div className={`${styles.skeleton} ${treasuryStyles.balanceSubSkeleton}`} />
      </div>

      {/* Asset rows */}
      {[0, 1, 2].map(i => (
        <div key={i} className={treasuryStyles.assetRow} aria-hidden="true">
          <div className={treasuryStyles.assetLeft}>
            <div className={`${styles.skeleton} ${treasuryStyles.assetIconSkeleton}`} />
            <div>
              <div className={`${styles.skeleton} ${treasuryStyles.assetNameSkeleton}`} />
              <div className={`${styles.skeleton} ${treasuryStyles.assetSymbolSkeleton}`} />
            </div>
          </div>
          <div className={treasuryStyles.assetRight}>
            <div className={`${styles.skeleton} ${treasuryStyles.assetAmountSkeleton}`} />
            <div className={`${styles.skeleton} ${treasuryStyles.assetUsdSkeleton}`} />
          </div>
        </div>
      ))}

      {/* Totals footer */}
      <div className={treasuryStyles.footer} aria-hidden="true">
        <div className={`${styles.skeleton} ${treasuryStyles.footerLabelSkeleton}`} />
        <div className={`${styles.skeleton} ${treasuryStyles.footerValueSkeleton}`} />
      </div>
    </section>
  );
}
