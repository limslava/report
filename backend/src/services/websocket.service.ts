import { IncomingMessage, Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server as WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { MonthlyPlan, PlanCategory } from '../models/monthly-plans.model';
import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { getJwtSecret } from '../config/env';

export interface PlanUpdateEvent {
  type: 'plan:updated' | 'plan:recalculated' | 'plan:admin-override';
  category: PlanCategory;
  year: number;
  month?: number;
  plan?: MonthlyPlan;
  timestamp: string;
  userId?: string;
}

export interface PlanningV2SegmentUpdateEvent {
  type: 'planning-v2:segment-updated';
  segmentCode: string;
  year: number;
  month: number;
  timestamp: string;
  userId?: string;
}

export interface FinancialPlanUpdateEvent {
  type: 'financial-plan:updated';
  year: number;
  timestamp: string;
  userId?: string;
}

export interface NotesUnreadRefreshEvent {
  type: 'notes:unread-refresh';
  timestamp: string;
}

type OutgoingWebSocketEvent =
  | PlanUpdateEvent
  | PlanningV2SegmentUpdateEvent
  | FinancialPlanUpdateEvent
  | NotesUnreadRefreshEvent;

type SocketClient = {
  userId: string;
  role: string;
};

type AliveWebSocket = WebSocket & { isAlive?: boolean };

const WS_HEARTBEAT_INTERVAL_MS = 30000;

function isPlanningV2Event(event: OutgoingWebSocketEvent): event is PlanningV2SegmentUpdateEvent {
  return event.type === 'planning-v2:segment-updated';
}

function isPlanUpdateEvent(event: OutgoingWebSocketEvent): event is PlanUpdateEvent {
  return (
    event.type === 'plan:updated' ||
    event.type === 'plan:recalculated' ||
    event.type === 'plan:admin-override'
  );
}

function isFinancialPlanEvent(event: OutgoingWebSocketEvent): event is FinancialPlanUpdateEvent {
  return event.type === 'financial-plan:updated';
}

function isNotesUnreadRefreshEvent(event: OutgoingWebSocketEvent): event is NotesUnreadRefreshEvent {
  return event.type === 'notes:unread-refresh';
}

export class PlanWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, SocketClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  initialize(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws/plans' });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(ws, request);
    });

    this.startHeartbeat();
    logger.info('WebSocket server initialized on /ws/plans');
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage) {
    const client = await this.authenticateSocket(request);
    if (!client) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    this.clients.set(ws, client);
    logger.info(`New WebSocket connection. Total clients: ${this.clients.size}`);
    const aliveSocket = ws as AliveWebSocket;
    aliveSocket.isAlive = true;

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleClientMessage(ws, data);
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.info(`WebSocket disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('pong', () => {
      aliveSocket.isAlive = true;
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    ws.send(
      JSON.stringify({
        type: 'connection:established',
        message: 'Connected to plan updates',
        timestamp: new Date().toISOString(),
      })
    );
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((_meta, socket) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        const aliveSocket = socket as AliveWebSocket;
        if (aliveSocket.isAlive === false) {
          socket.terminate();
          return;
        }

        aliveSocket.isAlive = false;
        socket.ping();
      });
    }, WS_HEARTBEAT_INTERVAL_MS);
  }

  private async authenticateSocket(request: IncomingMessage): Promise<SocketClient | null> {
    try {
      const token = this.extractToken(request);
      if (!token) {
        return null;
      }

      const decoded = jwt.verify(token, getJwtSecret()) as { id?: string };
      if (!decoded?.id) {
        return null;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: decoded.id } });
      if (!user || !user.isActive) {
        return null;
      }

      return {
        userId: user.id,
        role: user.role,
      };
    } catch {
      return null;
    }
  }

  private extractToken(request: IncomingMessage): string | null {
    const host = request.headers.host ?? 'localhost';
    const url = new URL(request.url ?? '/', `http://${host}`);
    const tokenFromQuery = url.searchParams.get('token');
    if (tokenFromQuery) {
      return tokenFromQuery;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }

    return null;
  }

  private canReceiveNotesEvents(role: string): boolean {
    return role === 'admin' || role === 'director' || role === 'manager_auto';
  }

  private handleClientMessage(ws: WebSocket, data: any) {
    switch (data.type) {
      case 'subscribe':
        this.handleSubscribe(ws, data);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        logger.warn(`Unknown WebSocket message type: ${data.type}`);
    }
  }

  private handleSubscribe(ws: WebSocket, data: any) {
    const { categories, years } = data;
    ws.send(
      JSON.stringify({
        type: 'subscription:confirmed',
        categories,
        years,
        timestamp: new Date().toISOString(),
      })
    );

    logger.info(`Client subscribed to categories: ${categories}, years: ${years}`);
  }

  private handleUnsubscribe(ws: WebSocket) {
    ws.send(
      JSON.stringify({
        type: 'unsubscription:confirmed',
        timestamp: new Date().toISOString(),
      })
    );
  }

  broadcastPlanUpdate(event: OutgoingWebSocketEvent) {
    const message = JSON.stringify(event);

    this.clients.forEach((meta, socket) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (isNotesUnreadRefreshEvent(event) && !this.canReceiveNotesEvents(meta.role)) {
        return;
      }

      socket.send(message);
    });

    if (isPlanningV2Event(event)) {
      logger.debug(
        `Broadcasted plan update: ${event.type} for ${event.segmentCode} ${event.year}-${event.month}`
      );
      return;
    }

    if (isFinancialPlanEvent(event)) {
      logger.debug(`Broadcasted financial plan update for ${event.year}`);
      return;
    }

    if (isPlanUpdateEvent(event)) {
      logger.debug(`Broadcasted plan update: ${event.type} for ${event.category} ${event.year}`);
      return;
    }

    if (isNotesUnreadRefreshEvent(event)) {
      logger.debug('Broadcasted notes unread refresh event');
      return;
    }

    logger.debug('Broadcasted plan update');
  }

  notifyPlanningV2SegmentUpdated(params: {
    segmentCode: string;
    year: number;
    month: number;
    userId?: string;
  }) {
    this.broadcastPlanUpdate({
      type: 'planning-v2:segment-updated',
      segmentCode: params.segmentCode,
      year: params.year,
      month: params.month,
      userId: params.userId,
      timestamp: new Date().toISOString(),
    });
  }

  notifyFinancialPlanUpdated(params: { year: number; userId?: string }) {
    this.broadcastPlanUpdate({
      type: 'financial-plan:updated',
      year: params.year,
      userId: params.userId,
      timestamp: new Date().toISOString(),
    });
  }

  notifyNotesUnreadRefresh() {
    this.broadcastPlanUpdate({
      type: 'notes:unread-refresh',
      timestamp: new Date().toISOString(),
    });
  }

  broadcastToCategory(category: PlanCategory, year: number, event: Omit<PlanUpdateEvent, 'category' | 'year'>) {
    const fullEvent: PlanUpdateEvent = {
      ...event,
      category,
      year,
      timestamp: new Date().toISOString(),
    };

    this.broadcastPlanUpdate(fullEvent);
  }

  notifyPlanUpdated(plan: MonthlyPlan, userId?: string) {
    this.broadcastToCategory(plan.category, plan.year, {
      type: 'plan:updated',
      month: plan.month,
      plan,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  notifyPlanRecalculated(category: PlanCategory, year: number, userId?: string) {
    this.broadcastToCategory(category, year, {
      type: 'plan:recalculated',
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  notifyAdminOverride(category: PlanCategory, year: number, month: number, userId?: string) {
    this.broadcastToCategory(category, year, {
      type: 'plan:admin-override',
      month,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.clients.forEach((_meta, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('WebSocket server closed');
  }
}

export const planWebSocketService = new PlanWebSocketService();
