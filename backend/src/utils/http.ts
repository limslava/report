import { Response } from 'express';

type ErrorPayload = {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
};

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  extra?: Partial<ErrorPayload>
): Response {
  return res.status(statusCode).json({
    error: message,
    message,
    statusCode,
    ...extra,
  });
}
