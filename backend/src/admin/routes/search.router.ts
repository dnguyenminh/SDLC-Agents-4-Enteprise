// KSA-286: Search Router — Execute search with score breakdown

import { Router } from 'express';
import { AdminModuleDependencies } from '../index.js';
import { createSearchService } from '../services/search.service.js';
import { apiSuccess } from './helpers.js';

export function createSearchRouter(deps: AdminModuleDependencies): Router {
  const router = Router();
  const searchService = createSearchService(deps);

  // POST /api/admin/search/explore
  router.post('/explore', (req, res) => {
    const { query, tier, tags, limit, includeScoreBreakdown } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'query is required and must be non-empty' } });
      return;
    }
    const result = searchService.search({ query: query.trim(), tier, tags, limit, includeScoreBreakdown });
    res.json(apiSuccess(result));
  });

  return router;
}
