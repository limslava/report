import { Request, Response } from 'express';
import { lookupSinokorBl } from '../services/sinokor-tracking.service';

export const lookupSinokorBlTracking = async (req: Request, res: Response) => {
  const blNo = String(req.params.blNo || '').trim();
  const debug = String(req.query.debug || '') === '1';
  const result = await lookupSinokorBl(blNo, { debug });

  res.status(result.upstream.ok ? 200 : 502).json(result);
};
