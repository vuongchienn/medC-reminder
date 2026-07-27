/**
 * Calculate dashboard statistics from reminder history.
 * @param {Array<object>} history
 * @returns {object}
 */
export function calculateStats(history = []) {
  const totalReminders = history.length;

  const takenCount = history.filter(
    (item) => item.status === 'taken'
  ).length;

  const missedCount = history.filter(
    (item) => item.status === 'missed'
  ).length;

  const delayedCount = history.filter(
    (item) => item.status === 'delayed'
  ).length;

  const adherenceRate =
    totalReminders === 0
      ? 0
      : Math.round((takenCount / totalReminders) * 100);

  const forgottenMap = new Map();

  history.forEach((item) => {
    if (
      item.status === 'missed' ||
      item.status === 'delayed'
    ) {
      const key = item.medicine_name || 'Unknown';

      forgottenMap.set(
        key,
        (forgottenMap.get(key) || 0) + 1
      );
    }
  });

  const topForgottenMedicines = Array.from(
    forgottenMap.entries()
  )
    .map(([name, count]) => ({
      name,
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  function getDateKey(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().split('T')[0];
  }

  const sortedDays = [
    ...new Set(
      history
        .map((item) =>
          getDateKey(
            item.created_at ||
              item.actual_taken_at ||
              item.scheduled_time
          )
        )
        .filter(Boolean)
    )
  ].sort();

  let streak = 0;

  for (
    let index = sortedDays.length - 1;
    index >= 0;
    index -= 1
  ) {
    const day = sortedDays[index];

    const dayEntries = history.filter((item) => {
      const entryDay = getDateKey(
        item.created_at ||
          item.actual_taken_at ||
          item.scheduled_time
      );

      return entryDay === day;
    });

    const hadSuccessfulDose = dayEntries.some(
      (item) =>
        item.status === 'taken' ||
        item.status === 'delayed'
    );

    if (!hadSuccessfulDose) {
      break;
    }

    streak += 1;
  }

  const warning =
    missedCount >= 2 || streak === 0
      ? 'You have missed several doses recently. Consider adjusting your schedule.'
      : null;

  return {
    totalReminders,
    takenCount,
    missedCount,
    delayedCount,
    adherenceRate,
    topForgottenMedicines,
    streak,
    warning
  };
}