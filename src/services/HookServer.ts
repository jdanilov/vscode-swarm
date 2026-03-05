import * as http from 'http';
import * as url from 'url';
import { EventEmitter } from 'events';
import { TaskStatus } from '../types';

export interface ActivityEvent {
  taskId: string;
  status: TaskStatus;
  message?: string;
}

/**
 * Lightweight HTTP server that receives hook callbacks from Claude Code.
 * Claude hooks are configured to curl this server on busy/idle/notification events.
 */
export class HookServer extends EventEmitter {
  private server: http.Server | null = null;
  private _port: number = 0;

  get port(): number {
    return this._port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
          resolve(this._port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsed = url.parse(req.url || '', true);
    const taskId = parsed.query['taskId'] as string;

    console.log(`[Swarm Hook] ${req.method} ${req.url}`);

    if (!taskId) {
      res.writeHead(400);
      res.end('Missing taskId');
      return;
    }

    const pathname = parsed.pathname || '';

    if (pathname === '/hook/busy') {
      console.log(`[Swarm Hook] Task ${taskId} -> busy`);
      this.emit('activity', { taskId, status: 'busy' } satisfies ActivityEvent);
      res.writeHead(200);
      res.end('ok');
    } else if (pathname === '/hook/stop') {
      console.log(`[Swarm Hook] Task ${taskId} -> idle`);
      this.emit('activity', { taskId, status: 'idle' } satisfies ActivityEvent);
      res.writeHead(200);
      res.end('ok');
    } else if (pathname === '/hook/notification' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const status: TaskStatus =
            data.notification_type === 'permission_prompt' ? 'waiting' : 'idle';
          this.emit('activity', {
            taskId,
            status,
            message: data.message,
          } satisfies ActivityEvent);
        } catch {
          // ignore malformed
        }
        res.writeHead(200);
        res.end('ok');
      });
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  }

  /**
   * Generate the hook configuration JSON for .claude/settings.local.json
   * Uses $SWARM_TASK_ID env var so each terminal process uses its own taskId,
   * even when multiple tasks share the same working directory.
   */
  getHookConfig(): Record<string, unknown> {
    const base = `http://127.0.0.1:${this._port}`;
    // Use $SWARM_TASK_ID environment variable (set per-terminal in ClaudeSpawner)
    // This ensures each Claude process reports its own task's status,
    // even when tasks share the same .claude/settings.local.json file.
    return {
      hooks: {
        Stop: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `curl -s "${base}/hook/stop?taskId=$SWARM_TASK_ID"`,
              },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `curl -s "${base}/hook/busy?taskId=$SWARM_TASK_ID"`,
              },
            ],
          },
        ],
        Notification: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `curl -s -X POST -H "Content-Type: application/json" -d "$HOOK_PAYLOAD" "${base}/hook/notification?taskId=$SWARM_TASK_ID"`,
              },
            ],
          },
        ],
      },
    };
  }
}
