'use client';

import { HeatmapEntry } from '@/types';
import { formatRupiah, DAY_NAMES } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  data: HeatmapEntry[];
}

export default function HeatmapChart({ data }: Props) {
  // Build a 7x24 grid
  const grid: Record<string, HeatmapEntry> = {};
  let maxAmount = 0;

  for (const entry of data) {
    const key = `${entry.day_of_week}-${entry.hour_of_day}`;
    grid[key] = entry;
    if (entry.total_amount > maxAmount) maxAmount = entry.total_amount;
  }

  if (!data.length) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
        Belum ada data heatmap
      </div>
    );
  }

  function getIntensity(amount: number): number {
    if (!maxAmount || amount === 0) return 0;
    return amount / maxAmount;
  }

  function getBg(intensity: number): string {
    if (intensity === 0) return 'bg-gray-100';
    if (intensity < 0.2) return 'bg-red-100';
    if (intensity < 0.4) return 'bg-red-200';
    if (intensity < 0.6) return 'bg-red-300';
    if (intensity < 0.8) return 'bg-red-400';
    return 'bg-red-500';
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = [0, 1, 2, 3, 4, 5, 6]; // Sun=0 to Sat=6

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2 sm:hidden">Geser ke samping untuk lihat semua jam →</p>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-gray-400">
                {h % 3 === 0 ? `${h}` : ''}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {days.map((day) => (
            <div key={day} className="flex items-center gap-1 mb-1">
              <span className="w-8 text-right text-xs text-gray-500 pr-1 flex-shrink-0">
                {DAY_NAMES[day]}
              </span>
              {hours.map((hour) => {
                const key = `${day}-${hour}`;
                const entry = grid[key];
                const intensity = entry ? getIntensity(entry.total_amount) : 0;
                return (
                  <div
                    key={hour}
                    className={cn(
                      'flex-1 h-5 rounded-sm cursor-pointer transition-opacity hover:opacity-80',
                      getBg(intensity)
                    )}
                    title={
                      entry
                        ? `${DAY_NAMES[day]} ${hour}:00 — ${formatRupiah(entry.total_amount)} (${entry.count}x)`
                        : `${DAY_NAMES[day]} ${hour}:00 — tidak ada`
                    }
                  />
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 ml-10">
            <span className="text-xs text-gray-400">Rendah</span>
            {['bg-gray-100', 'bg-red-100', 'bg-red-200', 'bg-red-300', 'bg-red-400', 'bg-red-500'].map((cls) => (
              <div key={cls} className={cn('w-4 h-3 rounded-sm', cls)} />
            ))}
            <span className="text-xs text-gray-400">Tinggi</span>
          </div>
        </div>
      </div>
    </div>
  );
}
