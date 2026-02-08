import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { dailyReportTemplate, monthlyReportTemplate } from './email-templates';
import { generateExcelReport, generatePdfReport } from './report-generation.service';
import { AppDataSource } from '../config/data-source';
import { SmtpConfig } from '../models/smtp-config.model';

const smtpConfigRepo = AppDataSource.getRepository(SmtpConfig);

/**
 * Получает SMTP конфигурацию из БД (первую запись).
 * Если запись отсутствует, возвращает null.
 */
const getSmtpConfig = async (): Promise<SmtpConfig | null> => {
  try {
    const [config] = await smtpConfigRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return config || null;
  } catch (error) {
    logger.error('Failed to fetch SMTP config:', error);
    return null;
  }
};

/**
 * Создаёт транспортер nodemailer на основе конфигурации из БД.
 * Если конфигурация отсутствует, использует переменные окружения.
 */
const createTransporter = async () => {
  const config = await getSmtpConfig();
  if (config) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }
  // Fallback на переменные окружения
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

const getFromAddress = async (): Promise<string> => {
  const config = await getSmtpConfig();
  if (config?.from) {
    // Проверяем, содержит ли from символ @ (email)
    if (config.from.includes('@')) {
      return config.from;
    }
    // Если from не email, используем user (email) из конфигурации
    if (config.user.includes('@')) {
      return config.user;
    }
  }
  // Если нет from или user, используем переменную окружения или заглушку
  return process.env.SMTP_FROM || config?.user || 'noreply@logistics.example.com';
};

export const sendInvitationEmail = async (
  email: string,
  fullName: string,
  _role: string,
  temporaryPassword: string
) => {
  try {
    logger.info(`Sending invitation email to ${email}`);
    const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://report-limslava.amvera.io').replace(/\/+$/, '');
    const loginUrl = `${frontendBaseUrl}/login`;

    const transporter = await createTransporter();
    const from = await getFromAddress();
    logger.info(`Using SMTP from address: ${from}`);

    const mailOptions = {
      from,
      to: email,
      subject: 'Доступ к системе мониторинга логистики',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>Здравствуйте, ${fullName}!</h2>
          <p>Вам предоставлен доступ к системе мониторинга логистики.</p>
          <p><strong>Данные для входа:</strong></p>
          <ul>
            <li><strong>Логин:</strong> ${email}</li>
            <li><strong>Пароль:</strong> ${temporaryPassword}</li>
            <li><strong>Ссылка для входа:</strong> <a href="${loginUrl}">${loginUrl}</a></li>
          </ul>
          <p>Рекомендуем сменить пароль после первого входа.</p>
          <hr>
          <p style="color: #666;">Это автоматическое сообщение, пожалуйста, не отвечайте на него.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Invitation email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send invitation email:', error);
    // Не прерываем регистрацию из-за ошибки email
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  fullName: string,
  resetToken: string
) => {
  try {
    logger.info(`Sending password reset email to ${email}`);
    const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://report-limslava.amvera.io').replace(/\/+$/, '');
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const transporter = await createTransporter();
    const from = await getFromAddress();

    const mailOptions = {
      from,
      to: email,
      subject: 'Сброс пароля',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>Здравствуйте, ${fullName}!</h2>
          <p>Вы запросили сброс пароля.</p>
          <p>Перейдите по ссылке, чтобы задать новый пароль:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>Ссылка действует 1 час.</p>
          <hr>
          <p style="color: #666;">Если вы не запрашивали сброс пароля — просто игнорируйте это письмо.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
  }
};

export const sendEmailWithAttachment = async (
  to: string | string[],
  subject: string,
  html: string,
  attachment?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }
) => {
  try {
    const transporter = await createTransporter();
    const from = await getFromAddress();

    const mailOptions: any = {
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    };

    if (attachment) {
      mailOptions.attachments = [
        {
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        },
      ];
    }

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to} with subject "${subject}"`);
  } catch (error) {
    logger.error('Failed to send email with attachment:', error);
    throw error;
  }
};

export const sendDailyReportEmail = async (
  email: string | string[],
  department: string,
  date: string,
  metrics: any,
  attachmentFormat: 'excel' | 'pdf' = 'excel'
) => {
  try {
    // Примерные данные для отчета (в реальности берутся из БД)
    const plan = metrics?.plan || 0;
    const actual = metrics?.actual || 0;
    const completion = plan > 0 ? (actual / plan) * 100 : 0;

    const html = dailyReportTemplate(department as any, date, plan, actual, completion, metrics);

    let attachment = undefined;
    if (attachmentFormat === 'excel') {
      const excelBuffer = await generateExcelReport([metrics]);
      attachment = {
        filename: `daily_report_${department}_${date}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      const pdfBuffer = await generatePdfReport([metrics]);
      attachment = {
        filename: `daily_report_${department}_${date}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      };
    }

    await sendEmailWithAttachment(email, `Отчет по ${department} за ${date}`, html, attachment);
    logger.info(`Daily report email sent to ${email} for ${department} on ${date}`);
  } catch (error) {
    logger.error('Failed to send daily report email:', error);
    throw error;
  }
};

export const sendMonthlyReportEmail = async (
  email: string | string[],
  department: string,
  year: number,
  month: number,
  reportData: any,
  attachmentFormat: 'excel' | 'pdf' = 'excel'
) => {
  try {
    const basePlan = reportData?.basePlan || 0;
    const actual = reportData?.actual || 0;
    const adjustedPlan = reportData?.adjustedPlan || 0;
    const completion = adjustedPlan > 0 ? (actual / adjustedPlan) * 100 : 0;

    const html = monthlyReportTemplate(
      department as any,
      year,
      month,
      basePlan,
      actual,
      adjustedPlan,
      completion,
      reportData.summary
    );

    let attachment = undefined;
    if (attachmentFormat === 'excel') {
      const excelBuffer = await generateExcelReport([reportData]);
      attachment = {
        filename: `monthly_report_${department}_${year}_${month}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      const pdfBuffer = await generatePdfReport([reportData]);
      attachment = {
        filename: `monthly_report_${department}_${year}_${month}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      };
    }

    await sendEmailWithAttachment(
      email,
      `Сводный отчет по ${department} за ${month}/${year}`,
      html,
      attachment
    );
    logger.info(`Monthly report email sent to ${email} for ${department} ${year}-${month}`);
  } catch (error) {
    logger.error('Failed to send monthly report email:', error);
    throw error;
  }
};
