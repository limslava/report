import { Server as HttpServer } from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { MonthlyPlan, PlanCategory } from '../models/monthly-plans.model';

export interface PlanUpdateEvent {
  type: 'plan:updated' | 'plan:recalculated' | 'plan:admin-override';
  category: PlanCategory;
  year: number;
  month?: number;
  plan?: MonthlyPlan;
  timestamp: string;
  userId?: string;
}

export class PlanWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  initialize(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws/plans' });
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info(`New WebSocket connection. Total clients: ${this.clients.size}`);

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

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

      // Отправляем приветственное сообщение
      ws.send(JSON.stringify({
        type: 'connection:established',
        message: 'Connected to plan updates',
        timestamp: new Date().toISOString(),
      }));
    });

    logger.info('WebSocket server initialized on /ws/plans');
  }

  private handleClientMessage(ws: WebSocket, data: any) {
    switch (data.type) {
      case 'subscribe':
        this.handleSubscribe(ws, data);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, data);
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
    
    // В реальном приложении здесь можно сохранить подписки клиента
    ws.send(JSON.stringify({
      type: 'subscription:confirmed',
      categories,
      years,
      timestamp: new Date().toISOString(),
    }));
    
    logger.info(`Client subscribed to categories: ${categories}, years: ${years}`);
  }

  private handleUnsubscribe(ws: WebSocket, _data: any) {
    ws.send(JSON.stringify({
      type: 'unsubscription:confirmed',
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Отправить событие обновления плана всем подключенным клиентам
   */
  broadcastPlanUpdate(event: PlanUpdateEvent) {
    const message = JSON.stringify(event);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    logger.debug(`Broadcasted plan update: ${event.type} for ${event.category} ${event.year}`);
  }

  /**
   * Отправить событие обновления плана конкретной категории и года
   */
  broadcastToCategory(category: PlanCategory, year: number, event: Omit<PlanUpdateEvent, 'category' | 'year'>) {
    const fullEvent: PlanUpdateEvent = {
      ...event,
      category,
      year,
      timestamp: new Date().toISOString(),
    };
    
    this.broadcastPlanUpdate(fullEvent);
  }

  /**
   * Уведомить об обновлении конкретного плана
   */
  notifyPlanUpdated(plan: MonthlyPlan, userId?: string) {
    this.broadcastToCategory(plan.category, plan.year, {
      type: 'plan:updated',
      month: plan.month,
      plan,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Уведомить о пересчете планов
   */
  notifyPlanRecalculated(category: PlanCategory, year: number, userId?: string) {
    this.broadcastToCategory(category, year, {
      type: 'plan:recalculated',
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Уведомить о действии администратора
   */
  notifyAdminOverride(category: PlanCategory, year: number, month: number, userId?: string) {
    this.broadcastToCategory(category, year, {
      type: 'plan:admin-override',
      month,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Получить количество подключенных клиентов
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Закрыть все соединения
   */
  close() {
    this.clients.forEach((client) => {
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

// Синглтон экземпляр
export const planWebSocketService = new PlanWebSocketService();