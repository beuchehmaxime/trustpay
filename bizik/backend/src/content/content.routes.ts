import { Router } from 'express';

import { ContentController } from './content.controller';

/**
 * PUBLIC marketing content - no authentication. Serves only published blog
 * posts, help articles and legal documents to the marketing site (SSR/SSG).
 * Mounted at /api/v1.
 */
const router = Router();

router.get('/fees', ContentController.fees);
/** Enabled markets, for every country picker (signup, KYC, profile). */
router.get('/countries', ContentController.countries);
router.get('/blog', ContentController.blogList);
router.get('/blog/categories', ContentController.blogCategories); // before :slug
router.get('/blog/:slug', ContentController.blogPost);

router.get('/help', ContentController.helpList);
router.get('/help/:slug', ContentController.helpArticle);

router.get('/legal/:type', ContentController.legal);

router.post('/contact', ContentController.contact);

export default router;
