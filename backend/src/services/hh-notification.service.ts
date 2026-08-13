import { AppDataSource } from '../config/data-source';
import { User } from '../models/user.model';
import { HhHiringRequest } from '../models/hh-hiring-request.model';
import { sendEmailWithAttachment } from './email.service';
import { logger } from '../utils/logger';

/**
 * Уведомления модуля подбора. Ошибка почты никогда не роняет бизнес-операцию:
 * SMTP может быть не настроен (локальная разработка) — тогда пишем в лог.
 */
export async function notifyRequestAuthorAboutSubmissions(
  requestId: string,
  submittedCount: number,
): Promise<void> {
  try {
    const request = await AppDataSource.getRepository(HhHiringRequest).findOne({
      where: { id: requestId },
      relations: { createdByUser: true },
    });
    const author: User | null = request?.createdByUser ?? null;
    if (!request || !author?.email) return;

    const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || '';
    const link = `${appUrl}/hr/requests?requestId=${request.id}`;
    const subject = `Подбор: кандидаты по заявке «${request.position}»`;
    const html = `
      <p>Здравствуйте, ${author.fullName}!</p>
      <p>Рекрутер отправил вам на рассмотрение кандидатов по заявке
      «<strong>${request.position}</strong>»: ${submittedCount} чел.</p>
      <p><a href="${link}">Открыть заявку и принять решение</a></p>
      <p style="color:#64748b;font-size:12px">Контакты кандидатов ведёт рекрутер:
      в карточках показана профессиональная часть резюме.</p>
    `;
    await sendEmailWithAttachment([author.email], subject, html);
  } catch (error) {
    logger.warn(`HR notification: письмо автору заявки ${requestId} не отправлено: ${(error as Error).message}`);
  }
}
