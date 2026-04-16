import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemStats {
  cpuPercent: number;   // load-based, can exceed 100% on multi-core
  ramPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskPercent: number;
  diskUsed: string;
  diskTotal: string;
}

export async function getSystemStats(): Promise<SystemStats> {
  // RAM
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsedMb = Math.round((totalMem - freeMem) / 1024 / 1024);
  const ramTotalMb = Math.round(totalMem / 1024 / 1024);
  const ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // CPU — 1-min load average normalised to core count
  const loadAvg1 = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpuPercent = Math.round((loadAvg1 / cpuCount) * 100);

  // Disk (root partition)
  let diskPercent = 0;
  let diskUsed = '?';
  let diskTotal = '?';
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $3, $2, $5}'");
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 3) {
      diskUsed = parts[0];
      diskTotal = parts[1];
      diskPercent = parseInt(parts[2].replace('%', ''), 10) || 0;
    }
  } catch {
    // non-fatal — disk check unavailable
  }

  return { cpuPercent, ramPercent, ramUsedMb, ramTotalMb, diskPercent, diskUsed, diskTotal };
}
