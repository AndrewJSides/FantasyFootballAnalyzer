import type { ByeGrid } from '@/utils/byeGrid';
import styles from './ByeWeekGrid.module.css';

// Bye Week Grid (backlog item 119): one row per team, one column per
// remaining regular-season week. Each cell counts that team's optimal
// starters on bye that week; the cell names them on hover and in its
// aria-label, the team's worst week is highlighted, and the Total column
// sums starters lost across all remaining weeks. Pure render over the
// buildByeGrid output — no fetch, no pricing.

function cellLabel(
  teamName: string,
  week: number,
  count: number,
  names: string[],
): string {
  if (count === 0) return `${teamName}: no starters on bye in week ${week}`;
  const who = names.join(', ');
  return `${teamName}: ${count} starter${count === 1 ? '' : 's'} on bye in week ${week}: ${who}`;
}

export function ByeWeekGrid({ grid }: { grid: ByeGrid }) {
  if (grid.rows.length === 0) return null;
  return (
    <div className={`${styles.wrapper} scroll-x-hint`}>
      <table
        className={styles.table}
        aria-label="Bye week grid: optimal starters on bye per team per remaining week"
      >
        <caption className="visually-hidden">
          Each team&apos;s optimal starters on bye for every remaining
          regular-season week, with each team&apos;s worst week highlighted
        </caption>
        <thead>
          <tr>
            <th scope="col">Team</th>
            {grid.weeks.map(week => (
              <th key={week} scope="col">
                W{week}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map(row => (
            <tr key={row.teamId}>
              <th scope="row" className={styles.team}>
                {row.teamName}
              </th>
              {row.cells.map(cell => {
                const isWorst =
                  row.worstWeek === cell.week && row.worstCount > 0;
                return (
                  <td
                    key={cell.week}
                    className={
                      cell.count === 0
                        ? styles.clear
                        : isWorst
                          ? styles.worst
                          : styles.hit
                    }
                    title={cellLabel(
                      row.teamName,
                      cell.week,
                      cell.count,
                      cell.names,
                    )}
                    aria-label={cellLabel(
                      row.teamName,
                      cell.week,
                      cell.count,
                      cell.names,
                    )}
                  >
                    {cell.count === 0 ? '—' : cell.count}
                  </td>
                );
              })}
              <td
                className={styles.total}
                aria-label={`${row.teamName}: ${row.total} starters lost to byes across all remaining weeks`}
              >
                {row.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
