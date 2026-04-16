import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config';

const execAsync = promisify(exec);

interface Pm2Process {
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
    pm_uptime: number;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

export interface Pm2CheckResult {
  name: string;
  online: boolean;
  status: string;
  restarts: number;
  uptimeMs: number;
  memoryMb: number;
  cpu: number;
}

export async function checkPm2Processes(names: string[]): Promise<Pm2CheckResult[]> {
  let raw: string;
  try {
    const { stdout } = await execAsync(`${config.pm2Bin} jlist`);
    raw = stdout;
  } catch {
    // fallback: try pm2 from PATH
    try {
      const { stdout } = await execAsync('pm2 jlist');
      raw = stdout;
    } catch {
      return names.map(name => ({
        name, online: false, status: 'pm2 not reachable',
        restarts: 0, uptimeMs: 0, memoryMb: 0, cpu: 0,
      }));
    }
  }

  let processes: Pm2Process[] = [];
  try {
    processes = JSON.parse(raw);
  } catch {
    return names.map(name => ({
      name, online: false, status: 'pm2 parse error',
      restarts: 0, uptimeMs: 0, memoryMb: 0, cpu: 0,
    }));
  }

  return names.map(name => {
    const proc = processes.find(p => p.name === name);
    if (!proc) {
      return { name, online: false, status: 'not found', restarts: 0, uptimeMs: 0, memoryMb: 0, cpu: 0 };
    }
    const status = proc.pm2_env.status;
    return {
      name,
      online: status === 'online',
      status,
      restarts: proc.pm2_env.restart_time ?? 0,
      uptimeMs: proc.pm2_env.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0,
      memoryMb: Math.round((proc.monit?.memory ?? 0) / 1024 / 1024),
      cpu: proc.monit?.cpu ?? 0,
    };
  });
}
